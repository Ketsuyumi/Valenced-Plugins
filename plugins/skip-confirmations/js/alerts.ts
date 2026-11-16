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

export interface Http {
	put(request: { url: string; body?: unknown }): Promise<unknown>
	del(request: { url: string; body?: unknown }): Promise<unknown>
}

interface RestAction {
	/** What the skip does, shown in settings. */
	label: string
	run(props: any, http: Http): Promise<unknown> | undefined
}

/**
 * Alerts with no confirm button in their props: skipping them means doing the action through
 * Discord's API (keyed by the alert key).
 */
export const REST_ALERTS: Record<string, RestAction> = {
	'guild-action-sheet-leave-server': {
		label: 'Leave server',
		run: (p, http) =>
			p?.guild?.id
				? http.del({
						url: `/users/@me/guilds/${p.guild.id}`,
						body: { lurking: false },
					})
				: undefined,
	},
	'remove-friend': {
		label: 'Remove friend',
		run: (p, http) =>
			p?.user?.id
				? http.del({ url: `/users/@me/relationships/${p.user.id}` })
				: undefined,
	},
	'cancel-friend-request': {
		label: 'Cancel friend request',
		run: (p, http) =>
			p?.user?.id
				? http.del({ url: `/users/@me/relationships/${p.user.id}` })
				: undefined,
	},
}

/** Confirmation action sheets (opened with openLazy), keyed by sheet name. */
export const REST_SHEETS: Record<string, RestAction & { title: string }> = {
	BlockConfirmationActionSheet: {
		title: 'Block user',
		label: 'Block',
		run: (p, http) =>
			p?.userId
				? http.put({
						url: `/users/@me/relationships/${p.userId}`,
						body: { type: 2 },
					})
				: undefined,
	},
	IgnoreConfirmationActionSheet: {
		title: 'Ignore user',
		label: 'Ignore',
		run: (p, http) =>
			p?.userId
				? http.put({ url: `/users/@me/relationships/${p.userId}/ignore` })
				: undefined,
	},
}

export const isConfirmationSheet = (key: unknown): key is string =>
	typeof key === 'string' && /ConfirmationActionSheet$/.test(key)

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

/**
 * The confirming action of an alert: an onConfirm prop, its destructive/primary button, or a
 * known API action for alerts without a button.
 */
export function findConfirm(
	element: unknown,
	key = '',
	http?: () => Http | undefined,
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
	if (confirm) return { text: confirm.text, run: () => confirm.onPress() }
	const rest = REST_ALERTS[key]
	if (rest && http)
		return {
			text: rest.label,
			run: () => {
				const api = http()
				const sent = api ? rest.run(props, api) : undefined
				if (!sent)
					throw new Error(
						`Couldn't ${rest.label.toLowerCase()}: missing details`,
					)
				return sent
			},
		}
	return null
}

/** A confirmation action sheet, described like an alert. */
export function describeSheet(key: string): SeenAlert {
	const known = REST_SHEETS[key]
	return {
		id: `sheet:${key}`,
		title:
			known?.title ??
			key
				.replace(/ConfirmationActionSheet$/, '')
				.replace(/([a-z])([A-Z])/g, '$1 $2'),
		confirmText: known?.label ?? null,
		key,
		shape: 'action sheet',
		lastSeen: Date.now(),
	}
}

/** Describes an alert, with an id that stays the same across messages, users and servers. */
export function describe(
	key: string,
	element: unknown,
	http?: () => Http | undefined,
): SeenAlert {
	const props = isValidElement<any>(element) ? (element.props as any) : {}
	const cleanKey = String(key)
		.replace(/\d{5,}/g, '#')
		.replace(/\d+/g, '#')
	const title =
		textOf(props.title).trim() ||
		textOf(props.content).trim().slice(0, 60) ||
		cleanKey
	const confirm = findConfirm(element, String(key), http)
	return {
		id: `${cleanKey}|${title}`,
		title,
		confirmText: confirm?.text ?? null,
		key: cleanKey,
		shape: Object.keys(props).join(','),
		lastSeen: Date.now(),
	}
}
