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

/** Something sent in the conversation: a sticker or a custom emoji. */
export interface Item {
	id: string
	name: string
	/** Image URL, or `null` for stickers that can't be shown as an image (Lottie). */
	url: string | null
	count: number
	/** Avatar of whoever sent it most recently. */
	senderAvatar?: string
}

const CDN = 'https://cdn.discordapp.com'

function avatarOf(author: any): string | undefined {
	if (!author?.id || !author.avatar) return undefined
	return `${CDN}/avatars/${author.id}/${author.avatar}.png?size=32`
}

/** Sticker format types: 1 PNG, 2 APNG, 3 Lottie, 4 GIF. */
function stickerUrl(id: string, format: number): string | null {
	if (format === 3) return null
	const ext = format === 4 ? 'gif' : 'png'
	return `https://media.discordapp.net/stickers/${id}.${ext}?size=160`
}

function emojiUrl(id: string, animated: boolean) {
	return `${CDN}/emojis/${id}.${animated ? 'gif' : 'png'}?size=96`
}

/** Adds an occurrence, keeping first-seen (newest) order. */
function add(map: Map<string, Item>, item: Omit<Item, 'count'>) {
	const existing = map.get(item.id)
	if (existing) existing.count++
	else map.set(item.id, { ...item, count: 1 })
}

export interface Collector {
	items: Item[]
	done: boolean
	/** Progress text, such as how many messages were scanned. */
	progress: string
	loadMore(): Promise<void>
}

/** Stickers in a channel, via Discord's `has: sticker` search. */
export function createStickerCollector(channelId: string): Collector {
	const found = new Map<string, Item>()
	let offset = 0
	let total = Number.POSITIVE_INFINITY

	const collector: Collector = {
		items: [],
		done: false,
		progress: '',
		async loadMore() {
			if (collector.done) return
			for (let attempt = 0; ; attempt++) {
				const res = await http().get({
					url: `/channels/${channelId}/messages/search?has=sticker&offset=${offset}`,
				})
				// 202: Discord is still indexing this conversation; try again shortly.
				if (res.status === 202 && attempt < 5) {
					await sleep((res.body?.retry_after ?? 2) * 1000)
					continue
				}
				const groups: any[][] = res.body?.messages ?? []
				total = res.body?.total_results ?? 0
				for (const group of groups)
					for (const message of group) {
						offset++
						for (const s of message?.sticker_items ?? [])
							add(found, {
								id: s.id,
								name: s.name,
								url: stickerUrl(s.id, s.format_type),
								senderAvatar: avatarOf(message.author),
							})
					}
				if (!groups.length || offset >= total) collector.done = true
				break
			}
			collector.items = [...found.values()]
			collector.progress = `${Math.min(offset, total)} of ${total} sticker messages`
		},
	}
	return collector
}

const CUSTOM_EMOJI = /<(a?):(\w{2,32}):(\d{17,20})>/g

/** Custom emoji in a channel, found by scanning its messages. */
export function createEmojiCollector(channelId: string): Collector {
	const found = new Map<string, Item>()
	let before: string | undefined
	let scanned = 0

	const collector: Collector = {
		items: [],
		done: false,
		progress: '',
		async loadMore() {
			if (collector.done) return
			const query = `limit=100${before ? `&before=${before}` : ''}`
			const res = await http().get({
				url: `/channels/${channelId}/messages?${query}`,
			})
			const messages: any[] = Array.isArray(res.body) ? res.body : []
			for (const message of messages) {
				scanned++
				for (const [, animated, name, id] of String(
					message?.content ?? '',
				).matchAll(CUSTOM_EMOJI))
					add(found, {
						id,
						name,
						url: emojiUrl(id, animated === 'a'),
						senderAvatar: avatarOf(message.author),
					})
			}
			before = messages.at(-1)?.id
			if (messages.length < 100) collector.done = true
			collector.items = [...found.values()]
			collector.progress = `Scanned ${scanned} messages${collector.done ? ' (all)' : ''}`
		},
	}
	return collector
}

/** The channel shown on screen when no channel ID can be read from the tabs. */
export function selectedChannelId(): string | undefined {
	return (Stores.SelectedChannelStore as any)?.getChannelId?.()
}

export function channelType(channelId: string | undefined): number | undefined {
	if (!channelId) return undefined
	return (Stores.ChannelStore as any)?.getChannel?.(channelId)?.type
}
