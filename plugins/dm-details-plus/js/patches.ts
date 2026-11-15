import { getModules } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	FilterScopes,
	withProps,
} from '@valenced/modules/finders/filters'
import { before, instead } from '@valenced/patcher'
import { insteadJSX } from '@valenced/react/jsx-runtime'
import { createElement } from 'react'
import { channelType, getCollector, selectedChannelId } from './api'
import { GridPage } from './pages'
import type { Kind } from './api'

export interface Settings {
	hideNewGroup: boolean
	hideMembers: boolean
	hideFiles: boolean
	pinsGrid: boolean
	linksGrid: boolean
	stickersTab: boolean
	emojiTab: boolean
	stillPreviews: boolean
}

export const DEFAULT_SETTINGS: Settings = {
	hideNewGroup: true,
	hideMembers: true,
	hideFiles: true,
	pinsGrid: true,
	linksGrid: true,
	stickersTab: true,
	emojiTab: true,
	stillPreviews: true,
}

const DM = 1
const GROUP_DM = 3
const STICKERS_ID = 'dm-details-plus-stickers'
const EMOJI_ID = 'dm-details-plus-emoji'
/** Marks pages we replaced, so a second pass leaves them alone. */
const OURS = Symbol('dm-details-plus')

interface TabItem {
	id: string
	label: string
	page?: any
	[OURS]?: true
	[key: string]: unknown
}

const is = (item: TabItem, pattern: RegExp) =>
	pattern.test(String(item?.id ?? '')) ||
	pattern.test(String(item?.label ?? ''))

/** Channel ID from the existing pages' props (e.g. the Media page). */
function channelIdFromItems(items: TabItem[]): string | undefined {
	for (const item of items) {
		const props = item?.page?.props
		const id = props?.channelId ?? props?.channel?.id
		if (typeof id === 'string') return id
	}
	return undefined
}

/** The DM details tab list is the only one with Media and Pins tabs (Members may already be gone). */
function isDetailsTabs(items: unknown): items is TabItem[] {
	return (
		Array.isArray(items) &&
		items.some(i => is(i, /media/i)) &&
		items.some(i => is(i, /pin/i)) &&
		(items.some(i => is(i, /member/i)) || items.some(i => i?.[OURS]))
	)
}

const grid = (kind: Kind, channelId: string, key: string) =>
	createElement(GridPage, { kind, channelId, key })

export function transformTabs(items: TabItem[], settings: Settings): TabItem[] {
	const channelId = channelIdFromItems(items) ?? selectedChannelId()
	const type = channelType(channelId)
	if (!channelId || (type !== DM && type !== GROUP_DM)) return items

	const kinds: Kind[] = []
	const result: TabItem[] = []
	for (const item of items) {
		if (item[OURS]) {
			result.push(item)
			continue
		}
		if (settings.hideFiles && is(item, /file/i)) continue
		if (settings.hideMembers && type === DM && is(item, /member/i)) continue
		if (settings.pinsGrid && is(item, /pin/i)) {
			kinds.push('pins')
			result.push({
				...item,
				page: grid('pins', channelId, item.id),
				[OURS]: true,
			})
			continue
		}
		if (settings.linksGrid && is(item, /link/i)) {
			kinds.push('links')
			result.push({
				...item,
				page: grid('links', channelId, item.id),
				[OURS]: true,
			})
			continue
		}
		result.push(item)
	}

	const add = (id: string, label: string, kind: Kind) => {
		if (result.some(i => i.id === id)) return
		kinds.push(kind)
		result.push({ id, label, page: grid(kind, channelId, id), [OURS]: true })
	}
	if (settings.stickersTab) add(STICKERS_ID, 'Stickers', 'stickers')
	if (settings.emojiTab) add(EMOJI_ID, 'Emoji', 'emoji')

	// Start loading every grid now, not when its tab is first shown.
	for (const kind of kinds) getCollector(kind, channelId).prefetch()
	return result
}

/** Keeps the opening tab the same after tabs before it were removed. */
export function remapIndex(
	from: TabItem[],
	to: TabItem[],
	index: unknown,
): number | undefined {
	if (typeof index !== 'number') return undefined
	const id = from[index]?.id
	const mapped = to.findIndex(i => i.id === id)
	return mapped === -1 ? 0 : mapped
}

/** Patches Discord's tab state hook so the details screen gets our tab list. */
export function patchTabs(
	getSettings: () => Settings,
	logger: { log(m: string): void; warn(m: string): void },
) {
	const unpatches: (() => void)[] = []
	// Same input list -> same output list, so Discord's memoisation keeps working.
	const cache = new WeakMap<object, TabItem[]>()
	// Lists we produced pass through untouched (keeps the same array identity).
	const produced = new WeakSet<object>()

	const unsubscribe = getModules(
		withProps<{ useSegmentedControlState: (props: any) => any }>(
			'useSegmentedControlState',
		),
		module => {
			try {
				unpatches.push(
					before(module, 'useSegmentedControlState', args => {
						const props = args[0]
						if (!isDetailsTabs(props?.items) || produced.has(props.items))
							return args
						let items = cache.get(props.items)
						if (!items) {
							items = transformTabs(props.items, getSettings())
							cache.set(props.items, items)
							produced.add(items)
						}
						if (items !== props.items) {
							const defaultIndex = remapIndex(
								props.items,
								items,
								props.defaultIndex,
							)
							args[0] = {
								...props,
								items,
								...(defaultIndex === undefined ? {} : { defaultIndex }),
							}
						}
						return args
					}),
				)
				logger.log('Patched useSegmentedControlState')
			} catch {
				// A read-only re-export; the source module gets patched instead.
			}
		},
		{ max: 5 },
	)

	return [
		unsubscribe,
		// Read the list when stopping: getModules may add patches later.
		() => {
			for (const unpatch of unpatches.splice(0)) unpatch()
		},
	]
}

/** Name of a component: plain, memo, forwardRef, or memo(forwardRef(...)). */
const nameOf = (value: unknown, depth = 0): string => {
	const v = value as any
	if (!v || depth > 3) return ''
	if (typeof v === 'function') return v.displayName || v.name || ''
	if (typeof v !== 'object') return ''
	return (
		v.displayName ||
		nameOf(v.type, depth + 1) ||
		nameOf(v.render, depth + 1) ||
		''
	)
}

/** Modules exporting a component with this name (default or named export). */
const withComponentName = createFilterGenerator<[name: string]>(
	([name], _id, exports) => {
		if (
			!exports ||
			(typeof exports !== 'object' && typeof exports !== 'function')
		)
			return false
		if (nameOf(exports) === name) return true
		if (typeof exports !== 'object') return false
		for (const key of Object.keys(exports)) {
			try {
				if (nameOf((exports as any)[key]) === name) return true
			} catch {}
		}
		return false
	},
	([name]) => `dev.ketsuyumi.dm-details-plus.componentName(${name})`,
	FilterScopes.Initialized,
)

/**
 * Hides the "New Group" button: the RowButton that Discord's `useMemberListAction` hook creates
 * on the details screen of a 1:1 DM.
 *
 * Cheap by design: only RowButton elements are intercepted (insteadJSX), and whether one comes
 * from useMemberListAction is a flag set while that hook runs, not a stack trace.
 */
export function patchNewGroup(
	getSettings: () => Settings,
	logger: { log(m: string): void; warn(m: string): void },
) {
	const unpatches: (() => void)[] = []
	let insideMemberListAction = 0
	let hookWrapped = false
	const patchedTypes = new WeakSet<object>()

	// 1. A flag while useMemberListAction runs.
	unpatches.push(
		getModules(
			withProps<{ useMemberListAction: (...args: any[]) => any }>(
				'useMemberListAction',
			),
			module => {
				try {
					unpatches.push(
						instead(module, 'useMemberListAction', (args, original) => {
							insideMemberListAction++
							try {
								return original(...args)
							} finally {
								insideMemberListAction--
							}
						}),
					)
					hookWrapped = true
				} catch {
					// Read-only re-export; the source module gets wrapped instead.
				}
			},
			{ max: 5 },
		),
	)

	const fromMemberListAction = () =>
		hookWrapped
			? insideMemberListAction > 0
			: // Fallback if Discord renamed the export: only reached for RowButtons, which are rare.
				String(new Error().stack).includes('useMemberListAction')

	// 2. Only RowButton elements are intercepted.
	unpatches.push(
		getModules(
			withComponentName('RowButton'),
			namespace => {
				const ns = namespace as any
				if (!ns || typeof ns !== 'object') return
				for (const key of Object.keys(ns)) {
					const type = ns[key]
					if (nameOf(type) !== 'RowButton' || !type || patchedTypes.has(type))
						continue
					patchedTypes.add(type)
					unpatches.push(
						insteadJSX(type, (args, jsx) => {
							if (
								getSettings().hideNewGroup &&
								fromMemberListAction() &&
								channelType(selectedChannelId()) === DM
							)
								return null
							return (jsx as (...a: unknown[]) => any)(...args)
						}) as unknown as () => void,
					)
					logger.log(`Watching RowButton (${key}) for New Group`)
				}
			},
			{ returnNamespace: true, max: 5 },
		),
	)

	return [
		() => {
			for (const unpatch of unpatches.splice(0)) unpatch()
		},
	]
}
