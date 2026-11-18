import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { ScrollView } from 'react-native'
import { gridAvailable, hideGrid, installGrid, showGrid } from './grid'
import { headerStatus, installHeader } from './header'
import { installSheet, isForum } from './sheet'
import type { PinnedMode } from './data'
import type { PluginApi } from '@valenced/plugins/types'

interface Settings {
	/** "Open as grid" in a forum's long-press menu. */
	longPress: boolean
	/** A grid button in the forum's top bar. */
	topBar: boolean
	/** Open the grid by itself whenever you enter a forum. */
	replace: boolean
	columns: 2 | 3
	pinned: PinnedMode
}
type Api = PluginApi<{ jsonStorage: Settings }>

const DEFAULTS: Settings = {
	longPress: true,
	topBar: true,
	replace: false,
	columns: 2,
	pinned: 'first',
}

let settings: () => Settings = () => DEFAULTS

function open(channel: any) {
	if (!gridAvailable()) {
		try {
			ToastActionCreators.open('forum-grid', { text: "The grid couldn't be shown on this Discord version" } as never)
		} catch {}
		return
	}
	showGrid(channel)
}

const S = () => Stores as any
const selected = () => {
	const id = S().SelectedChannelStore?.getChannelId?.()
	return id ? S().ChannelStore?.getChannel?.(id) : undefined
}

function SettingsPage({ api }: { api: Api }) {
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow, TableRadioGroup, TableRadioRow } = Design as any
	const s = { ...DEFAULTS, ...api.jsonStorage.use() }
	const set = (patch: Partial<Settings>) => api.jsonStorage.set({ ...s, ...patch }, true)
	return (
		<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
			<Stack spacing={24}>
				<TableRowGroup title="Open the grid from">
					<TableSwitchRow
						label="Long-press menu"
						subLabel="Long-press a forum channel and choose Open as grid."
						value={s.longPress}
						onValueChange={(longPress: boolean) => set({ longPress })}
					/>
					<TableSwitchRow
						label="Top bar button"
						subLabel="A grid button next to search in a forum's top bar."
						value={s.topBar}
						onValueChange={(topBar: boolean) => set({ topBar })}
					/>
					<TableSwitchRow
						label="Replace the forum view"
						subLabel="Show the grid by itself whenever you open a forum. ✕ or back shows Discord's list."
						value={s.replace}
						onValueChange={(replace: boolean) => set({ replace })}
					/>
				</TableRowGroup>
				<TableRadioGroup
					title="Columns"
					defaultValue={String(s.columns)}
					value={String(s.columns)}
					onChange={(v: string) => set({ columns: v === '3' ? 3 : 2 })}
				>
					<TableRadioRow label="2 columns" value="2" />
					<TableRadioRow label="3 columns" value="3" />
				</TableRadioGroup>
				<TableRadioGroup
					title="Pinned posts"
					defaultValue={s.pinned}
					value={s.pinned}
					onChange={(pinned: PinnedMode) => set({ pinned })}
				>
					<TableRadioRow label="Show first" value="first" />
					<TableRadioRow label="Keep in place" value="normal" />
					<TableRadioRow label="Hide" value="hidden" />
				</TableRadioGroup>
				<TableRowGroup title="Status">
					<TableRow label="Grid" subLabel={gridAvailable() ? 'Ready' : 'Not attached yet (open any screen once)'} />
					<TableRow label="Top bar button" subLabel={headerStatus()} />
				</TableRowGroup>
				<Text variant="text-sm/medium" color="text-muted">
					In the grid: search, sort and Filters (tags, unread, followed, has image, my posts, date,
					reactions, pinned). Tap a post to open it. Mark read marks every loaded unread post read.
				</Text>
			</Stack>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }) {
		settings = () => ({ ...DEFAULTS, ...jsonStorage.cache })
		const write = (patch: Partial<Settings>) => jsonStorage.set({ ...settings(), ...patch }, true)

		cleanup(
			installGrid({
				read: () => ({ columns: settings().columns, pinned: settings().pinned }),
				write,
			}),
			installSheet({ enabled: () => settings().longPress, open }),
			installHeader({
				enabled: () => settings().topBar && isForum(selected()),
				active: () => false,
				onPress: () => {
					const channel = selected()
					if (isForum(channel)) open(channel)
				},
			}),
		)

		// Replace the forum view: open the grid once each time a forum is entered.
		let last: string | undefined
		const onSelect = () => {
			const channel = selected()
			const id = channel?.id
			if (id === last) return
			last = id
			if (settings().replace && isForum(channel)) open(channel)
		}
		const store = S().SelectedChannelStore
		store?.addChangeListener?.(onSelect)
		cleanup(() => {
			store?.removeChangeListener?.(onSelect)
			hideGrid()
		})
	},
	SettingsComponent: SettingsPage,
})
