import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { DEFAULT_SETTINGS, patchNewGroup, patchTabs } from './patches'
import type { PluginApi } from '@valenced/plugins/types'
import type { Settings } from './patches'

type Api = PluginApi<{ jsonStorage: Settings }>

async function update(api: Api, patch: Partial<Settings>) {
	const current = { ...DEFAULT_SETTINGS, ...(await api.jsonStorage.get()) }
	await api.jsonStorage.set({ ...current, ...patch }, true)
}

function SettingsPage({ api }: { api: Api }) {
	const { Stack, Text, TableRowGroup, TableSwitchRow } = Design
	const settings = { ...DEFAULT_SETTINGS, ...api.jsonStorage.use() }

	const row = (key: keyof Settings, label: string, subLabel: string) => (
		<TableSwitchRow
			label={label}
			subLabel={subLabel}
			value={settings[key]}
			onValueChange={(value: boolean) => update(api, { [key]: value })}
		/>
	)

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ padding: 16 }}
			keyboardShouldPersistTaps="handled"
		>
			<Stack spacing={24}>
				<TableRowGroup title="DM details screen">
					{row('hideNewGroup', 'Hide "New Group" button', 'In one-to-one DMs')}
					{row('hideFiles', 'Hide Files tab', 'In DMs and group DMs')}
					{row(
						'stickersTab',
						'Stickers tab',
						'Stickers sent by both of you, from Discord search',
					)}
					{row(
						'emojiTab',
						'Emoji tab',
						'Custom emoji sent by both of you, found by scanning messages',
					)}
				</TableRowGroup>
				<Text variant="text-sm/medium" color="text-muted">
					Changes apply the next time you open a DM's details. Tap a sticker or
					emoji to see its name and how often it was sent.
				</Text>
			</Stack>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DEFAULT_SETTINGS,
	},
	start({ cleanup, jsonStorage, logger }) {
		const getSettings = () => ({ ...DEFAULT_SETTINGS, ...jsonStorage.cache })
		cleanup(...patchTabs(getSettings, logger), ...patchNewGroup(getSettings))
	},
	SettingsComponent: SettingsPage,
})
