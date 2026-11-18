import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

/**
 * Forum posts from `GET /channels/{forum}/threads/search` (Discord Userdoccers, resources/channel):
 * threads, the current user's thread memberships (followed posts) and, in forums, each post's
 * first message. A 202 "index not yet available" answer is retried after `retry_after`.
 * Requests go through Discord's own REST helper, which adds the account's auth itself.
 */

interface Http {
	get(req: { url: string }): Promise<{ status?: number; body?: any }>
	post(req: { url: string; body?: unknown }): Promise<{ body?: any }>
}
function http(): Http {
	const [found] = lookupModule(
		(withProps as any)('getAPIBaseURL', 'get', 'post', 'del'),
	) as unknown as [Http | undefined]
	if (!found) throw new Error("Couldn't find Discord's request helper")
	return found
}

export function errorText(error: unknown): string {
	const e = error as { body?: any; status?: number; message?: string }
	return e?.body?.message ?? (e?.status ? `HTTP ${e.status}` : (e?.message ?? String(error)))
}

const S = () => Stores as any
export const myId = (): string | undefined => S().UserStore?.getCurrentUser?.()?.id

export interface Tag {
	id: string
	name: string
	emoji?: string
}

export interface Post {
	id: string
	guildId: string
	name: string
	ownerId?: string
	tags: string[]
	replies: number
	created: number
	lastActive: number
	lastMessageId?: string
	pinned: boolean
	followed: boolean
	image?: string
	reactions: number
	preview: string
}

/** Milliseconds since 1970 from a Discord ID. */
export const idTime = (id?: string | null) => {
	if (!id || !/^\d+$/.test(id)) return 0
	try {
		return Number(BigInt(id) >> 22n) + 1420070400000
	} catch {
		return 0
	}
}

const IMAGE = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i

function imageOf(message: any): string | undefined {
	for (const a of message?.attachments ?? []) {
		const type = String(a?.content_type ?? '')
		if (type.startsWith('image/') || IMAGE.test(String(a?.filename ?? a?.url ?? '')))
			return a.proxy_url ?? a.url
		if (type.startsWith('video/') && a?.proxy_url)
			return `${a.proxy_url}${a.proxy_url.includes('?') ? '&' : '?'}format=webp`
	}
	for (const e of message?.embeds ?? []) {
		const img = e?.image?.proxy_url ?? e?.image?.url ?? e?.thumbnail?.proxy_url ?? e?.thumbnail?.url
		if (img) return img
	}
	return undefined
}

export function forumTags(forumId: string): Tag[] {
	const channel = S().ChannelStore?.getChannel?.(forumId)
	const raw: any[] = channel?.availableTags ?? channel?.available_tags ?? []
	return raw
		.filter(t => t?.id)
		.map(t => ({
			id: String(t.id),
			name: String(t.name ?? ''),
			emoji: t.emojiName ?? t.emoji_name ?? undefined,
		}))
}

export function toPost(thread: any, first: any, joined: Set<string>): Post {
	const id = String(thread.id)
	const meta = thread.thread_metadata ?? thread.threadMetadata ?? {}
	const created = Date.parse(meta.create_timestamp ?? meta.createTimestamp ?? '') || idTime(id)
	const lastMessageId = thread.last_message_id ?? thread.lastMessageId ?? undefined
	const reactions = (first?.reactions ?? []).reduce(
		(sum: number, r: any) => sum + (Number(r?.count) || 0),
		0,
	)
	return {
		id,
		guildId: String(thread.guild_id ?? thread.guildId ?? ''),
		name: String(thread.name ?? ''),
		ownerId: thread.owner_id ?? thread.ownerId,
		tags: (thread.applied_tags ?? thread.appliedTags ?? []).map(String),
		replies: Number(thread.message_count ?? thread.messageCount ?? 0),
		created,
		lastActive: Math.max(idTime(lastMessageId), created),
		lastMessageId: lastMessageId ? String(lastMessageId) : undefined,
		pinned: ((Number(thread.flags) || 0) & 2) === 2,
		followed: joined.has(id),
		image: imageOf(first),
		reactions,
		preview: String(first?.content ?? '').slice(0, 140),
	}
}

export type ServerSort = 'last_message_time' | 'creation_time'

export interface Page {
	posts: Post[]
	hasMore: boolean
	total: number
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function searchPosts(
	forumId: string,
	opts: { sort: ServerSort; order: 'asc' | 'desc'; offset: number; name?: string; tags?: string[] },
): Promise<Page> {
	const q = [
		`sort_by=${opts.sort}`,
		`sort_order=${opts.order}`,
		'limit=25',
		`offset=${opts.offset}`,
	]
	if (opts.name?.trim()) q.push(`name=${encodeURIComponent(opts.name.trim().slice(0, 100))}`)
	for (const tag of opts.tags ?? []) q.push(`tag=${tag}`)
	if ((opts.tags?.length ?? 0) > 1) q.push('tag_setting=match_some')
	const url = `/channels/${forumId}/threads/search?${q.join('&')}`
	for (let attempt = 0; attempt < 4; attempt++) {
		const res = await http().get({ url })
		const body = res.body ?? {}
		if (res.status === 202 || (body.code === 110000 && !body.threads)) {
			await wait(Math.max(1, Number(body.retry_after) || 1) * 1000)
			continue
		}
		const joined = new Set<string>((body.members ?? []).map((m: any) => String(m?.id ?? m?.thread_id)))
		const firsts = new Map<string, any>()
		for (const m of body.first_messages ?? []) firsts.set(String(m?.channel_id ?? m?.id), m)
		const posts = (body.threads ?? []).map((t: any) => toPost(t, firsts.get(String(t.id)), joined))
		return { posts, hasMore: !!body.has_more, total: Number(body.total_results) || posts.length }
	}
	throw new Error('Discord is still indexing this forum, try again in a moment')
}

export const isUnread = (post: Post): boolean => {
	try {
		return !!S().ReadStateStore?.hasUnread?.(post.id)
	} catch {
		return false
	}
}

/** Marks [posts] read up to their last message, 100 per request. */
export async function markRead(posts: Post[]): Promise<number> {
	const states = posts
		.filter(p => p.lastMessageId)
		.map(p => ({ channel_id: p.id, message_id: p.lastMessageId, read_state_type: 0 }))
	for (let i = 0; i < states.length; i += 100)
		await http().post({ url: '/read-states/ack-bulk', body: { read_states: states.slice(i, i + 100) } })
	return states.length
}

/** Opens a post the way Discord's own links do (an in-app route push). */
export function openPost(post: Post): boolean {
	const [routing] = lookupModule((withProps as any)('transitionToGuild')) as unknown as [any]
	const path = `/channels/${post.guildId || '@me'}/${post.id}`
	try {
		if (typeof routing?.transitionTo === 'function') {
			routing.transitionTo(path)
			return true
		}
	} catch {}
	try {
		const [actions] = lookupModule((withProps as any)('selectChannel')) as unknown as [any]
		if (typeof actions?.selectChannel === 'function') {
			actions.selectChannel({ guildId: post.guildId, channelId: post.id })
			return true
		}
	} catch {}
	return false
}

// Filtering and sorting that the search endpoint can't do.

export interface Filters {
	query: string
	tags: string[]
	unread: boolean
	followed: boolean
	images: boolean
	mine: boolean
	since: 'any' | 'day' | 'week' | 'month'
	minReactions: number
	sort: 'active' | 'newest' | 'oldest' | 'replies' | 'reactions'
}

export const DEFAULT_FILTERS: Filters = {
	query: '',
	tags: [],
	unread: false,
	followed: false,
	images: false,
	mine: false,
	since: 'any',
	minReactions: 0,
	sort: 'active',
}

export type PinnedMode = 'first' | 'normal' | 'hidden'

const SINCE = { day: 864e5, week: 7 * 864e5, month: 30 * 864e5 }

export function serverSort(f: Filters): { sort: ServerSort; order: 'asc' | 'desc' } {
	if (f.sort === 'newest') return { sort: 'creation_time', order: 'desc' }
	if (f.sort === 'oldest') return { sort: 'creation_time', order: 'asc' }
	return { sort: 'last_message_time', order: 'desc' }
}

export function applyFilters(
	posts: Post[],
	f: Filters,
	pinned: PinnedMode,
	now = Date.now(),
	unread: (p: Post) => boolean = isUnread,
	me = myId(),
): Post[] {
	const q = f.query.trim().toLowerCase()
	const out = posts.filter(p => {
		if (pinned === 'hidden' && p.pinned) return false
		if (q && !p.name.toLowerCase().includes(q) && !p.preview.toLowerCase().includes(q)) return false
		if (f.tags.length && !f.tags.some(t => p.tags.includes(t))) return false
		if (f.followed && !p.followed) return false
		if (f.images && !p.image) return false
		if (f.mine && p.ownerId !== me) return false
		if (f.since !== 'any' && now - p.created > SINCE[f.since]) return false
		if (f.minReactions && p.reactions < f.minReactions) return false
		if (f.unread && !unread(p)) return false
		return true
	})
	const by: Record<Filters['sort'], (a: Post, b: Post) => number> = {
		active: (a, b) => b.lastActive - a.lastActive,
		newest: (a, b) => b.created - a.created,
		oldest: (a, b) => a.created - b.created,
		replies: (a, b) => b.replies - a.replies,
		reactions: (a, b) => b.reactions - a.reactions,
	}
	out.sort(by[f.sort])
	if (pinned === 'first') out.sort((a, b) => Number(b.pinned) - Number(a.pinned))
	return out
}
