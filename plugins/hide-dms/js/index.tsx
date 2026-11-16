import { Design } from '@valenced/discord/design'
import { useMemo, useState } from 'react'
import { Image, ScrollView } from 'react-native'
import {
	DEFAULT_SETTINGS,
	DM,
	GROUP_DM,
	listConversations,
	patchStores,
	refreshLists,
} from './channels'
import type { PluginApi } from '@valenced/plugins/types'
import type { Settings } from './channels'

type Api = PluginApi<{ jsonStorage: Settings }>

async function update(api: Api, patch: Partial<Settings>) {
	const current = { ...DEFAULT_SETTINGS, ...(await api.jsonStorage.get()) }
	await api.jsonStorage.set({ ...current, ...patch }, true)
}

function Avatar({ url }: { url: string }) {
	return (
		<Image
			source={{ uri: url }}
			style={{ width: 32, height: 32, borderRadius: 16 }}
		/>
	)
}

function SettingsPage({ api }: { api: Api }) {
	const { Stack, Text, TextInput, TableRowGroup, TableSwitchRow } = Design
	const settings = { ...DEFAULT_SETTINGS, ...api.jsonStorage.use() }
	const [query, setQuery] = useState('')

	// Read once per visit; the list doesn't need to update live.
	const conversations = useMemo(() => listConversations(), [])

	const q = query.trim().toLowerCase()
	const shown = q
		? conversations.filter(c => c.name.toLowerCase().includes(q))
		: conversations

	const toggle = (id: string, hide: boolean) =>
		update(api, {
			hidden: hide
				? [...settings.hidden.filter(h => h !== id), id]
				: settings.hidden.filter(h => h !== id),
		})

	const coveredByAll = (type: number) =>
		(type === DM && settings.hideAllDms) ||
		(type === GROUP_DM && settings.hideAllGroups)

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ padding: 16 }}
			keyboardShouldPersistTaps="handled"
		>
			<Stack spacing={24}>
				<TableRowGroup title="Hide everything">
					<TableSwitchRow
						label="Hide all DMs"
						subLabel="One-to-one conversations"
						value={settings.hideAllDms}
						onValueChange={(hideAllDms: boolean) => update(api, { hideAllDms })}
					/>
					<TableSwitchRow
						label="Hide all group DMs"
						value={settings.hideAllGroups}
						onValueChange={(hideAllGroups: boolean) =>
							update(api, { hideAllGroups })
						}
					/>
				</TableRowGroup>

				<Stack spacing={12}>
					<TextInput
						placeholder="Search conversations"
						value={query}
						onChange={setQuery}
						isClearable
					/>
					{shown.length ? (
						<TableRowGroup title="Conversations" hasIcons>
							{shown.map(c => (
								<TableSwitchRow
									key={c.id}
									label={c.name}
									subLabel={c.type === GROUP_DM ? 'Group DM' : 'DM'}
									icon={<Avatar url={c.avatarUrl} />}
									disabled={coveredByAll(c.type)}
									value={coveredByAll(c.type) || settings.hidden.includes(c.id)}
									onValueChange={(hide: boolean) => toggle(c.id, hide)}
								/>
							))}
						</TableRowGroup>
					) : (
						<Text variant="text-sm/medium" color="text-muted">
							{conversations.length
								? 'No conversations match your search.'
								: "Couldn't read your DM list. Open your DMs once, then come back."}
						</Text>
					)}
				</Stack>

				<Text variant="text-sm/medium" color="text-muted">
					Hiding only removes conversations from your DM list on this device.
					You don't leave them, and you still get messages and notifications.
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
		const { unpatches, patched, refresh } = patchStores(() =>
			jsonStorage.cache
				? { ...DEFAULT_SETTINGS, ...jsonStorage.cache }
				: undefined,
		)

		if (patched.length)
			logger.log(`Filtering DM list via ${patched.join(', ')}`)
		else
			logger.warn("Couldn't find Discord's DM list methods; nothing is hidden")

		cleanup(
			// Cleanups run in reverse order, so this runs last on stop,
			// after the unpatches: show everything again.
			() => refreshLists(),
			jsonStorage.subscribe(() => {
				refresh()
				refreshLists()
			}),
			...unpatches,
		)
		// Settings load asynchronously; pick them up once they are in.
		jsonStorage.get().then(() => {
			refresh()
			refreshLists()
		})
		refreshLists()
	},
	SettingsComponent: SettingsPage,
})
