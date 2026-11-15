import { registerJSMethod } from '@valenced/modules/native'
import { AppState } from 'react-native'
import { native } from './native'
import type { NativeState } from './native'

export type Repeat = 'off' | 'all' | 'one'

export interface Playback {
	key: string
	title: string
	subtitle: string
	app: string | null
	packageName: string | null
	artwork: string | null
	/** Milliseconds; 0 when unknown. */
	duration: number
	position: number
	/** Date.now() when `position` was true. */
	sampledAt: number
	playing: boolean
	canSeek: boolean
	canShuffle: boolean
	canRepeat: boolean
	shuffle: boolean
	repeat: Repeat
	/** 'bridge': from Media Bridge. 'keys': something plays, controlled with media keys only. */
	source: 'bridge' | 'keys'
}

export type BridgeStatus =
	| 'checking'
	| 'waiting' // no answer from Media Bridge yet
	| 'connected'

export interface MediaState {
	playback: Playback | null
	bridge: BridgeStatus
	/** Null until the native part answered once. */
	nativeError: string | null
	nativeOk: boolean | null
	discordPackage: string | null
	lastNative: NativeState | null
}

let state: MediaState = {
	playback: null,
	bridge: 'checking',
	nativeError: null,
	nativeOk: null,
	discordPackage: null,
	lastNative: null,
}
const listeners = new Set<() => void>()

export const getState = () => state
export function subscribe(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

/** Only what the UI shows; the raw native state changes on every poll. */
function visibleKey(s: MediaState) {
	const n = s.lastNative
	return [
		s.bridge,
		s.nativeOk,
		s.nativeError,
		s.discordPackage,
		n?.access,
		n?.active,
		n?.app ?? n?.package,
	].join('|')
}

/** Updates the state, and re-renders subscribers only if something they show changed. */
function set(next: Partial<MediaState>) {
	const before = state
	state = { ...state, ...next }
	if (
		before.playback === state.playback &&
		visibleKey(before) === visibleKey(state)
	)
		return
	for (const l of listeners) l()
}

/** Current position in ms, moved forward while playing. */
export function positionOf(p: Playback, now = Date.now()) {
	const pos = p.playing ? p.position + (now - p.sampledAt) : p.position
	return p.duration > 0
		? Math.min(Math.max(pos, 0), p.duration)
		: Math.max(pos, 0)
}

const HELLO_EVERY_MS = 10_000
/** Safety-net poll once pushes work; Media Bridge pushes every change. */
const POLL_PUSHED_MS = 5000
/** Before Media Bridge answered: watch for media-key playback, and keep saying hello. */
const POLL_WAITING_MS = 2000
/** Connected, but no push arrived yet (older native part or bridge not ready). */
const POLL_CONNECTED_MS = 1000

let art = { key: '', uri: null as string | null }
/** Optimistic values after a button press, until the player confirms them. */
let optimistic: { playing?: boolean; until: number } | null = null

async function artworkFor(s: NativeState) {
	const key = `${s.trackKey}|${s.artVersion}`
	if (key === art.key) return art.uri
	const data = await native.art().catch(() => null)
	art = { key, uri: data ?? s.artUrl ?? null }
	return art.uri
}

function samePlayback(a: Playback | null, b: Playback | null) {
	if (!a || !b) return a === b
	return (
		a.key === b.key &&
		a.title === b.title &&
		a.subtitle === b.subtitle &&
		a.artwork === b.artwork &&
		a.playing === b.playing &&
		a.duration === b.duration &&
		a.shuffle === b.shuffle &&
		a.repeat === b.repeat &&
		a.canSeek === b.canSeek &&
		a.canShuffle === b.canShuffle &&
		a.canRepeat === b.canRepeat &&
		// A jump (seek) of more than 2 seconds counts as a change; normal progress doesn't.
		Math.abs(positionOf(a) - positionOf(b)) < 2000
	)
}

let inflight: Promise<void> | null = null
let pushed = false

/** Reads the native state now. Concurrent calls share one read. */
export function poll(): Promise<void> {
	if (!inflight)
		inflight = readState().finally(() => {
			inflight = null
		})
	return inflight
}

async function readState() {
	let s: NativeState
	try {
		s = await native.state()
	} catch (e: any) {
		set({
			nativeOk: false,
			nativeError: e?.message ?? String(e),
			bridge: 'waiting',
		})
		return
	}

	let playback: Playback | null = null
	let bridge: BridgeStatus = 'waiting'

	if (!s.heard) {
		// Keep saying hello until Media Bridge answers (it may start after Discord).
		if ((s.sinceHello ?? -1) < 0 || (s.sinceHello ?? 0) > HELLO_EVERY_MS)
			native.command('hello').catch(() => {})
		const playing = await native.playing().catch(() => false)
		if (playing)
			playback = {
				key: 'media-keys',
				title: 'Something is playing',
				subtitle: 'Install Media Bridge to see what',
				app: null,
				packageName: null,
				artwork: null,
				duration: 0,
				position: 0,
				sampledAt: Date.now(),
				playing: true,
				canSeek: false,
				canShuffle: false,
				canRepeat: false,
				shuffle: false,
				repeat: 'off',
				source: 'keys',
			}
	} else {
		bridge = 'connected'
		if (s.active) {
			const now = Date.now()
			const hold = optimistic && optimistic.until > now ? optimistic : null
			if (hold && hold.playing === s.playing) optimistic = null
			playback = {
				key: s.trackKey ?? `${s.package}|${s.title}`,
				title: s.title || 'Unknown title',
				subtitle: s.artist || s.album || s.app || '',
				app: s.app ?? null,
				packageName: s.package ?? null,
				artwork: await artworkFor(s),
				duration: s.duration ?? 0,
				position: s.position ?? 0,
				sampledAt: now,
				playing: hold?.playing ?? !!s.playing,
				canSeek: !!s.canSeek && (s.duration ?? 0) > 0,
				canShuffle: !!s.canShuffle,
				canRepeat: !!s.canRepeat,
				shuffle: !!s.shuffle,
				repeat: s.repeat ?? 'off',
				source: 'bridge',
			}
		}
	}

	set({
		nativeOk: true,
		nativeError: null,
		bridge,
		discordPackage: s.discordPackage ?? null,
		lastNative: s,
		playback: samePlayback(state.playback, playback)
			? state.playback
			: playback,
	})
}

export async function control(
	action: 'playPause' | 'next' | 'previous' | 'shuffle' | 'repeat' | 'seek',
	position = 0,
) {
	const p = state.playback
	if (!p) return
	if (action === 'playPause') {
		const playing = !p.playing
		optimistic = { playing, until: Date.now() + 1500 }
		set({
			playback: {
				...p,
				playing,
				position: positionOf(p),
				sampledAt: Date.now(),
			},
		})
	}
	if (action === 'seek')
		set({ playback: { ...p, position, sampledAt: Date.now() } })

	// Play/pause, next and previous go as media keys, like headphone buttons: Android delivers
	// them to the app that's playing, without depending on Media Bridge receiving commands.
	if (action === 'playPause' || action === 'next' || action === 'previous')
		await native.press(action).catch(() => {})
	else if (p.source === 'bridge')
		await native.command(action, position).catch(() => {})
	setTimeout(poll, 300)
}

let timer: ReturnType<typeof setTimeout> | undefined
let running = false

function nextDelay() {
	if (state.bridge !== 'connected') return POLL_WAITING_MS
	return pushed ? POLL_PUSHED_MS : POLL_CONNECTED_MS
}

function schedule(delay: number) {
	if (timer) clearTimeout(timer)
	timer = setTimeout(async () => {
		timer = undefined
		if (!running) return
		await poll()
		if (running) schedule(nextDelay())
	}, delay)
}

let jsMethodRegistered = false

/**
 * Follows the player while Discord is in the foreground: the native part pushes every change,
 * and a slow poll covers anything missed.
 */
export function startPolling() {
	if (!jsMethodRegistered) {
		jsMethodRegistered = true
		// Can't be unregistered; it does nothing while stopped.
		registerJSMethod('mediaControls.changed', () => {
			if (!running) return false
			pushed = true
			poll()
			return true
		})
	}
	const resume = () => {
		if (running) return
		running = true
		schedule(0)
	}
	const pause = () => {
		running = false
		if (timer) clearTimeout(timer)
		timer = undefined
	}
	const sub = AppState.addEventListener('change', s =>
		s === 'active' ? resume() : pause(),
	)
	if (AppState.currentState !== 'background') resume()
	return () => {
		pause()
		sub.remove()
	}
}

/** Forces a fresh hello, for the Diagnostics "Reconnect" button. */
export function reconnect() {
	native.command('hello').catch(() => {})
	setTimeout(poll, 500)
}
