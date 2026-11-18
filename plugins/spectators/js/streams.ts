import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

/** One stream and who is watching it. */
export interface StreamInfo {
	key: string
	ownerId: string
	guildId?: string
	channelId?: string
	/** Viewer user ids, without the streamer. */
	viewers: string[]
	mine: boolean
}

export const store = () => (Stores as any).ApplicationStreamingStore as any

let encoder: ((stream: any) => string) | null | undefined
function encode(stream: any): string {
	if (typeof stream?.streamKey === 'string') return stream.streamKey
	if (encoder === undefined)
		try {
			const mod: any = (
				lookupModule((withProps as any)('encodeStreamKey')) as any
			)?.[0]
			encoder =
				typeof mod?.encodeStreamKey === 'function' ? mod.encodeStreamKey : null
		} catch {
			encoder = null
		}
	if (encoder)
		try {
			const key = encoder(stream)
			if (typeof key === 'string' && key) return key
		} catch {}
	// Discord's own key format: guild:<guild>:<channel>:<owner> or call:<channel>:<owner>.
	return stream?.guildId
		? `guild:${stream.guildId}:${stream.channelId}:${stream.ownerId}`
		: `call:${stream?.channelId}:${stream?.ownerId}`
}

function viewersOf(s: any, stream: any, key: string): string[] {
	let ids: unknown
	for (const arg of [stream, key]) {
		try {
			ids = s?.getViewerIds?.(arg)
		} catch {
			ids = undefined
		}
		if (Array.isArray(ids)) break
	}
	if (!Array.isArray(ids)) return []
	const owner = String(stream?.ownerId ?? '')
	return [...new Set(ids.map(String))].filter(id => id && id !== owner)
}

/** Your stream (if any) and the streams you are watching, with their viewers. */
export function readStreams(): StreamInfo[] {
	const s = store()
	if (!s) return []
	const me = (Stores as any).UserStore?.getCurrentUser?.()?.id
	const found = new Map<string, StreamInfo>()
	const add = (stream: any) => {
		if (!stream?.ownerId) return
		const key = encode(stream)
		if (found.has(key)) return
		found.set(key, {
			key,
			ownerId: String(stream.ownerId),
			guildId: stream.guildId ?? undefined,
			channelId: stream.channelId ?? undefined,
			viewers: viewersOf(s, stream, key),
			mine: !!me && String(stream.ownerId) === me,
		})
	}
	try {
		add(s.getCurrentUserActiveStream?.())
	} catch {}
	try {
		const watching = s.getAllActiveStreams?.()
		if (Array.isArray(watching)) for (const stream of watching) add(stream)
	} catch {}
	return [...found.values()].sort((a, b) => Number(b.mine) - Number(a.mine))
}

/** Which of the store's methods exist here, for the settings page. */
export function storeStatus(): string {
	const s = store()
	if (!s) return 'Not loaded yet: join a voice channel once'
	const methods = [
		'getCurrentUserActiveStream',
		'getAllActiveStreams',
		'getViewerIds',
	].filter(name => typeof s[name] === 'function')
	return methods.length === 3
		? 'Ready'
		: `Partly available: ${methods.join(', ') || 'none'}`
}

export function nameOf(userId: string, guildId?: string): string {
	try {
		const nick = guildId
			? (Stores as any).GuildMemberStore?.getNick?.(guildId, userId)
			: undefined
		const user = (Stores as any).UserStore?.getUser?.(userId)
		return (
			nick ||
			user?.globalName ||
			user?.global_name ||
			user?.username ||
			'Someone'
		)
	} catch {
		return 'Someone'
	}
}

export function avatarOf(userId: string, guildId?: string): string | undefined {
	try {
		const user = (Stores as any).UserStore?.getUser?.(userId)
		const url = user?.getAvatarURL?.(guildId, 64)
		return typeof url === 'string' ? url : undefined
	} catch {
		return undefined
	}
}
