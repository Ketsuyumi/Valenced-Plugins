import { Stores } from '@valenced/discord/flux'
import { after } from '@valenced/patcher'
import {
	channel,
	DM,
	dmData,
	GROUP_DM,
	isFriend,
	isUnread,
	on,
	recipientOf,
} from './state'

/**
 * Pins and tabs, applied to the lists the DM list reads (the same store methods Hide DMs filters):
 * pinned DMs move to the top, and the active tab filters what's shown.
 */

export type Tab = 'all' | 'dms' | 'groups' | 'unread' | 'friends' | 'pinned' | `label:${string}`

let tab: Tab = 'all'
const tabListeners = new Set<() => void>()
export const currentTab = () => tab
export function setTab(next: Tab) {
	tab = next
	version++
	for (const l of tabListeners) l()
	refreshLists()
}
export function onTab(fn: () => void) {
	tabListeners.add(fn)
	return () => tabListeners.delete(fn)
}

/** The first tab: everything, or only 1-on-1 DMs when groups have their own tab. */
export const firstTab = (): Tab => (on('tabs') && on('groupTab') ? 'dms' : 'all')

const TARGETS: Record<string, string[]> = {
	PrivateChannelSortStore: ['getPrivateChannelIds', 'getSortedChannels'],
	ChannelStore: ['getSortedPrivateChannels'],
}

let version = 0
export const bump = () => {
	version++
}

function entryId(entry: unknown): string | undefined {
	if (typeof entry === 'string') return entry
	if (entry && typeof entry === 'object') {
		const e = entry as { channelId?: unknown; id?: unknown }
		if (typeof e.channelId === 'string') return e.channelId
		if (typeof e.id === 'string') return e.id
	}
	return undefined
}

export function shows(id: string, t: Tab = tab): boolean {
	if (!on('tabs')) return true
	const c = channel(id)
	const type = c?.type
	if (type !== DM && type !== GROUP_DM) return true
	switch (t) {
		case 'all':
			return true
		case 'dms':
			return type === DM
		case 'groups':
			return type === GROUP_DM
		case 'unread':
			return isUnread(id)
		case 'friends':
			return type === DM && isFriend(recipientOf(c))
		case 'pinned':
			return !!dmData(id).pinned
		default:
			return (dmData(id).label?.trim() ?? '') === t.slice(6)
	}
}

/** Filters by tab and moves pinned DMs to the top (flat lists only; nested lists are filtered). */
export function arrange(list: unknown[]): unknown[] {
	const nested = list.some(Array.isArray)
	const kept = list
		.map(e => (Array.isArray(e) ? arrange(e) : e))
		.filter(e => {
			if (Array.isArray(e)) return true
			const id = entryId(e)
			return !id || shows(id)
		})
	if (nested || !on('pins')) return kept
	const pinned: unknown[] = []
	const rest: unknown[] = []
	for (const e of kept) {
		const id = entryId(e)
		;(id && dmData(id).pinned ? pinned : rest).push(e)
	}
	return pinned.length ? [...pinned, ...rest] : kept
}

const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i])

export function patchLists(): () => void {
	const undo: Array<() => void> = []
	for (const [name, methods] of Object.entries(TARGETS)) {
		const store = (Stores as any)[name]
		if (!store) continue
		for (const method of methods) {
			if (typeof store[method] !== 'function') continue
			let lastIn: unknown
			let lastOut: unknown
			let lastVersion = -1
			undo.push(
				after(store, method, ((ret: unknown) => {
					if (!Array.isArray(ret)) return ret
					if (!on('pins') && (!on('tabs') || tab === 'all')) return ret
					if (ret === lastIn && version === lastVersion) return lastOut
					let out = arrange(ret)
					if (same(out, ret)) out = ret
					else if (Array.isArray(lastOut) && same(out, lastOut)) out = lastOut
					lastIn = ret
					lastOut = out
					lastVersion = version
					return out
				}) as never),
			)
		}
	}
	return () => {
		for (const u of undo) u()
		refreshLists()
	}
}

export function refreshLists() {
	for (const name of Object.keys(TARGETS)) (Stores as any)[name]?.emitChange?.()
}
