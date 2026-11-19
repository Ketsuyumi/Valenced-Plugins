import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

export const S = () => Stores as any

export interface Settings {
	autoWatch: boolean
	autoFocus: boolean
	autoNext: boolean
	notify: boolean
	ignoreOwn: boolean
	showBar: boolean
	/** Clean view on: other tiles, the stream's own overlays and the call controls are hidden. */
	clean: boolean
	cleanHidesTiles: boolean
	cleanHidesControls: boolean
}
export const DEFAULTS: Settings = {
	autoWatch: true,
	autoFocus: true,
	autoNext: true,
	notify: true,
	ignoreOwn: true,
	showBar: true,
	clean: false,
	cleanHidesTiles: true,
	cleanHidesControls: true,
}
let storage: any
export const bindStorage = (s: any) => {
	storage = s
}
export const settings = (): Settings => ({
	...DEFAULTS,
	...(storage?.cache ?? {}),
})
export const save = (patch: Partial<Settings>) => {
	void storage?.set?.({ ...settings(), ...patch })
	changed()
}
/** Settings as a hook (redraws when they change). Call every render. */
export function useSettings(): Settings {
	try {
		storage?.use?.()
	} catch {}
	return settings()
}

const listeners = new Set<() => void>()
export function onChange(fn: () => void): () => void {
	listeners.add(fn)
	return () => listeners.delete(fn)
}
export function changed() {
	for (const fn of listeners)
		try {
			fn()
		} catch {}
}

const find = (...props: string[]): any => {
	try {
		return (lookupModule((withProps as any)(...props)) as any)?.[0]
	} catch {
		return undefined
	}
}

export const myId = (): string | undefined =>
	S().UserStore?.getCurrentUser?.()?.id
export const voiceChannelId = (): string | undefined =>
	S().SelectedChannelStore?.getVoiceChannelId?.() ?? undefined

export interface Stream {
	streamType: string
	guildId: string | null
	channelId: string
	ownerId: string
}

/** A stream's key, as Discord writes it ("guild:g:c:u" or "call:c:u"). */
export function keyOf(s: Stream): string {
	try {
		const enc = find('encodeStreamKey')?.encodeStreamKey
		if (typeof enc === 'function') {
			const k = enc(s)
			if (typeof k === 'string') return k
		}
	} catch {}
	return s.guildId
		? `guild:${s.guildId}:${s.channelId}:${s.ownerId}`
		: `call:${s.channelId}:${s.ownerId}`
}

/** Everyone live in your voice channel, in a stable order. */
export function streams(): Stream[] {
	const channelId = voiceChannelId()
	if (!channelId) return []
	const channel = S().ChannelStore?.getChannel?.(channelId)
	const guildId: string | null = channel?.guild_id ?? null
	const out = new Map<string, Stream>()
	try {
		const list =
			S().ApplicationStreamingStore?.getAllApplicationStreamsForChannel?.(
				channelId,
			)
		if (Array.isArray(list))
			for (const s of list)
				if (s?.ownerId)
					out.set(String(s.ownerId), {
						streamType: s.streamType ?? (guildId ? 'guild' : 'call'),
						guildId: s.guildId ?? guildId,
						channelId,
						ownerId: String(s.ownerId),
					})
	} catch {}
	// Voice states say who is live too, in case the store above has another shape on this version.
	try {
		const states =
			S().VoiceStateStore?.getVoiceStatesForChannel?.(channelId) ?? {}
		for (const v of Object.values<any>(states)) {
			const id = v?.userId ?? v?.user_id
			if (id && (v.selfStream || v.self_stream) && !out.has(String(id)))
				out.set(String(id), {
					streamType: guildId ? 'guild' : 'call',
					guildId,
					channelId,
					ownerId: String(id),
				})
		}
	} catch {}
	const own = settings().ignoreOwn ? myId() : undefined
	return [...out.values()]
		.filter(s => s.ownerId !== own)
		.sort((a, b) => a.ownerId.localeCompare(b.ownerId))
}

/** The stream key that's focused (big) in the call, if any. */
export function focusedId(): string | undefined {
	const channelId = voiceChannelId()
	if (!channelId) return undefined
	try {
		const id = S().ChannelRTCStore?.getSelectedParticipantId?.(channelId)
		return typeof id === 'string' ? id : undefined
	} catch {
		return undefined
	}
}

/** Stream keys you're watching. */
export function watchingKeys(): Set<string> {
	const keys = new Set<string>()
	const store = S().ApplicationStreamingStore
	try {
		for (const s of store?.getAllActiveStreams?.() ?? []) keys.add(keyOf(s))
	} catch {}
	try {
		for (const k of store?.getAllActiveStreamKeys?.() ?? [])
			if (typeof k === 'string') keys.add(k)
	} catch {}
	try {
		const a = store?.getActiveStreamForApplicationStream
		if (typeof a === 'function')
			for (const s of streams()) if (a.call(store, s)) keys.add(keyOf(s))
	} catch {}
	return keys
}

export const isStreamKey = (id: unknown): id is string =>
	typeof id === 'string' && /^(guild|call):/.test(id)
export const ownerOfKey = (key: string) => key.split(':').pop()

// ── Actions: Discord's own, with the raw action as a fallback ──────────

export function watch(s: Stream) {
	const key = keyOf(s)
	const mod =
		find('watchStream') ??
		find('watchStreamAndTransitionToStream', 'stopOwnStream')
	try {
		if (typeof mod?.watchStream === 'function')
			return void mod.watchStream(s, { forceMultiple: false })
	} catch {}
	try {
		;(Dispatcher as any).dispatch({
			type: 'STREAM_WATCH',
			streamKey: key,
			allowMultiple: false,
		})
	} catch {}
}

export function focus(id: string) {
	const channelId = voiceChannelId()
	if (!channelId) return
	const mod = find('selectParticipant')
	try {
		if (typeof mod?.selectParticipant === 'function')
			return void mod.selectParticipant(channelId, id)
	} catch {}
	try {
		;(Dispatcher as any).dispatch({
			type: 'CHANNEL_RTC_SELECT_PARTICIPANT',
			channelId,
			id,
		})
	} catch {}
}

/** Stream volume for [userId], 0–200 (100 is normal). */
export function volumeOf(userId: string): number {
	try {
		const v = S().MediaEngineStore?.getLocalVolume?.(userId, 'stream')
		return typeof v === 'number' ? v : 100
	} catch {
		return 100
	}
}
export function isMuted(userId: string): boolean {
	try {
		return !!S().MediaEngineStore?.isLocalMute?.(userId, 'stream')
	} catch {
		return false
	}
}
export function setVolume(userId: string, volume: number) {
	const v = Math.max(0, Math.min(200, Math.round(volume)))
	const mod = find('setLocalVolume')
	try {
		if (typeof mod?.setLocalVolume === 'function')
			return void mod.setLocalVolume(userId, v, 'stream')
	} catch {}
	try {
		;(Dispatcher as any).dispatch({
			type: 'AUDIO_SET_LOCAL_VOLUME',
			userId,
			volume: v,
			context: 'stream',
		})
	} catch {}
}
export function toggleMute(userId: string) {
	const mod = find('toggleLocalMute')
	try {
		if (typeof mod?.toggleLocalMute === 'function')
			return void mod.toggleLocalMute(userId, 'stream')
	} catch {}
	try {
		;(Dispatcher as any).dispatch({
			type: 'AUDIO_TOGGLE_LOCAL_MUTE',
			userId,
			context: 'stream',
		})
	} catch {}
}

export const nameOf = (userId: string): string => {
	const u = S().UserStore?.getUser?.(userId)
	return u?.globalName ?? u?.global_name ?? u?.username ?? 'Someone'
}
