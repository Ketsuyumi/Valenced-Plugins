import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { cloneElement, isValidElement } from 'react'
import type { FC, ReactElement, ReactNode } from 'react'

/**
 * Forces every typing indicator to Discord's default look.
 *
 * Discord's typing line (`modules/chat/native/TypingIndicator.tsx`, the module exporting
 * `useTypingUserIdsForDisplay`) renders through a TransitionItem's `renderItem`:
 *
 *   <TypingIndicatorInner channel typingUserIds>
 *     default:  … <Ellipsis /> <Text>A is typing…</Text>
 *     custom:   … <CustomTypingIndicatorDisplay config username onPress>
 *                   <Stack> <CustomTypingIndicatorGlyph config /> <Text>A is typing…</Text>
 *
 * (Shapes as documented by Palm's Better Typing Indicators, which this composes with: both clone
 * the TransitionItem with a wrapped renderItem.) The default dots are remembered the first time a
 * plain indicator renders; in a custom one the glyph is swapped for them, or dropped until then.
 */

type AnyElement = ReactElement<any>
type Render = (...args: any[]) => ReactElement

const isElement = (node: unknown): node is AnyElement =>
	isValidElement(node) ||
	(!!node &&
		typeof node === 'object' &&
		(node as any).$$typeof !== undefined &&
		typeof (node as any).props === 'object' &&
		(node as any).props !== null)

const isText = (el: AnyElement) => el.type === (Design as any).Text
const isCustomDisplay = (el: AnyElement) =>
	typeof el.type === 'function' && 'config' in el.props && 'username' in el.props
const isGlyph = (el: AnyElement) =>
	el.type !== undefined &&
	typeof el.type !== 'string' &&
	'config' in el.props &&
	!('username' in el.props) &&
	!isText(el)

/** Discord's own "• • •", captured from a plain indicator. */
let dots: AnyElement | undefined
export let seenCustom = 0

/** Maps over every element under [node]; [fn] returns a replacement or undefined to keep it. */
function rewrite(
	node: ReactNode,
	fn: (el: AnyElement) => ReactNode | undefined,
	depth = 0,
): ReactNode {
	if (depth > 14) return node
	if (Array.isArray(node)) {
		let changed = false
		const next = node.map(child => {
			const out = rewrite(child, fn, depth + 1)
			if (out !== child) changed = true
			return out
		})
		return changed ? next : node
	}
	if (!isElement(node)) return node
	const el = node as AnyElement
	const replaced = fn(el)
	if (replaced !== undefined) return replaced
	const children = el.props.children
	if (children == null) return node
	const next = rewrite(children, fn, depth + 1)
	if (next === children) return el
	return Array.isArray(next)
		? cloneElement(el, undefined, ...(next as ReactNode[]))
		: cloneElement(el, undefined, next)
}

/** Remembers the element just before the "is typing" text in a plain indicator. */
function learnDots(node: ReactNode, depth = 0) {
	if (dots || depth > 14) return
	if (Array.isArray(node)) {
		const at = node.findIndex(child => isElement(child) && isText(child))
		if (at > 0) {
			for (let i = at - 1; i >= 0; i--) {
				const prev = node[i]
				if (isElement(prev) && typeof prev.type !== 'string' && !isGlyph(prev)) {
					dots = prev
					return
				}
			}
		}
		for (const child of node) learnDots(child, depth + 1)
		return
	}
	if (isElement(node)) learnDots((node as AnyElement).props.children, depth + 1)
}

/** One wrapper per Discord component, so React keeps seeing the same component type. */
const wrappers = new WeakMap<Function, FC<any>>()
function wrap(type: Function, post: (tree: ReactNode) => ReactNode): FC<any> {
	let wrapped = wrappers.get(type)
	if (!wrapped) {
		wrapped = function (this: unknown, props: any) {
			const tree = (type as Render).call(this, props)
			try {
				return post(tree) as ReactElement
			} catch {
				return tree
			}
		} as FC<any>
		Object.defineProperty(wrapped, 'name', { value: (type as any).name || 'TypingRow' })
		wrappers.set(type, wrapped)
	}
	return wrapped
}

/** Inside a custom display: the glyph becomes Discord's dots (or goes, until they are known). */
function plainDisplay(tree: ReactNode): ReactNode {
	return rewrite(tree, el =>
		isGlyph(el) ? (dots ? cloneElement(dots, { key: el.key ?? 'dots' }) : null) : undefined,
	)
}

/** The typing row: learn the dots from plain ones, wrap custom displays. */
function plainRow(tree: ReactNode): ReactNode {
	let custom = false
	const out = rewrite(tree, el => {
		if (!isCustomDisplay(el)) return undefined
		custom = true
		seenCustom++
		const Display = wrap(el.type as Function, plainDisplay)
		return <Display key={el.key} {...el.props} />
	})
	if (!custom) learnDots(tree)
	return out
}

const renderItems = new WeakMap<Render, Render>()

export default plugin({
	start({ cleanup, plugin }) {
		// Discord keeps rendered rows; a reload makes every row go through the patch.
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}
		cleanup(
			getModules(
				(withProps as any)('useTypingUserIdsForDisplay'),
				(mod: any) => {
					const TypingIndicator = mod?.default
					if (typeof TypingIndicator?.type !== 'function') return
					cleanup(
						after(TypingIndicator, 'type', ((tree: any) => {
							try {
								const renderItem: Render | undefined = tree?.props?.renderItem
								if (typeof renderItem !== 'function') return tree
								let patched = renderItems.get(renderItem)
								if (!patched) {
									patched = (...args: any[]) => {
										const el = renderItem(...args)
										if (!isElement(el) || typeof el.type !== 'function') return el
										const row = el as AnyElement
										const Row = wrap(row.type as Function, plainRow)
										return <Row key={row.key} {...row.props} />
									}
									renderItems.set(renderItem, patched)
								}
								// Discord may reuse the element, so it is copied, never changed.
								return cloneElement(tree, { renderItem: patched })
							} catch {
								return tree
							}
						}) as never),
					)
				},
			),
		)
	},
	stop({ plugin }) {
		plugin.requireReload()
	},
})
