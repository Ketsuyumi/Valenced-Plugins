import {
	AlertActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { Image } from 'react-native'
import {
	blockUser,
	errorMessage,
	fetchUserInfo,
	isBlocked,
	isCurrentUser,
	parseUserId,
	unblockUser,
} from './relationships'
import type { PluginApi } from '@valenced/plugins/types'
import type { UserInfo } from './relationships'

interface BlockedEntry {
	id: string
	/** Name at the time of blocking (the ID if it couldn't be looked up). */
	label: string
	/** Profile picture at the time of blocking. */
	avatarUrl?: string
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

/** `undefined` while loading, `null` if the user couldn't be found. */
function useUserInfo(id: string | null) {
	const [info, setInfo] = useState<{ id: string; user: UserInfo | null }>()

	useEffect(() => {
		if (!id) return
		let active = true
		fetchUserInfo(id).then(user => active && setInfo({ id, user }))
		return () => {
			active = false
		}
	}, [id])

	return id && info?.id === id ? info.user : undefined
}

function Avatar({ url, size }: { url?: string; size: number }) {
	if (!url) return null
	return (
		<Image
			source={{ uri: url }}
			style={{ width: size, height: size, borderRadius: size / 2 }}
		/>
	)
}

const nameOf = (id: string, user?: UserInfo | null) =>
	user ? `${user.name} (@${user.username})` : id

async function doBlock(api: Api, id: string, user: UserInfo | null) {
	const label = user?.name ?? id
	try {
		await blockUser(id)
		await addToHistory(api, {
			id,
			label,
			avatarUrl: user?.avatarUrl,
			blockedAt: Date.now(),
		})
		toast(`Blocked ${label}`, 'success')
	} catch (e) {
		api.logger.error(`Failed to block ${id}`, e)
		toast(`Couldn't block: ${errorMessage(e)}`, 'critical')
	}
}

async function doUnblock(api: Api, id: string, label: string) {
	try {
		await unblockUser(id)
		await removeFromHistory(api, id)
		toast(`Unblocked ${label}`, 'success')
	} catch (e) {
		api.logger.error(`Failed to unblock ${id}`, e)
		toast(`Couldn't unblock: ${errorMessage(e)}`, 'critical')
	}
}

function confirmBlock(api: Api, id: string, user: UserInfo | null) {
	const { AlertModal, AlertActionButton, Stack } = Design
	const label = nameOf(id, user)

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
						onPress={() => doBlock(api, id, user)}
					/>
					<AlertActionButton text="Cancel" variant="secondary" />
				</Stack>
			}
		/>,
	)
}

function UserPreview({ user }: { user: UserInfo | null | undefined }) {
	const { Card, Stack, Text } = Design
	return (
		<Card>
			<Stack direction="horizontal" spacing={12} align="center">
				{user ? <Avatar url={user.avatarUrl} size={48} /> : null}
				<Stack spacing={2} style={{ flex: 1 }}>
					<Text variant="text-md/semibold">
						{user === undefined
							? 'Looking up user…'
							: user
								? user.name
								: "Couldn't find this user"}
					</Text>
					{user ? (
						<Text variant="text-sm/medium" color="text-muted">
							@{user.username}
						</Text>
					) : null}
				</Stack>
			</Stack>
		</Card>
	)
}

function BlockedRow({ api, entry }: { api: Api; entry: BlockedEntry }) {
	const { TableRow, Button } = Design
	const user = useUserInfo(entry.id)
	const name = user?.name ?? (entry.label !== entry.id ? entry.label : entry.id)

	return (
		<TableRow
			label={name}
			subLabel={`${user ? `@${user.username} · ` : ''}${entry.id} · ${new Date(entry.blockedAt).toLocaleDateString()}`}
			icon={<Avatar url={user?.avatarUrl ?? entry.avatarUrl} size={40} />}
			trailing={
				<Button
					text="Unblock"
					size="sm"
					variant="secondary"
					onPress={() => doUnblock(api, entry.id, name)}
				/>
			}
		/>
	)
}

function SettingsPage({ api }: { api: Api }) {
	const { Stack, Text, TextInput, Button, TableRowGroup } = Design
	const settings = api.jsonStorage.use()
	const [input, setInput] = useState('')

	const id = parseUserId(input)
	const user = useUserInfo(id)
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
						id
							? undefined
							: 'Turn on Developer Mode in Discord, then long-press a user and copy their ID.'
					}
				/>
				{id && !error ? <UserPreview user={user} /> : null}
				<Button
					text="Block"
					variant="destructive"
					disabled={!id || !!error}
					onPress={() => {
						if (!id) return
						confirmBlock(api, id, user ?? null)
						setInput('')
					}}
				/>
			</Stack>

			{history.length ? (
				<TableRowGroup title="Blocked with this plugin">
					{history.map(entry => (
						<BlockedRow key={entry.id} api={api} entry={entry} />
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
