import { isValidElement } from 'react'
import type { ReactNode } from 'react'

/** A confirmation dialog the plugin has seen. */
export interface SeenAlert {
	/** Stable id: the alert key with numbers (IDs) removed, plus its title. */
	id: string
	title: string
	/** Text of the button that gets pressed when skipping, if one was found. */
	confirmText: string | null
	/** Discord's alert key (with numbers removed), for reference. */
	key: string
	/** Prop names of the alert element, to add support for dialogs that can't be skipped yet. */
	shape: string
	lastSeen: number
}

const MAX_DEPTH = 8

/** All text inside a React node (title elements, nested Text, arrays). */
export function textOf(node: ReactNode, depth = 0): string {
	if (node == null || typeof node === 'boolean' || depth > MAX_DEPTH) return ''
	if (typeof node === 'string' || typeof node === 'number') return String(node)
	if (Array.isArray(node)) return node.map(n => textOf(n, depth + 1)).join('')
	if (isValidElement<{ children?: ReactNode }>(node))
		return textOf(node.props.children, depth + 1)
	return ''
}

interface Button {
	text: string
	variant?: string
	onPress: () => unknown
}

/** Buttons (elements with onPress) inside the alert's actions. */
function buttonsIn(node: ReactNode, out: Button[] = [], depth = 0): Button[] {
	if (!node || depth > MAX_DEPTH) return out
	if (Array.isArray(node)) {
		for (const child of node) buttonsIn(child, out, depth + 1)
		return out
	}
	if (!isValidElement<any>(node)) return out
	const props = node.props as any
	if (typeof props.onPress === 'function')
		out.push({
			text: String(props.text ?? textOf(props.children) ?? ''),
			variant: props.variant,
			onPress: props.onPress,
		})
	buttonsIn(props.children, out, depth + 1)
	return out
}

/** The confirming action of an alert: an onConfirm prop, or its destructive/primary button. */
export function findConfirm(
	element: unknown,
): { text: string; run: () => unknown } | null {
	if (!isValidElement<any>(element)) return null
	const props = element.props as any
	if (typeof props.onConfirm === 'function')
		return {
			text: String(
				props.confirmText ?? textOf(props.confirmButtonText) ?? 'Confirm',
			),
			run: () => props.onConfirm(),
		}
	const buttons = buttonsIn(props.actions)
	const confirm =
		buttons.find(b => b.variant === 'destructive') ??
		buttons.find(b => b.variant === 'primary') ??
		buttons.find(b => b.variant !== 'secondary' && b.variant !== 'tertiary')
	return confirm ? { text: confirm.text, run: () => confirm.onPress() } : null
}

/** Describes an alert, with an id that stays the same across messages, users and servers. */
export function describe(key: string, element: unknown): SeenAlert {
	const props = isValidElement<any>(element) ? (element.props as any) : {}
	const cleanKey = String(key)
		.replace(/\d{5,}/g, '#')
		.replace(/\d+/g, '#')
	const title =
		textOf(props.title).trim() ||
		textOf(props.content).trim().slice(0, 60) ||
		cleanKey
	const confirm = findConfirm(element)
	return {
		id: `${cleanKey}|${title}`,
		title,
		confirmText: confirm?.text ?? null,
		key: cleanKey,
		shape: Object.keys(props).join(','),
		lastSeen: Date.now(),
	}
}
