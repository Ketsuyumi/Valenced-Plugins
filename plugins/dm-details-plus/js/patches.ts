import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { before, instead } from '@valenced/patcher'
import { React, ReactJSXRuntime } from '@valenced/react'
import { createElement } from 'react'
import { channelType, selectedChannelId } from './api'
import { EmojiPage, StickersPage } from './pages'

export interface Settings {
	hideNewGroup: boolean
	hideFiles: boolean
	stickersTab: boolean
	emojiTab: boolean
}

export const DEFAULT_SETTINGS: Settings = {
	hideNewGroup: true,
	hideFiles: true,
	stickersTab: true,
	emojiTab: true,
}

const DM = 1
const GROUP_DM = 3
const STICKERS_ID = 'dm-details-plus-stickers'
const EMOJI_ID = 'dm-details-plus-emoji'

interface TabItem {
	id: string
	label: string
	page?: any
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

/** The DM details tab list is the only one with Members, Media and Pins. */
function isDetailsTabs(items: unknown): items is TabItem[] {
	return (
		Array.isArray(items) &&
		items.some(i => is(i, /member/i)) &&
		items.some(i => is(i, /media/i)) &&
		items.some(i => is(i, /pin/i))
	)
}

export function transformTabs(items: TabItem[], settings: Settings): TabItem[] {
	const channelId = channelIdFromItems(items) ?? selectedChannelId()
	const type = channelType(channelId)
	if (!channelId || (type !== DM && type !== GROUP_DM)) return items

	let result = settings.hideFiles ? items.filter(i => !is(i, /file/i)) : items

	if (settings.stickersTab && !result.some(i => i.id === STICKERS_ID))
		result = [
			...result,
			{
				id: STICKERS_ID,
				label: 'Stickers',
				page: createElement(StickersPage, { channelId, key: STICKERS_ID }),
			},
		]
	if (settings.emojiTab && !result.some(i => i.id === EMOJI_ID))
		result = [
			...result,
			{
				id: EMOJI_ID,
				label: 'Emoji',
				page: createElement(EmojiPage, { channelId, key: EMOJI_ID }),
			},
		]
	return result
}

/** Patches Discord's tab state hook so the details screen gets our tab list. */
export function patchTabs(
	getSettings: () => Settings,
	logger: { log(m: string): void; warn(m: string): void },
) {
	const unpatches: (() => void)[] = []
	// Same input list -> same output list, so Discord's memoisation keeps working.
	const cache = new WeakMap<object, TabItem[]>()

	const unsubscribe = getModules(
		withProps<{ useSegmentedControlState: (props: any) => any }>(
			'useSegmentedControlState',
		),
		module => {
			try {
				unpatches.push(
					before(module, 'useSegmentedControlState', args => {
						const props = args[0]
						if (!isDetailsTabs(props?.items)) return args
						let items = cache.get(props.items)
						if (!items) {
							items = transformTabs(props.items, getSettings())
							cache.set(props.items, items)
						}
						if (items !== props.items) args[0] = { ...props, items }
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

function isRowButton(type: unknown): boolean {
	const t = type as any
	const name = t?.displayName ?? t?.name ?? t?.type?.name ?? t?.render?.name
	return name === 'RowButton'
}

/**
 * Hides the "New Group" button: the RowButton that Discord's
 * `useMemberListAction` hook creates on the details screen of a 1:1 DM.
 */
export function patchNewGroup(getSettings: () => Settings) {
	const unpatches: (() => void)[] = []
	const runtime = ReactJSXRuntime as any

	const hook = (args: any[], original: (...a: any[]) => any) => {
		if (
			isRowButton(args[0]) &&
			getSettings().hideNewGroup &&
			channelType(selectedChannelId()) === DM &&
			String(new Error().stack).includes('useMemberListAction')
		)
			return null
		return original(...args)
	}

	for (const key of ['jsx', 'jsxs'])
		if (typeof runtime[key] === 'function')
			unpatches.push(instead(runtime, key, hook as never))
	unpatches.push(instead(React as any, 'createElement', hook as never))
	return unpatches
}
