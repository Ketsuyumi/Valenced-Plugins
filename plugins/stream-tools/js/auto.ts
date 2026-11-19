import { ToastActionCreators } from '@valenced/discord/actions'
import {
	focus,
	focusedId,
	keyOf,
	nameOf,
	S,
	settings,
	streams,
	voiceChannelId,
	watch,
	watchingKeys,
} from './state'

/**
 * Watches the call for streams: new ones are watched (when nothing is being watched yet) and
 * focused, a "went live" toast is shown, and when the watched stream ends the next one is taken.
 * Each stream is focused once only, so tapping out of it yourself sticks.
 */

export const autoStatus = { streams: 0, watching: 0, lastAction: 'Nothing yet' }

function toast(text: string) {
	try {
		ToastActionCreators.open('stream-tools', { text } as never)
	} catch {}
}

let known = new Set<string>()
const focusedOnce = new Set<string>()
let lastWatched: string | undefined
let channel: string | undefined
let timer: any

function tick() {
	timer = undefined
	const s = settings()
	const now = voiceChannelId()
	if (now !== channel) {
		// Joined, left or moved: start over, and don't toast the streams already running.
		channel = now
		known = new Set()
		focusedOnce.clear()
		lastWatched = undefined
		if (!now) return
		for (const st of streams()) known.add(keyOf(st))
		const first = streams()[0]
		if (first && s.autoWatch && !watchingKeys().size)
			start(first, 'Watching (joined the call)')
		return
	}
	if (!now) return
	const list = streams()
	const keys = list.map(keyOf)
	const watching = watchingKeys()
	autoStatus.streams = list.length
	autoStatus.watching = watching.size

	for (const st of list) {
		const k = keyOf(st)
		if (known.has(k)) continue
		known.add(k)
		if (s.notify) toast(`${nameOf(st.ownerId)} went live`)
		if (s.autoWatch && !watching.size)
			start(st, `Watching ${nameOf(st.ownerId)} (went live)`)
	}
	for (const k of [...known])
		if (!keys.includes(k)) {
			known.delete(k)
			focusedOnce.delete(k)
			if (k === lastWatched) {
				lastWatched = undefined
				if (s.autoNext && list.length && !watching.size)
					start(list[0], `Next stream: ${nameOf(list[0].ownerId)}`)
			}
		}
	for (const k of watching) {
		if (!keys.includes(k)) continue
		lastWatched = k
		if (s.autoFocus && !focusedOnce.has(k) && focusedId() !== k) {
			focusedOnce.add(k)
			focus(k)
			autoStatus.lastAction = 'Focused the stream'
		}
	}
}

function start(st: Parameters<typeof watch>[0], why: string) {
	const k = keyOf(st)
	watch(st)
	lastWatched = k
	autoStatus.lastAction = why
	// Focus it too, in case the watching list can't be read on this version.
	if (settings().autoFocus)
		setTimeout(() => {
			if (focusedOnce.has(k)) return
			focusedOnce.add(k)
			focus(k)
		}, 900)
}

export function startAuto(): () => void {
	const run = () => {
		if (!timer) timer = setTimeout(tick, 120)
	}
	const stores = [
		'ApplicationStreamingStore',
		'VoiceStateStore',
		'SelectedChannelStore',
		'ChannelRTCStore',
	]
	const bound: any[] = []
	for (const name of stores) {
		const st = S()[name]
		if (typeof st?.addChangeListener !== 'function') continue
		st.addChangeListener(run)
		bound.push(st)
	}
	run()
	return () => {
		for (const st of bound) st.removeChangeListener?.(run)
		clearTimeout(timer)
		timer = undefined
		known = new Set()
		focusedOnce.clear()
		channel = undefined
	}
}
