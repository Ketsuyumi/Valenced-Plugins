import { Stores } from '@valenced/discord/flux'
import { after } from '@valenced/patcher'

export const DM = 1
export const GROUP_DM = 3

export interface Settings {
	/** IDs of individually hidden DMs and group DMs. */
	hidden: string[]
	hideAllDms: boolean
	hideAllGroups: boolean
}

export const DEFAULT_SETTINGS: Settings = {
	hidden: [],
	hideAllDms: false,
	hideAllGroups: false,
}

interface Channel {
	id: string
	type: number
	name?: string | null
	icon?: string | null
	recipients?: string[]
	getRecipientId?(): string | undefined
}

interface User {
	id: string
	username: string
	globalName?: string | null
	avatar?: string | null
	getAvatarURL?(guildId?: string, size?: number): string
}

type AnyStore = Record<string, any> & { emitChange?(): void }

const store = (name: string) => Stores[name] as unknown as AnyStore | undefined
const channelStore = () => store('ChannelStore')
const userStore = () => store('UserStore')

/** List methods the DM list may read from, by store. */
const TARGETS: Record<string, string[]> = {
	PrivateChannelSortStore: ['getPrivateChannelIds', 'getSortedChannels'],
	ChannelStore: ['getSortedPrivateChannels'],
}

/** While true, patched methods return everything (used by the settings page). */
let bypass = false

export function withoutFilter<T>(fn: () => T): T {
	bypass = true
	try {
		return fn()
	} finally {
		bypass = false
	}
}

function getChannel(id: string): Channel | undefined {
	return channelStore()?.getChannel?.(id)
}

/** Whether a channel (by ID) should be hidden with the given settings. */
export function isHidden(settings: Settings, id: string): boolean {
	if (settings.hidden.includes(id)) return true
	if (!settings.hideAllDms && !settings.hideAllGroups) return false
	const type = getChannel(id)?.type
	return (
		(settings.hideAllDms && type === DM) ||
		(settings.hideAllGroups && type === GROUP_DM)
	)
}

/** Channel ID of a list entry: an ID string, a channel, or `{ channelId }`. */
function entryId(entry: unknown): string | undefined {
	if (typeof entry === 'string') return entry
	if (entry && typeof entry === 'object') {
		const e = entry as { channelId?: unknown; id?: unknown }
		if (typeof e.channelId === 'string') return e.channelId
		if (typeof e.id === 'string') return e.id
	}
	return undefined
}

/** Removes hidden channels from a list, including lists nested in it. */
export function filterList(value: unknown, hide: (id: string) => boolean) {
	if (!Array.isArray(value)) return value
	const result: unknown[] = []
	for (const entry of value) {
		if (Array.isArray(entry)) result.push(filterList(entry, hide))
		else {
			const id = entryId(entry)
			if (!id || !hide(id)) result.push(entry)
		}
	}
	return result
}

/** Settings in the shape the list hooks need: built once per change, not per read. */
interface Snapshot {
	hidden: Set<string>
	hideAllDms: boolean
	hideAllGroups: boolean
	/** False when nothing is hidden: the hooks return Discord's list untouched. */
	active: boolean
}

function snapshotOf(settings: Settings | undefined): Snapshot {
	const hidden = new Set(settings?.hidden ?? [])
	const hideAllDms = !!settings?.hideAllDms
	const hideAllGroups = !!settings?.hideAllGroups
	return {
		hidden,
		hideAllDms,
		hideAllGroups,
		active: hidden.size > 0 || hideAllDms || hideAllGroups,
	}
}

function hides(snapshot: Snapshot, id: string): boolean {
	if (snapshot.hidden.has(id)) return true
	if (!snapshot.hideAllDms && !snapshot.hideAllGroups) return false
	const type = getChannel(id)?.type
	return (
		(snapshot.hideAllDms && type === DM) ||
		(snapshot.hideAllGroups && type === GROUP_DM)
	)
}

function sameItems(a: unknown[], b: unknown[]): boolean {
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
	return true
}

/**
 * Patches every list method that exists. Returns the unpatch functions, the
 * names of the methods that were patched, and `refresh`, to call when the
 * settings change.
 *
 * The DM list reads these methods often. Each hook remembers its last input
 * and output: the same input gives the same output without filtering again,
 * and an output with the same items is returned as the same array, so
 * Discord's own "did the list change?" checks keep working.
 */
export function patchStores(getSettings: () => Settings | undefined) {
	const unpatches: (() => void)[] = []
	const patched: string[] = []
	let snapshot = snapshotOf(getSettings())
	let version = 0
	const refresh = () => {
		snapshot = snapshotOf(getSettings())
		version++
	}

	for (const [storeName, methods] of Object.entries(TARGETS)) {
		const target = store(storeName)
		if (!target) continue
		for (const method of methods) {
			if (typeof target[method] !== 'function') continue
			let lastIn: unknown
			let lastOut: unknown
			let lastVersion = -1
			unpatches.push(
				after(target, method, (ret: unknown) => {
					if (bypass || !snapshot.active || !Array.isArray(ret)) return ret
					if (ret === lastIn && version === lastVersion) return lastOut
					const current = snapshot
					let out = filterList(ret, id => hides(current, id)) as unknown[]
					if (sameItems(out, ret)) out = ret
					else if (Array.isArray(lastOut) && sameItems(out, lastOut))
						out = lastOut
					lastIn = ret
					lastOut = out
					lastVersion = version
					return out
				}),
			)
			patched.push(`${storeName}.${method}`)
		}
	}

	return { unpatches, patched, refresh }
}

/** Makes the DM list re-read its data after settings change. */
export function refreshLists() {
	for (const name of Object.keys(TARGETS)) store(name)?.emitChange?.()
}

export interface ConversationInfo {
	id: string
	type: number
	name: string
	avatarUrl: string
}

const CDN = 'https://cdn.discordapp.com'

function userAvatar(user: User | undefined, fallbackId: string): string {
	const url = user?.getAvatarURL?.(undefined, 64)
	if (typeof url === 'string' && url.startsWith('http')) return url
	if (user?.avatar)
		return `${CDN}/avatars/${user.id}/${user.avatar}.png?size=64`
	const index =
		typeof BigInt === 'function'
			? Number((BigInt(user?.id ?? fallbackId) >> 22n) % 6n)
			: 0
	return `${CDN}/embed/avatars/${index}.png`
}

function userName(id: string): string {
	const user: User | undefined = userStore()?.getUser?.(id)
	return user ? user.globalName || user.username : id
}

function describe(channel: Channel): ConversationInfo {
	if (channel.type === GROUP_DM) {
		const name =
			channel.name ||
			(channel.recipients ?? []).map(userName).join(', ') ||
			'Unnamed group'
		const avatarUrl = channel.icon
			? `${CDN}/channel-icons/${channel.id}/${channel.icon}.png?size=64`
			: `${CDN}/embed/avatars/0.png`
		return { id: channel.id, type: channel.type, name, avatarUrl }
	}

	const recipient =
		channel.getRecipientId?.() ?? channel.recipients?.[0] ?? channel.id
	const user: User | undefined = userStore()?.getUser?.(recipient)
	return {
		id: channel.id,
		type: channel.type,
		name: userName(recipient),
		avatarUrl: userAvatar(user, recipient),
	}
}

/** All DMs and group DMs, including hidden ones, in Discord's order. */
export function listConversations(): ConversationInfo[] {
	return withoutFilter(() => {
		const channels = channelStore()
		let list: Channel[] = []

		const sorted = channels?.getSortedPrivateChannels?.()
		if (Array.isArray(sorted)) list = sorted
		else {
			const ids = store('PrivateChannelSortStore')?.getPrivateChannelIds?.()
			if (Array.isArray(ids))
				list = ids.map(getChannel).filter(Boolean) as Channel[]
		}

		return list
			.filter(c => c && (c.type === DM || c.type === GROUP_DM))
			.map(describe)
	})
}
