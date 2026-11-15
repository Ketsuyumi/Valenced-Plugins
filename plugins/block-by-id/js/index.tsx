import {
	AlertActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import {
	blockUser,
	describeUser,
	errorMessage,
	isBlocked,
	isCurrentUser,
	parseUserId,
	unblockUser,
} from './relationships'
import type { PluginApi } from '@valenced/plugins/types'

interface BlockedEntry {
	id: string
	/** Name at the time of blocking, if Discord had the user cached. */
	label: string
	/** Unix time in milliseconds. */
	blockedAt: number
}

interface Settings {
	history: BlockedEntry[]
}

type Api = PluginApi<{ jsonStorage: Settings }>

const ALERT_KEY = 'block-by-id-confirm'

function toast(text: string, variant: 'default' | 'success' | 'critical') {
	ToastActionCreators.open('block-by-id', { text, variant })
}

async function addToHistory(api: Api, entry: BlockedEntry) {
	const history = (await api.jsonStorage.get()).history ?? []
	await api.jsonStorage.set(
		{ history: [entry, ...history.filter(e => e.id !== entry.id)] },
		true,
	)
}

async function removeFromHistory(api: Api, id: string) {
	const history = (await api.jsonStorage.get()).history ?? []
	await api.jsonStorage.set({ history: history.filter(e => e.id !== id) }, true)
}

async function doBlock(api: Api, id: string, label: string) {
	try {
		await blockUser(id)
		await addToHistory(api, { id, label, blockedAt: Date.now() })
		toast(`Blocked ${label}`, 'success')
	} catch (e) {
		api.logger.error(`Failed to block ${id}`, e)
		toast(`Couldn't block: ${errorMessage(e)}`, 'critical')
	}
}

async function doUnblock(api: Api, id: string) {
	try {
		await unblockUser(id)
		await removeFromHistory(api, id)
		toast(`Unblocked ${describeUser(id)}`, 'success')
	} catch (e) {
		api.logger.error(`Failed to unblock ${id}`, e)
		toast(`Couldn't unblock: ${errorMessage(e)}`, 'critical')
	}
}

function confirmBlock(api: Api, id: string) {
	const { AlertModal, AlertActionButton, Stack } = Design
	const label = describeUser(id)

	AlertActionCreators.openAlert(
		ALERT_KEY,
		<AlertModal
			title="Block user?"
			content={`${label}${label === id ? '' : `\nID: ${id}`}\n\nThey won't be able to message you, and their messages will be hidden.`}
			actions={
				<Stack>
					<AlertActionButton
						text="Block"
						variant="destructive"
						onPress={() => doBlock(api, id, label)}
					/>
					<AlertActionButton text="Cancel" variant="secondary" />
				</Stack>
			}
		/>,
	)
}

function SettingsPage({ api }: { api: Api }) {
	const { Stack, Text, TextInput, Button, TableRowGroup, TableRow } = Design
	const settings = api.jsonStorage.use()
	const [input, setInput] = useState('')

	const id = parseUserId(input)
	const error =
		input.trim() && !id
			? 'A Discord ID is a 17 to 20 digit number'
			: id && isCurrentUser(id)
				? "You can't block yourself"
				: id && isBlocked(id)
					? 'This user is already blocked'
					: undefined

	const history = settings?.history ?? []

	return (
		<Stack spacing={24} style={{ padding: 16 }}>
			<Stack spacing={12}>
				<TextInput
					label="Discord user ID"
					placeholder="123456789012345678"
					value={input}
					onChange={setInput}
					isClearable
					status={error ? 'error' : 'default'}
					errorMessage={error}
					description={
						id && !error
							? describeUser(id)
							: 'Turn on Developer Mode in Discord, then long-press a user and copy their ID.'
					}
				/>
				<Button
					text="Block"
					variant="destructive"
					disabled={!id || !!error}
					onPress={() => {
						if (!id) return
						confirmBlock(api, id)
						setInput('')
					}}
				/>
			</Stack>

			{history.length ? (
				<TableRowGroup title="Blocked with this plugin">
					{history.map(entry => (
						<TableRow
							key={entry.id}
							label={entry.label}
							subLabel={`${entry.id} · ${new Date(entry.blockedAt).toLocaleDateString()}`}
							trailing={
								<Button
									text="Unblock"
									size="sm"
									variant="secondary"
									onPress={() => doUnblock(api, entry.id)}
								/>
							}
						/>
					))}
				</TableRowGroup>
			) : (
				<Text variant="text-sm/medium" color="text-muted">
					Users you block here will be listed here, so you can unblock them
					later.
				</Text>
			)}
		</Stack>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: { history: [] },
	},
	start({ logger }) {
		logger.log('Block by ID started')
	},
	stop() {
		AlertActionCreators.dismissAlert(ALERT_KEY)
	},
	SettingsComponent: SettingsPage,
})
