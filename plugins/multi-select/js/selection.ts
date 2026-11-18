import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

/** One selected message. The author is kept so permissions can be checked after leaving the channel. */
export interface Picked {
	channelId: string
	messageId: string
	authorId?: string
}

/**
 * What is selected, across any number of channels (1.2.0: switching channels keeps it). Keyed by
 * "channel:message".
 */
export const selection = {
	active: false,
	items: new Map<string, Picked>(),
}

const keyOf = (channelId: unknown, messageId: unknown) =>
	`${channelId}:${messageId}`

const listeners = new Set<() => void>()
export function onSelectionChange(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}
const changed = () => {
	for (const listener of listeners) listener()
}

export const isSelected = (channelId: unknown, messageId: unknown) =>
	selection.active &&
	typeof messageId === 'string' &&
	selection.items.has(keyOf(channelId, messageId))

/** How many channels the selection spans. */
export const channelCount = () =>
	new Set([...selection.items.values()].map(item => item.channelId)).size

/**
 * Whether selecting stays on when the last message is deselected. On while the bar (with its ✕) is
 * shown, so a selection started from the header button doesn't end before the first pick.
 */
let keepWhenEmpty: () => boolean = () => false
export function setKeepWhenEmpty(fn: () => boolean) {
	keepWhenEmpty = fn
}

/** Turns selecting on with nothing picked yet (the header button). */
export function activate() {
	if (selection.active) return
	selection.active = true
	changed()
}

/** Starts selecting (or adds to it) with this message. */
export function start(channelId: string, messageId: string, authorId?: string) {
	selection.active = true
	selection.items.set(keyOf(channelId, messageId), {
		channelId,
		messageId,
		authorId,
	})
	redraw(channelId, messageId)
	changed()
}

/** Adds or removes one message. Returns whether it is now selected. */
export function toggle(
	channelId: string,
	messageId: string,
	authorId?: string,
): boolean {
	const key = keyOf(channelId, messageId)
	if (!selection.active || !selection.items.has(key)) {
		start(channelId, messageId, authorId)
		return true
	}
	selection.items.delete(key)
	redraw(channelId, messageId)
	if (!selection.items.size && !keepWhenEmpty()) selection.active = false
	changed()
	return false
}

/** Ends selecting and takes the highlight off every row still loaded. */
export function clear() {
	const was = [...selection.items.values()]
	selection.active = false
	selection.items = new Map()
	for (const item of was) redraw(item.channelId, item.messageId)
	changed()
}

/** Forgets messages (deleted ones) without redrawing them. */
export function forget(items: Iterable<Picked>) {
	for (const item of items)
		selection.items.delete(keyOf(item.channelId, item.messageId))
	if (!selection.items.size) selection.active = false
	changed()
}

// ---------------------------------------------------------------------------------------------
// Redrawing one row, so its highlight appears or goes at once.
//
// Chat rows are only rebuilt when their message record changes, and the row diff compares records
// by value. The known way to force one row (Message Tweaks, Ghost Log, Pronouns) is to swap the
// record for a copy whose text gains or loses an invisible mark, commit the channel's message
// collection and announce a MessageStore change. The mark is toggled, so a second redraw is a
// change too. A message without text can't be redrawn this way; its highlight shows on the next
// natural redraw (scrolling it off and back on screen).

const MARK = ' ​'

interface Collection {
	has(id: string): boolean
	update(id: string, fn: (message: any) => any): Collection
}
interface ChannelMessages {
	getOrCreate(channelId: string): Collection
	commit(collection: Collection): void
}

let channelMessages: ChannelMessages | undefined

export function watchChannelMessages(): () => void {
	const offDirect = getModules(
		(withProps as any)('getOrCreate', 'commit'),
		(exports: any) => {
			channelMessages ??= exports
		},
	)
	const offWrapped = getModules(
		(withProps as any)('_channelMessages'),
		(exports: any) => {
			const cache = exports?._channelMessages
			if (
				typeof cache?.getOrCreate === 'function' &&
				typeof cache.commit === 'function'
			)
				channelMessages ??= cache
		},
	)
	return () => {
		offDirect()
		offWrapped()
		channelMessages = undefined
	}
}

let emitQueued = false

export function redraw(channelId: string, messageId: string) {
	try {
		const cache = channelMessages
		if (!cache) return
		const collection = cache.getOrCreate(channelId)
		if (!collection?.has?.(messageId)) return
		const next = collection.update(messageId, (message: any) => {
			const content = message?.content
			if (typeof content !== 'string' || !content) return message
			const text = content.endsWith(MARK)
				? content.slice(0, -MARK.length)
				: content + MARK
			return typeof message.set === 'function'
				? message.set('content', text)
				: Object.assign(
						Object.create(Object.getPrototypeOf(message)),
						message,
						{
							content: text,
						},
					)
		})
		cache.commit(next)
		if (!emitQueued) {
			emitQueued = true
			setTimeout(() => {
				emitQueued = false
				try {
					;(Stores as any).MessageStore?.emitChange?.()
				} catch {}
			}, 0)
		}
	} catch {}
}
