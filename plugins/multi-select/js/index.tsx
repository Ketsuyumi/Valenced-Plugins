import {
	ActionSheetActionCreators,
	AlertActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Dispatcher } from '@valenced/discord/common/flux'
import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { after, before } from '@valenced/patcher'
import {
	cloneElement,
	createElement,
	isValidElement,
	useEffect,
	useState,
} from 'react'
import { processColor, ScrollView } from 'react-native'
import { barAvailable, installBar } from './bar'
import { findModule } from './find'
import { handlerStatus, installHandlers, targetOf } from './handlers'
import { canDelete, canDeleteAtAll, deleteAll, watchActions } from './remove'
import {
	clear,
	forget,
	isSelected,
	onSelectionChange,
	selection,
	start,
	toggle,
	watchChannelMessages,
} from './selection'
import type { PluginApi } from '@valenced/plugins/types'

interface Settings {
	/** Highlight colour of selected messages. */
	color: string
	/**
	 * Double-tap selects and deselects while selecting. A new key in 1.1.0 (was `doubleTap`, on by
	 * default) so it starts off for everyone.
	 */
	doubleTapSelect: boolean
}
type Api = PluginApi<{ jsonStorage: Settings }>

const DEFAULTS: Settings = { color: '#5865F2', doubleTapSelect: false }
const COLORS: [string, string][] = [
	['#5865F2', 'Blurple'],
	['#23A55A', 'Green'],
	['#F0B232', 'Yellow'],
	['#EB459E', 'Pink'],
	['#F23F42', 'Red'],
]

let enabled = false
let settings: () => Settings = () => DEFAULTS

function toast(text: string) {
	try {
		ToastActionCreators.open('multi-select', { text } as never)
	} catch {}
}

function hint() {
	const n = selection.ids.size
	toast(
		n
			? barAvailable()
				? `${n} selected · long-press messages to add or remove them`
				: `${n} selected · long-press for Delete`
			: 'Selection cleared',
	)
}

// ---------------------------------------------------------------------------------------------
// The options while selecting: long-press any message.

function openOptions(channelId: string, messageId?: string) {
	const { AlertModal, AlertActionButton } = Design as any
	const key = `multi-select-${Date.now()}`
	const close = () => (AlertActionCreators as any).dismissAlert(key)
	const ids = [...selection.ids]
	const deletable = ids.filter(id => canDelete(channelId, id))
	const blocked = ids.length - deletable.length
	const here = messageId ? isSelected(channelId, messageId) : false
	;(AlertActionCreators as any).openAlert(
		key,
		<AlertModal
			title={`${ids.length} message${ids.length === 1 ? '' : 's'} selected`}
			content={
				blocked
					? `${deletable.length} can be deleted. ${blocked} ${blocked === 1 ? "isn't yours" : "aren't yours"} and you can't delete other people's messages here.`
					: 'Deleting removes them for everyone. This cannot be undone.'
			}
			actions={
				<>
					{deletable.length ? (
						<AlertActionButton
							text={`Delete ${deletable.length}`}
							variant="destructive"
							onPress={() => {
								close()
								void runDelete(channelId, deletable)
							}}
						/>
					) : null}
					{messageId ? (
						<AlertActionButton
							text={here ? 'Deselect this message' : 'Select this message'}
							variant="secondary"
							onPress={() => {
								close()
								toggle(channelId, messageId)
								hint()
							}}
						/>
					) : null}
					<AlertActionButton
						text="Clear selection"
						variant="secondary"
						onPress={() => {
							close()
							clear()
							hint()
						}}
					/>
					<AlertActionButton
						text="Keep selecting"
						variant="secondary"
						onPress={close}
					/>
				</>
			}
		/>,
	)
}

async function runDelete(channelId: string, ids: string[]) {
	if (!canDeleteAtAll()) {
		toast("Couldn't find Discord's delete action")
		return
	}
	toast(`Deleting ${ids.length}…`)
	const { deleted, failed } = await deleteAll(channelId, ids, () => {})
	forget(deleted)
	if (!failed.length) clear()
	toast(
		failed.length
			? `Deleted ${deleted.length}, ${failed.length} failed (still selected)`
			: `Deleted ${deleted.length} message${deleted.length === 1 ? '' : 's'}`,
	)
}

// ---------------------------------------------------------------------------------------------
// "Select messages" in the message long-press menu (the HideMessages technique: remember the
// message when the sheet opens, then add a row shaped like the sheet's last row).

const SHEET_KEY = 'MessageLongPressActionSheet'
let pending: { message: any } | null = null

const isRow = (c: any) =>
	!!c && typeof c === 'object' && !!c.props && typeof c.props.label === 'string'

function lastRowArray(node: any, depth = 0): any[] | null {
	if (!node || typeof node !== 'object' || depth > 24) return null
	let found: any[] | null = null
	if (Array.isArray(node)) {
		if (node.some(isRow)) found = node
		for (const child of node) found = lastRowArray(child, depth + 1) ?? found
		return found
	}
	return node.props ? lastRowArray(node.props.children, depth + 1) : null
}

function withSelectRow(rendered: any) {
	const message = pending?.message
	if (!enabled || !message?.id) return rendered
	const rows = lastRowArray(rendered)
	if (!rows) return rendered
	const at = rows.reduce(
		(last: number, c: any, i: number) => (isRow(c) ? i : last),
		-1,
	)
	const template = rows[at]
	if (!template?.type) return rendered
	const channelId = message.channel_id ?? message.channelId
	const selected = isSelected(channelId, message.id)
	rows.splice(
		at + 1,
		0,
		createElement(template.type, {
			key: 'multi-select',
			label: selected ? 'Deselect message' : 'Select messages',
			icon: template.props?.icon,
			onPress: () => {
				try {
					;(ActionSheetActionCreators as any).hideActionSheet?.()
				} catch {}
				if (selected) toggle(channelId, message.id)
				else start(channelId, message.id)
				hint()
			},
		}),
	)
	return rendered
}

// ---------------------------------------------------------------------------------------------

function SettingsPage({ api }: { api: Api }) {
	const {
		Stack,
		Text,
		TableRowGroup,
		TableRow,
		TableSwitchRow,
		TableRadioGroup,
		TableRadioRow,
	} = Design as any
	const s = { ...DEFAULTS, ...api.jsonStorage.use() }
	const set = (patch: Partial<Settings>) =>
		api.jsonStorage.set({ ...s, ...patch }, true)
	const [, tick] = useState(0)
	useEffect(() => onSelectionChange(() => tick(n => n + 1)), [])
	return (
		<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
			<Stack spacing={24}>
				<TableRowGroup title="How to use">
					<TableRow
						label="1. Long-press a message"
						subLabel="Choose Select messages. A bar shows at the top."
					/>
					<TableRow
						label="2. Long-press more messages"
						subLabel="Each one is highlighted. Long-press again to remove it."
					/>
					<TableRow
						label="3. Tap ⋮ in the bar"
						subLabel="Delete them or clear the selection. ✕ stops selecting."
					/>
				</TableRowGroup>
				<TableRowGroup title="Options">
					<TableSwitchRow
						label="Double-tap to select"
						subLabel="Double-tap also adds or removes messages while selecting. Leave off if another plugin uses double-tap."
						value={s.doubleTapSelect}
						onValueChange={(doubleTapSelect: boolean) =>
							set({ doubleTapSelect })
						}
					/>
				</TableRowGroup>
				<TableRadioGroup
					title="Highlight colour"
					defaultValue={s.color}
					value={s.color}
					onChange={(color: string) => set({ color })}
				>
					{COLORS.map(([value, label]) => (
						<TableRadioRow key={value} label={label} value={value} />
					))}
				</TableRadioGroup>
				<TableRowGroup title="Status">
					<TableRow label="Chat gestures" subLabel={handlerStatus} />
					<TableRow
						label="Selected now"
						subLabel={
							selection.active ? `${selection.ids.size} message(s)` : 'Nothing'
						}
					/>
					{selection.active ? (
						<TableRow label="Clear selection" arrow onPress={() => clear()} />
					) : null}
				</TableRowGroup>
				<Text variant="text-sm/medium" color="text-muted">
					You can always delete your own messages. Other people's can only be
					deleted in servers where you have Manage Messages. Messages are
					deleted one at a time, a third of a second apart, to stay within
					Discord's limits.
				</Text>
			</Stack>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }) {
		enabled = true
		settings = () => ({ ...DEFAULTS, ...jsonStorage.cache })
		cleanup(() => {
			enabled = false
			pending = null
			if (selection.active) clear()
		})
		cleanup(watchChannelMessages(), watchActions())
		cleanup(
			installBar({
				options: () => {
					if (selection.channelId) openOptions(selection.channelId)
				},
				cancel: () => {
					clear()
					hint()
				},
			}),
		)

		// Highlight selected rows. The row descriptor Discord draws from carries
		// `backgroundHighlight: { backgroundColor, gutterColor }` (ARGB numbers), the same field
		// mentions and Ghost Log's deleted messages use.
		const patched = new WeakSet<object>()
		cleanup(
			getModules(
				withName<any>('RowManager'),
				(RowManager: any) => {
					const proto = RowManager?.prototype
					if (typeof proto?.generate !== 'function' || patched.has(proto))
						return
					patched.add(proto)
					cleanup(
						after(proto, 'generate', ((row: any) => {
							try {
								const message = row?.message
								if (!selection.active || !message) return row
								if (!isSelected(message.channelId, message.id)) return row
								const color = settings().color || DEFAULTS.color
								row.backgroundHighlight = {
									backgroundColor: processColor(`${color}40`),
									gutterColor: processColor(color),
								}
							} catch {}
							return row
						}) as never),
					)
				},
				{ max: 10 },
			),
		)

		// Gestures while selecting.
		cleanup(
			installHandlers({
				handleDoubleTapMessage: (instance, original) =>
					function (this: unknown, ...args: any[]) {
						try {
							if (enabled && selection.active && settings().doubleTapSelect) {
								const { messageId, channel } = targetOf(instance, args[0])
								if (messageId && channel?.id === selection.channelId) {
									toggle(channel.id, messageId)
									hint()
									return
								}
							}
						} catch {}
						return original.apply(this, args)
					},
				handleLongPressMessage: (instance, original) =>
					function (this: unknown, ...args: any[]) {
						try {
							if (enabled && selection.active) {
								const { messageId, channel } = targetOf(instance, args[0])
								if (channel?.id === selection.channelId) {
									// With the bar up, long-press adds or removes, like a chat app; the
									// options are behind ⋮. Without it, long-press opens the options.
									if (barAvailable() && messageId) {
										toggle(channel.id, messageId)
										hint()
									} else openOptions(channel.id, messageId)
									return
								}
							}
						} catch {}
						return original.apply(this, args)
					},
			}),
		)

		// "Select messages" in the long-press menu.
		cleanup(
			findModule(
				'modules/action_sheet/native/ActionSheetActionCreators.tsx',
				['openLazy', 'hideActionSheet'],
				(mod: any) => {
					const host = typeof mod?.openLazy === 'function' ? mod : mod?.default
					if (typeof host?.openLazy !== 'function') return
					cleanup(
						before(host, 'openLazy', ((args: any[]) => {
							const [, key, props] = args ?? []
							if (key === SHEET_KEY && props?.message)
								pending = { message: props.message }
							else if (key === SHEET_KEY) pending = null
							return args
						}) as never),
					)
				},
			),
			findModule(
				'modules/messages/native/long_press/LongPressMessageActionSheet.tsx',
				['LongPressMessageActionSheet'],
				(mod: any) => {
					if (typeof mod?.default !== 'function') return
					cleanup(
						after(mod, 'default', ((rendered: any) => {
							try {
								return isValidElement(rendered) || Array.isArray(rendered)
									? withSelectRow(rendered)
									: rendered
							} catch {
								return rendered
							}
						}) as never),
					)
				},
			),
		)

		// Leaving the channel ends the selection.
		const onChannel = (event: any) => {
			if (
				selection.active &&
				event?.channelId &&
				event.channelId !== selection.channelId
			)
				clear()
		}
		;(Dispatcher as any).subscribe('CHANNEL_SELECT', onChannel)
		cleanup(() => (Dispatcher as any).unsubscribe('CHANNEL_SELECT', onChannel))
	},
	SettingsComponent: SettingsPage,
})
