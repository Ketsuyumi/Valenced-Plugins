import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { useEffect, useState } from 'react'
import { findModule } from './find'
import { onSelectionChange, selection } from './selection'

/**
 * A select toggle in the chat input bar, beside the + / emoji buttons.
 *
 * Added the way Silent Typing and Silent Messages add theirs, so they all sit together: `after` on
 * `ChatInputActions` (left side) / `ChatInputRightActions` (right side), pushing one fixed element
 * into the row's children (Discord reuses the tree, so the same element is found and moved instead
 * of piling up). The button itself is Discord's own `ChatInputActionButton`.
 */

const BUTTON_PATH =
	'modules/chat_input/native/action_buttons/ChatInputActionButton.tsx'
const LEFT = 'modules/chat_input/native/action_buttons/ChatInputActions.tsx'
const RIGHT =
	'modules/chat_input/native/action_buttons/ChatInputRightActions.tsx'

export type Side = 'off' | 'left' | 'right'

interface Options {
	side: () => Side
	onPress: () => void
}
let options: Options | undefined
let ActionButton: any
let chatbarHooked = 0
export const chatbarStatus = () =>
	chatbarHooked
		? `Hooked (${chatbarHooked} of 2 sides)${ActionButton ? '' : ' · button loads when the chat bar opens'}`
		: 'Waiting for the chat bar'

const pick = (...names: string[]) =>
	names.map(name => lookupGeneratedIconComponent(name as never)).find(Boolean)

function SelectToggle() {
	const [, tick] = useState(0)
	const [Button, setButton] = useState<any>(() => ActionButton)
	useEffect(() => onSelectionChange(() => tick(n => n + 1)), [])
	useEffect(() => {
		if (Button) return
		return findModule(BUTTON_PATH, ['ChatInputActionButton'], (mod: any) => {
			const found = mod?.default ?? mod?.ChatInputActionButton
			if (typeof found !== 'function' && typeof found !== 'object') return
			ActionButton = found
			setButton(() => found)
		})
	}, [Button])
	const on = selection.active
	const Icon = on
		? pick('CircleXIcon', 'XSmallIcon', 'XLargeIcon')
		: pick('CircleCheckIcon', 'CheckmarkLargeIcon', 'CheckmarkSmallIcon')
	if (!Button || !Icon || !options) return null
	return (
		<Button
			accessibilityLabel={on ? 'Stop selecting' : 'Select messages'}
			accessibilityState={{ checked: on }}
			IconComponent={Icon}
			onPress={() => options?.onPress()}
		/>
	)
}

// One element, reused, so it can be found again in Discord's cached trees.
const button = <SelectToggle key="multi-select-toggle" />

function findChildrenArray(node: any, depth = 0): any[] | null {
	if (!node || typeof node !== 'object' || depth > 8) return null
	const children = node.props?.children
	if (Array.isArray(children)) return children
	return findChildrenArray(children, depth + 1)
}

function insert(tree: any, side: 'left' | 'right') {
	try {
		const children = findChildrenArray(tree)
		if (!children) return tree
		const index = children.indexOf(button)
		if (index !== -1) children.splice(index, 1)
		if (options?.side() === side) {
			// Left goes after the + button, right goes before the emoji button.
			if (side === 'left') children.push(button)
			else children.unshift(button)
		}
	} catch {}
	return tree
}

export function installChatbar(next: Options): () => void {
	options = next
	const undo: Array<() => void> = []
	for (const [path, side] of [
		[LEFT, 'left'],
		[RIGHT, 'right'],
	] as const)
		undo.push(
			findModule(path, [], (mod: any) => {
				const target = mod?.default
				if (typeof target?.type !== 'function') return
				chatbarHooked++
				undo.push(
					after(target, 'type', ((tree: any) => insert(tree, side)) as never),
				)
			}),
		)
	// Make sure a late load of the button module is noticed even before the first render.
	try {
		undo.push(
			getModuleWithImportedPath(BUTTON_PATH, (mod: any) => {
				ActionButton ??= mod?.default
			}) as any,
		)
	} catch {}
	return () => {
		for (const fn of undo.splice(0))
			try {
				fn?.()
			} catch {}
		options = undefined
		chatbarHooked = 0
	}
}
