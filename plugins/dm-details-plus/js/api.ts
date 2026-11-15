import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

interface HttpModule {
	get(request: { url: string }): Promise<{ status?: number; body?: any }>
}

/** Discord's REST helper; it adds authentication itself. */
function http() {
	const [module] = lookupModule(
		withProps<HttpModule & { getAPIBaseURL(): string }>('getAPIBaseURL', 'get'),
	)
	if (!module) throw new Error("Couldn't find Discord's HTTP module")
	return module as HttpModule
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const CDN = 'https://cdn.discordapp.com'

export type Kind = 'stickers' | 'emoji' | 'pins' | 'links'

/** One tile in a grid. */
export interface Item {
	key: string
	/** Image to show, or none for a text tile. */
	image?: string
	/** Text tile title (and toast / alert title). */
	title: string
	/** Second line on text tiles. */
	subtitle?: string
	/** Full text, shown when a pin is tapped. */
	body?: string
	/** URL opened when a link is tapped. */
	href?: string
	count: number
	/** Avatar of whoever sent it (most recently). */
	senderAvatar?: string
}

type Found = Omit<Item, 'count'>

function avatarOf(author: any): string | undefined {
	if (!author?.id || !author.avatar) return undefined
	return `${CDN}/avatars/${author.id}/${author.avatar}.png?size=32`
}

const nameOf = (author: any): string =>
	author?.global_name || author?.globalName || author?.username || 'Someone'

/** Shrinks Discord media proxy images, which is much faster to load. */
function thumb(url: string | undefined, size = 240): string | undefined {
	if (!url) return undefined
	if (!url.includes('discordapp.net')) return url
	return `${url}${url.includes('?') ? '&' : '?'}width=${size}&height=${size}`
}

function hostOf(url: string): string {
	return url.replace(/^https?:\/\//, '').split(/[/?#]/)[0]
}

/** Discord search: one page of messages for a `has:` filter. */
async function searchPage(channelId: string, has: string, offset: number) {
	for (let attempt = 0; ; attempt++) {
		const res = await http().get({
			url: `/channels/${channelId}/messages/search?has=${has}&offset=${offset}`,
		})
		// 202: still indexing this conversation; try again shortly.
		if (res.status === 202 && attempt < 5) {
			await sleep((res.body?.retry_after ?? 1) * 1000)
			continue
		}
		const messages = ((res.body?.messages ?? []) as any[][]).flat()
		return { messages, total: Number(res.body?.total_results ?? 0) }
	}
}

/** A paged source: each call returns the next batch of found items. */
type Source = () => Promise<{ found: Found[]; done: boolean; progress: string }>

function searchSource(
	channelId: string,
	has: string,
	label: string,
	extract: (message: any) => Found[],
): Source {
	let offset = 0
	return async () => {
		const { messages, total } = await searchPage(channelId, has, offset)
		offset += messages.length
		return {
			found: messages.flatMap(extract),
			done: !messages.length || offset >= total,
			progress: `${Math.min(offset, total)} of ${total} ${label}`,
		}
	}
}

function stickerSource(channelId: string): Source {
	return searchSource(channelId, 'sticker', 'sticker messages', m =>
		(m?.sticker_items ?? []).map((s: any) => ({
			key: s.id,
			title: s.name,
			// 3 = Lottie, which can't be shown as an image.
			image:
				s.format_type === 3
					? undefined
					: `https://media.discordapp.net/stickers/${s.id}.${s.format_type === 4 ? 'gif' : 'png'}?size=160`,
			senderAvatar: avatarOf(m.author),
		})),
	)
}

const URL_PATTERN = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g

function linkSource(channelId: string): Source {
	return searchSource(channelId, 'link', 'link messages', m => {
		const found: Found[] = []
		const seen = new Set<string>()
		for (const e of m?.embeds ?? []) {
			if (!e?.url || seen.has(e.url)) continue
			seen.add(e.url)
			found.push({
				key: e.url,
				href: e.url,
				title: e.title || e.provider?.name || hostOf(e.url),
				subtitle: hostOf(e.url),
				image: thumb(e.thumbnail?.proxy_url ?? e.image?.proxy_url),
				senderAvatar: avatarOf(m.author),
			})
		}
		for (const [url] of String(m?.content ?? '').matchAll(URL_PATTERN)) {
			if (seen.has(url)) continue
			seen.add(url)
			found.push({
				key: url,
				href: url,
				title: hostOf(url),
				subtitle: url.replace(/^https?:\/\//, ''),
				senderAvatar: avatarOf(m.author),
			})
		}
		return found
	})
}

function pinItem(m: any): Found {
	const attachment = (m?.attachments ?? []).find((a: any) =>
		String(a?.content_type ?? '').startsWith('image/'),
	)
	const embed = (m?.embeds ?? []).find(
		(e: any) => e?.thumbnail?.proxy_url || e?.image?.proxy_url,
	)
	const text = String(m?.content ?? '').trim()
	const extras = [
		...(m?.attachments ?? []).map((a: any) => `[${a.filename}]`),
		...(m?.sticker_items ?? []).map((s: any) => `[sticker: ${s.name}]`),
	]
	return {
		key: m.id,
		title: nameOf(m.author),
		subtitle: text || extras.join(' ') || '(no text)',
		body: [text, ...extras].filter(Boolean).join('\n'),
		image: thumb(
			attachment?.proxy_url ??
				embed?.thumbnail?.proxy_url ??
				embed?.image?.proxy_url,
		),
		senderAvatar: avatarOf(m.author),
	}
}

function pinSource(channelId: string): Source {
	let before: string | undefined
	let legacy = false
	let total = 0
	return async () => {
		if (!legacy) {
			try {
				const res = await http().get({
					url: `/channels/${channelId}/messages/pins?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`,
				})
				const entries: any[] = res.body?.items ?? []
				before = entries.at(-1)?.pinned_at
				total += entries.length
				return {
					found: entries.map(e => pinItem(e.message)),
					done: !res.body?.has_more,
					progress: `${total} pinned messages`,
				}
			} catch {
				legacy = true // Older API: all pins in one list.
			}
		}
		const res = await http().get({ url: `/channels/${channelId}/pins` })
		const messages: any[] = Array.isArray(res.body) ? res.body : []
		return {
			found: messages.map(pinItem),
			done: true,
			progress: `${messages.length} pinned messages`,
		}
	}
}

const CUSTOM_EMOJI = /<(a?):(\w{2,32}):(\d{17,20})>/g

function emojiFrom(message: any): Found[] {
	return [...String(message?.content ?? '').matchAll(CUSTOM_EMOJI)].map(
		([, animated, name, id]) => ({
			key: id,
			title: `:${name}:`,
			image: `${CDN}/emojis/${id}.${animated ? 'gif' : 'png'}?size=64`,
			senderAvatar: avatarOf(message.author),
		}),
	)
}

/** Messages Discord already has in memory for a channel, newest first. */
function cachedMessages(channelId: string): any[] {
	const messages = (Stores.MessageStore as any)?.getMessages?.(channelId)
	const list: any[] = messages?.toArray?.() ?? messages?._array ?? []
	return [...list].reverse()
}

function emojiSource(channelId: string): Source {
	let before: string | undefined
	let scanned = 0
	let seeded = false
	return async () => {
		// First batch: instant, from messages Discord already loaded.
		if (!seeded) {
			seeded = true
			const cached = cachedMessages(channelId)
			if (cached.length) {
				before = cached.at(-1)?.id
				scanned += cached.length
				return {
					found: cached.flatMap(emojiFrom),
					done: false,
					progress: `Scanned ${scanned} messages`,
				}
			}
		}
		const res = await http().get({
			url: `/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ''}`,
		})
		const messages: any[] = Array.isArray(res.body) ? res.body : []
		scanned += messages.length
		before = messages.at(-1)?.id ?? before
		const done = messages.length < 100
		return {
			found: messages.flatMap(emojiFrom),
			done,
			progress: `Scanned ${scanned} messages${done ? ' (all)' : ''}`,
		}
	}
}

const SOURCES: Record<Kind, (channelId: string) => Source> = {
	stickers: stickerSource,
	emoji: emojiSource,
	pins: pinSource,
	links: linkSource,
}

/** Cached, shared loader for one tab of one channel. */
export class Collector {
	items: Item[] = []
	done = false
	loading = false
	error?: string
	progress = ''
	private map = new Map<string, Item>()
	private source: Source
	private inflight?: Promise<void>
	private listeners = new Set<() => void>()

	private kind: Kind
	private channelId: string

	constructor(kind: Kind, channelId: string) {
		this.kind = kind
		this.channelId = channelId
		this.source = SOURCES[kind](channelId)
	}

	subscribe(listener: () => void) {
		this.listeners.add(listener)
		return () => {
			this.listeners.delete(listener)
		}
	}

	private emit() {
		for (const l of this.listeners) l()
	}

	/**
	 * Loads the next batches until something new shows up (at most
	 * `maxBatches`). Concurrent calls share one request.
	 */
	loadMore(maxBatches = 4): Promise<void> {
		if (this.done) return Promise.resolve()
		if (this.inflight) return this.inflight
		this.loading = true
		this.error = undefined
		this.emit()
		this.inflight = (async () => {
			try {
				const before = this.map.size
				for (let i = 0; i < maxBatches && !this.done; i++) {
					const batch = await this.source()
					for (const f of batch.found) {
						const existing = this.map.get(f.key)
						// New object, so memoised tiles see the new count.
						this.map.set(
							f.key,
							existing
								? { ...existing, count: existing.count + 1 }
								: { ...f, count: 1 },
						)
					}
					this.done = batch.done
					this.progress = batch.progress
					this.items = [...this.map.values()]
					if (this.map.size > before) break
				}
			} catch (e: any) {
				this.error = e?.body?.message ?? e?.message ?? String(e)
			} finally {
				this.loading = false
				this.inflight = undefined
				this.emit()
			}
		})()
		return this.inflight
	}

	/** Starts loading if nothing has been loaded yet. */
	prefetch() {
		if (!this.items.length && !this.done && !this.error) this.loadMore()
	}

	/** Forgets everything and loads again (pull to refresh). */
	async refresh() {
		await this.inflight
		this.map.clear()
		this.items = []
		this.done = false
		this.progress = ''
		this.source = SOURCES[this.kind](this.channelId)
		await this.loadMore()
	}
}

/** Loaded tabs stay in memory for the session, so reopening is instant. */
const collectors = new Map<string, Collector>()

export function getCollector(kind: Kind, channelId: string): Collector {
	const key = `${kind}:${channelId}`
	let collector = collectors.get(key)
	if (!collector) {
		collector = new Collector(kind, channelId)
		collectors.set(key, collector)
	}
	return collector
}

export function clearCollectors() {
	collectors.clear()
}

/** The channel shown on screen when no channel ID can be read from the tabs. */
export function selectedChannelId(): string | undefined {
	return (Stores.SelectedChannelStore as any)?.getChannelId?.()
}

export function channelType(channelId: string | undefined): number | undefined {
	if (!channelId) return undefined
	return (Stores.ChannelStore as any)?.getChannel?.(channelId)?.type
}
