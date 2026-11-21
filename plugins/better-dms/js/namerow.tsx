import { instead } from '@valenced/patcher'
import { cloneElement, isValidElement } from 'react'
import { Image, StyleSheet, Text } from 'react-native'
import { emojiUrl } from './emoji'
import { findModule } from './find'
import { channel, dmData, on } from './state'

/**
 * A DM's emoji right after its name on the Messages tab. The row's name sits in a horizontal box
 * (`channelNameAndBadge`: row, flex 1, minWidth 0) followed by tags; the emoji goes in that box
 * right after the name, so it stays beside the name while the time keeps the row's end.
 */
const CONTENT =
	'modules/main_tabs_v2/native/tabs/messages/items/channel/MessagesItemChannelContent.tsx'

/** Set once the emoji has been placed by a name, so the preview line stops repeating it. */
export const nameRow = { works: false }

function isNameBox(node: any): boolean {
	const s = StyleSheet.flatten(node?.props?.style) as any
	return (
		!!s &&
		s.flexDirection === 'row' &&
		s.flex === 1 &&
		s.minWidth === 0 &&
		Array.isArray(node.props.children)
	)
}

function badge(id: string) {
	const d = dmData(id)
	if (d.customEmoji)
		return (
			<Image
				key="better-dms-name-emoji"
				source={{ uri: emojiUrl(d.customEmoji, 48) }}
				style={{ width: 18, height: 18 }}
			/>
		)
	if (d.emoji)
		return (
			<Text key="better-dms-name-emoji" style={{ fontSize: 15 }}>
				{d.emoji}
			</Text>
		)
	return null
}

function insert(node: any, el: any, depth = 0): any {
	if (!isValidElement<any>(node) || depth > 8) return undefined
	if (isNameBox(node)) {
		const [name, ...rest] = node.props.children
		return cloneElement(node, undefined, name, el, ...rest)
	}
	const kids = node.props?.children
	if (kids == null || typeof kids !== 'object') return undefined
	const list = Array.isArray(kids) ? kids : [kids]
	for (let i = 0; i < list.length; i++) {
		const next = insert(list[i], el, depth + 1)
		if (next !== undefined) {
			const copy = [...list]
			copy[i] = next
			return cloneElement(node, undefined, ...copy)
		}
	}
	return undefined
}

export function installNameEmoji(): () => void {
	const undo: Array<() => void> = []
	undo.push(
		findModule(CONTENT, [], (mod: any) => {
			const target = mod?.default
			const host =
				typeof target === 'function'
					? { o: mod, k: 'default' }
					: typeof target?.type === 'function'
						? { o: target, k: 'type' }
						: null
			if (!host) return
			undo.push(
				instead(
					host.o,
					host.k,
					function (this: unknown, args: any[], orig: (...a: any[]) => any) {
						const out = orig.apply(this, args)
						try {
							if (!on('emoji')) return out
							const p = args[0]
							const id = p?.channel?.id ?? p?.channelId
							const c = typeof id === 'string' ? channel(id) : undefined
							if (!c || (c.type !== 1 && c.type !== 3)) return out
							const el = badge(id)
							if (!el) return out
							const next = insert(out, el)
							if (next === undefined) return out
							nameRow.works = true
							return next
						} catch {
							return out
						}
					},
				),
			)
		}),
	)
	return () => {
		for (const u of undo.splice(0))
			try {
				u()
			} catch {}
	}
}
