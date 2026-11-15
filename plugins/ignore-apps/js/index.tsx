import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { onFluxEventDispatched } from '@valenced/discord/flux'
import { useState } from 'react'
import {
	createMessageFilter,
	DEFAULT_SETTINGS,
	describeUser,
	isKnownHuman,
	parseUserId,
} from './filter'
import type { PluginApi } from '@valenced/plugins/types'
import type { Settings } from './filter'

type Api = PluginApi<{ jsonStorage: Settings }>

/** Events that carry a single message. */
const SINGLE_MESSAGE_EVENTS = ['MESSAGE_CREATE', 'MESSAGE_UPDATE']

/** Events that carry a batch of messages (history, mentions, pins). */
const MESSAGE_LIST_EVENTS = [
	'LOAD_MESSAGES_SUCCESS',
	'LOAD_RECENT_MENTIONS_SUCCESS',
	'LOAD_PINNED_MESSAGES_SUCCESS',
]

function toast(text: string) {
	ToastActionCreators.open('ignore-apps', { text, variant: 'success' })
}

async function update(api: Api, patch: Partial<Settings>) {
	const current = { ...DEFAULT_SETTINGS, ...(await api.jsonStorage.get()) }
	await api.jsonStorage.set({ ...current, ...patch }, true)
}

function SettingsPage({ api }: { api: Api }) {
	const {
		Stack,
		Text,
		TextInput,
		Button,
		TableRowGroup,
		TableRow,
		TableSwitchRow,
	} = Design
	const settings = { ...DEFAULT_SETTINGS, ...api.jsonStorage.use() }
	const [input, setInput] = useState('')

	const id = parseUserId(input)
	const error =
		input.trim() && !id
			? 'A Discord ID is a 17 to 20 digit number'
			: id && settings.ignored.some(e => e.id === id)
				? 'Already ignored'
				: undefined

	const add = async () => {
		if (!id) return
		const label = describeUser(id)
		await update(api, {
			ignored: [{ id, label, addedAt: Date.now() }, ...settings.ignored],
		})
		setInput('')
		toast(`Ignoring ${label}`)
	}

	const remove = async (removeId: string) => {
		await update(api, {
			ignored: settings.ignored.filter(e => e.id !== removeId),
		})
		toast(`Stopped ignoring ${describeUser(removeId)}`)
	}

	return (
		<Stack spacing={24} style={{ padding: 16 }}>
			<Stack spacing={12}>
				<TextInput
					label="App ID"
					placeholder="159985870458322944"
					value={input}
					onChange={setInput}
					isClearable
					status={error ? 'error' : 'default'}
					errorMessage={error}
					description={
						id && !error
							? `${describeUser(id)}${isKnownHuman(id) ? ' (this is a person, not an app, but ignoring still works)' : ''}`
							: 'Turn on Developer Mode in Discord, then long-press the app and copy its user ID.'
					}
				/>
				<Button text="Ignore" disabled={!id || !!error} onPress={add} />
			</Stack>

			<TableRowGroup title="Options">
				<TableSwitchRow
					label="Hide all apps"
					subLabel="Hide messages from every bot, not only the ones listed below"
					value={settings.hideAllApps}
					onValueChange={(hideAllApps: boolean) => update(api, { hideAllApps })}
				/>
				<TableSwitchRow
					label="Keep replies to my commands"
					subLabel="Still show an app's answer to a slash command you ran"
					value={settings.keepMyCommandReplies}
					onValueChange={(keepMyCommandReplies: boolean) =>
						update(api, { keepMyCommandReplies })
					}
				/>
			</TableRowGroup>

			{settings.ignored.length ? (
				<TableRowGroup title="Ignored apps">
					{settings.ignored.map(entry => (
						<TableRow
							key={entry.id}
							label={entry.label}
							subLabel={entry.id}
							trailing={
								<Button
									text="Unignore"
									size="sm"
									variant="secondary"
									onPress={() => remove(entry.id)}
								/>
							}
						/>
					))}
				</TableRowGroup>
			) : null}

			<Text variant="text-sm/medium" color="text-muted">
				Messages are hidden only on this device. Changes apply to newly loaded
				messages, so reopen a channel to refresh it.
			</Text>
		</Stack>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DEFAULT_SETTINGS,
	},
	start({ cleanup, jsonStorage }) {
		const isHidden = createMessageFilter(() =>
			jsonStorage.cache
				? { ...DEFAULT_SETTINGS, ...jsonStorage.cache }
				: undefined,
		)

		for (const type of SINGLE_MESSAGE_EVENTS)
			cleanup(
				onFluxEventDispatched(type, payload =>
					isHidden(payload.message) ? undefined : payload,
				),
			)

		for (const type of MESSAGE_LIST_EVENTS)
			cleanup(
				onFluxEventDispatched(type, payload => {
					if (Array.isArray(payload.messages))
						payload.messages = payload.messages.filter(
							(m: unknown) => !isHidden(m as never),
						)
					return payload
				}),
			)
	},
	SettingsComponent: SettingsPage,
})
