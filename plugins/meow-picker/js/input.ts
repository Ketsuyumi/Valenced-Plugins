import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { findModule } from './find'

/**
 * The chat box's handle, to add text at the cursor. ChatInput's render hands `chatInputRef` to its
 * children, and its handle has `insertText(text, location, addSpace)`, as Discord's own mention
 * taps use (found by bleelblep for Pocket Browser, GPL-3.0). The render is swapped whichever shape
 * Discord built it in: memo(forwardRef(render)) up to 349, memo(render) from 350.2.
 */

type Ref = {
	current?: {
		insertText?: (text: string, location?: number, addSpace?: boolean) => void
	} | null
}
let latest: Ref | undefined
export const inputStatus = { hooked: false }

function findRef(node: any, depth = 0): Ref | undefined {
	if (!node || typeof node !== 'object' || depth > 12) return undefined
	if (Array.isArray(node)) {
		for (const child of node) {
			const ref = findRef(child, depth + 1)
			if (ref) return ref
		}
		return undefined
	}
	const ref = node.props?.chatInputRef
	if (ref && typeof ref === 'object' && 'current' in ref) return ref
	return findRef(node.props?.children, depth + 1)
}

function wrapRender(
	exports: any,
	make: (original: any) => any,
): (() => void) | undefined {
	const memo = exports?.default ?? exports
	const inner = memo?.type
	let host: any
	let key: 'render' | 'type'
	if (typeof inner?.render === 'function') {
		host = inner
		key = 'render'
	} else if (typeof inner === 'function') {
		host = memo
		key = 'type'
	} else return undefined
	const original = host[key]
	const wrapper = make(original)
	try {
		Object.defineProperty(wrapper, 'displayName', {
			value: original.displayName ?? original.name,
			configurable: true,
		})
	} catch {}
	host[key] = wrapper
	if (host[key] !== wrapper) return undefined
	return () => {
		if (host[key] === wrapper) host[key] = original
	}
}

export function patchInput(): () => void {
	let undo: (() => void) | undefined
	const unfind = findModule(
		'modules/chat_input/native/ChatInput.tsx',
		[],
		(exports: any) => {
			if (undo) return
			undo = wrapRender(
				exports,
				original =>
					function (this: unknown, ...args: any[]) {
						const tree = Reflect.apply(original, this, args)
						try {
							latest = findRef(tree) ?? latest
						} catch {}
						return tree
					},
			)
			inputStatus.hooked = !!undo
		},
	)
	return () => {
		unfind()
		undo?.()
		latest = undefined
		inputStatus.hooked = false
	}
}

/** Adds [text] at the cursor, with a space after. False when there's no chat box handle. */
export function addToMessage(text: string): boolean {
	const input = latest?.current
	if (typeof input?.insertText !== 'function') return false
	try {
		input.insertText(text, undefined, true)
		return true
	} catch {
		return false
	}
}

/** Sends [text] to the open channel, through Discord's own sendMessage. */
export function send(text: string): boolean {
	const channelId = (Stores as any).SelectedChannelStore?.getChannelId?.()
	if (!channelId) return false
	const [mod] = lookupModule(
		(withProps as any)('sendMessage', 'editMessage'),
	) as any
	if (typeof mod?.sendMessage !== 'function') return false
	void mod.sendMessage(channelId, {
		content: text,
		tts: false,
		invalidEmojis: [],
		validNonShortcutEmojis: [],
	})
	return true
}
