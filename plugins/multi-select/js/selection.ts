import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

/** What is selected: one channel at a time, like a chat app. */
export const selection = {
	active: false,
	channelId: undefined as string | undefined,
	ids: new Set<string>(),
}

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
	selection.channelId === channelId &&
	typeof messageId === 'string' &&
	selection.ids.has(messageId)

/** Starts selecting in [channelId] with [messageId] selected. */
export function start(channelId: string, messageId: string) {
	if (selection.active && selection.channelId !== channelId) clear()
	selection.active = true
	selection.channelId = channelId
	selection.ids.add(messageId)
	redraw(channelId, messageId)
	changed()
}

/** Adds or removes one message. Returns whether it is now selected. */
export function toggle(channelId: string, messageId: string): boolean {
	if (!selection.active || selection.channelId !== channelId) {
		start(channelId, messageId)
		return true
	}
	const now = !selection.ids.has(messageId)
	if (now) selection.ids.add(messageId)
	else selection.ids.delete(messageId)
	redraw(channelId, messageId)
	changed()
	return now
}

/** Ends selecting and takes the highlight off every row. */
export function clear() {
	const { channelId, ids } = selection
	const was = [...ids]
	selection.active = false
	selection.channelId = undefined
	selection.ids = new Set()
	if (channelId) for (const id of was) redraw(channelId, id)
	changed()
}

/** Forgets ids (deleted messages) without redrawing them. */
export function forget(ids: Iterable<string>) {
	for (const id of ids) selection.ids.delete(id)
	if (!selection.ids.size) {
		selection.active = false
		selection.channelId = undefined
	}
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
