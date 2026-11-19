import { getAssetIdByName } from '@valenced/assets'
import { Design } from '@valenced/discord/design'
import { after } from '@valenced/patcher'
import { afterJSX } from '@valenced/react/jsx-runtime'
import { cloneElement, isValidElement } from 'react'
import { channelType, selectedChannelId } from './api'
import { findModule } from './find'

/**
 * The add-people ("make a group") button in a 1-on-1 DM's top bar. The DM header's buttons are
 * `PrivateChannelButtons` (the file Hide Call Buttons patches, and Forum Grid adds to); the button
 * is recognised by its label or its add-person icon, and only left out in 1-on-1 DMs.
 */

const DM = 1
const PATH =
	'modules/main_tabs_v2/native/channel/header/PrivateChannelButtons.tsx'
const LABEL =
	/add (friends?|people|members?|users?)|new group|create group|group (dm|chat)|start a group|invite/i
const ICON_NAMES = [
	'UserPlusIcon',
	'GroupPlusIcon',
	'UserAddIcon',
	'FriendsPlusIcon',
	'AddUserIcon',
	'PeoplePlusIcon',
]
const ICON_NAME = /UserPlus|GroupPlus|UserAdd|FriendsPlus|AddUser|PeoplePlus/

export const headerStatus = { hooked: false, removed: 0 }

let iconIds: Set<number> | undefined
function icons(): Set<number> {
	if (!iconIds) {
		iconIds = new Set()
		for (const n of ICON_NAMES)
			try {
				const id = getAssetIdByName(n as never)
				if (typeof id === 'number') iconIds.add(id)
			} catch {}
	}
	return iconIds
}

const isNode = (n: unknown): n is any =>
	isValidElement(n) ||
	(!!n &&
		typeof n === 'object' &&
		(n as any).$$typeof !== undefined &&
		typeof (n as any).props === 'object')

const nameOf = (t: any, depth = 0): string => {
	if (depth > 4 || !t || (typeof t !== 'function' && typeof t !== 'object'))
		return ''
	if (typeof t === 'function') return t.displayName || t.name || ''
	return (
		t.displayName ||
		nameOf(t.type, depth + 1) ||
		nameOf(t.render, depth + 1) ||
		''
	)
}

/** [node] is (or holds) the add-people button. */
function isAddButton(node: unknown, depth = 0): boolean {
	if (depth > 6 || !isNode(node)) return false
	const p = node.props
	for (const k of [
		'accessibilityLabel',
		'label',
		'aria-label',
		'accessibilityHint',
	])
		if (typeof p[k] === 'string' && LABEL.test(p[k])) return true
	for (const k of ['icon', 'source', 'IconComponent'])
		if (
			(typeof p[k] === 'number' && icons().has(p[k])) ||
			(p[k] && ICON_NAME.test(nameOf(p[k])))
		)
			return true
	if (ICON_NAME.test(nameOf(node.type))) return true
	const kids = p.children
	return (Array.isArray(kids) ? kids : [kids]).some(k =>
		isAddButton(k, depth + 1),
	)
}

/** A copy of [node] without its add-people button(s), cloning only along the way; same node if none. */
function without(node: unknown, depth = 0): unknown {
	if (depth > 6 || !isNode(node)) return node
	const kids = node.props.children
	if (kids == null) return node
	const list: unknown[] = Array.isArray(kids) ? kids : [kids]
	let changed = false
	const next: unknown[] = []
	for (const k of list) {
		// A button on its own in the row: drop it. Otherwise look deeper.
		if (isNode(k) && typeof k.props?.onPress === 'function' && isAddButton(k)) {
			changed = true
			headerStatus.removed++
			continue
		}
		const r = without(k, depth + 1)
		if (r !== k) changed = true
		next.push(r)
	}
	if (!changed) return node
	// Children go in as a prop: cloneElement keeps the old children when none are passed as arguments.
	return cloneElement(node, {
		children: next.length === 1 ? next[0] : next,
	} as any)
}

export function patchHeaderAddButton(enabled: () => boolean): () => void {
	const undo: Array<() => void> = []
	undo.push(
		findModule(PATH, [], (mod: any) => {
			const target = mod?.default
			const host =
				typeof target?.type === 'function'
					? { o: target, k: 'type' }
					: typeof target === 'function'
						? { o: mod, k: 'default' }
						: null
			if (!host) return
			headerStatus.hooked = true
			undo.push(
				after(host.o, host.k, ((out: unknown) => {
					try {
						if (!enabled() || channelType(selectedChannelId()) !== DM)
							return out
						return without(out)
					} catch {
						return out
					}
				}) as never),
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

/**
 * The "New Group — Create a new group with …" row on a 1-on-1 DM's details screen. Hooking
 * Discord's member-list action didn't reach it on every build, so the row itself is left out
 * wherever it's made, from Discord's row components, matched by its text (English).
 */
const NEW_GROUP = /^new group$/i
const NEW_GROUP_SUB = /^create a new group with/i
export const rowStatus = { hooked: [] as string[], removed: 0 }

const textIn = (v: unknown, depth = 0): string => {
	if (depth > 4 || v == null || typeof v === 'boolean') return ''
	if (typeof v === 'string' || typeof v === 'number') return String(v)
	if (Array.isArray(v)) return v.map(x => textIn(x, depth + 1)).join('')
	if (typeof v === 'object')
		return textIn((v as any).props?.children, depth + 1)
	return ''
}

export function hideNewGroupRow(enabled: () => boolean): () => void {
	const undo: Array<() => void> = []
	const D = Design as any
	for (const name of [
		'TableRow',
		'RowButton',
		'ActionSheetRow',
		'TableRowArrow',
		'FormRow',
	]) {
		const C = D[name]
		if (!C) continue
		rowStatus.hooked.push(name)
		undo.push(
			afterJSX(C, (el: any) => {
				if (!enabled()) return el
				const p = el?.props ?? {}
				const label = textIn(p.label ?? p.title)
				const sub = textIn(p.subLabel ?? p.subtitle ?? p.description)
				if (!NEW_GROUP.test(label.trim()) && !NEW_GROUP_SUB.test(sub.trim()))
					return el
				if (channelType(selectedChannelId()) !== DM) return el
				rowStatus.removed++
				return null
			}) as any,
		)
	}
	return () => {
		for (const u of undo.splice(0))
			try {
				u()
			} catch {}
		rowStatus.hooked = []
	}
}
