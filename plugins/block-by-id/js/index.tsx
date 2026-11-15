import {
	AlertActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { onFluxEventDispatched } from '@valenced/discord/flux'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView } from 'react-native'
import {
	blockUser,
	currentUserId,
	errorMessage,
	fetchUserInfo,
	ignoreUser,
	isBlocked,
	isCurrentUser,
	isIgnored,
	parseUserId,
	subscribeRelationships,
	unblockUser,
	unignoreUser,
} from './relationships'
import { describeResult, syncAccount } from './sync'
import type { PluginApi } from '@valenced/plugins/types'
import type { UserInfo } from './relationships'
import type { SyncedMap } from './sync'

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
	/** Block everyone on the list on every account you switch to. */
	syncAcrossAccounts?: boolean
	/** Per account: list entries already checked there. */
	synced?: SyncedMap
}

type Api = PluginApi<{ jsonStorage: Settings }>

const ALERT_KEY = 'block-by-id-confirm'

function toast(text: string, variant: 'default' | 'success' | 'critical') {
	ToastActionCreators.open('block-by-id', { text, variant })
}

/** Writes some settings, keeping the rest. */
async function save(api: Api, patch: (current: Settings) => Partial<Settings>) {
	const stored = await api.jsonStorage.get()
	const current = { ...stored, history: stored?.history ?? [] }
	await api.jsonStorage.set({ ...current, ...patch(current) }, true)
}

async function addToHistory(api: Api, entry: BlockedEntry) {
	await save(api, ({ history }) => ({
		history: [entry, ...history.filter(e => e.id !== entry.id)],
	}))
}

async function removeFromHistory(api: Api, id: string) {
	// Also forget it per account, so re-adding it applies everywhere again.
	await save(api, ({ history, synced = {} }) => ({
		history: history.filter(e => e.id !== id),
		synced: Object.fromEntries(
			Object.entries(synced).map(([account, ids]) => [
				account,
				ids.filter(i => i !== id),
			]),
		),
	}))
}

// ---- Applying the list on other accounts -----------------------------------

let stopped = true
let running = false
let rerun = false
const timers = new Set<ReturnType<typeof setTimeout>>()

async function runSync(api: Api, manual: boolean) {
	if (stopped) return
	if (!manual && (await api.jsonStorage.get()).syncAcrossAccounts !== true)
		return
	if (running) {
		rerun = true
		return
	}
	running = true
	try {
		const result = await syncAccount({
			listIds: async () =>
				((await api.jsonStorage.get()).history ?? []).map(e => e.id),
			getSynced: async () => (await api.jsonStorage.get()).synced ?? {},
			saveSynced: synced => save(api, () => ({ synced })),
			isStopped: () => stopped,
		})
		if (result) {
			api.logger.log(
				`Account sync for ${result.accountId}: blocked ${result.blocked.length}, already ${result.alreadyBlocked}, friends skipped ${result.skippedFriends.length}, failed ${result.failed.length}`,
			)
			for (const f of result.failed)
				api.logger.warn(`Couldn't block ${f.id}: ${f.error}`)
			const text = describeResult(result, manual)
			if (text && !result.interrupted)
				toast(text, result.failed.length ? 'critical' : 'success')
		}
	} catch (e) {
		api.logger.error('Account sync failed', e)
		if (manual) toast(`Couldn't check: ${errorMessage(e)}`, 'critical')
	} finally {
		running = false
		if (rerun) {
			rerun = false
			schedule(api, 0)
		}
	}
}

/** Runs the sync after Discord has had time to load the account's relationships. */
function schedule(api: Api, delayMs: number) {
	const timer = setTimeout(() => {
		timers.delete(timer)
		runSync(api, false)
	}, delayMs)
	timers.add(timer)
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
		await markChecked(api, id)
		toast(`Blocked ${label}`, 'success')
	} catch (e) {
		api.logger.error(`Failed to block ${id}`, e)
		toast(`Couldn't block: ${errorMessage(e)}`, 'critical')
	}
}

/** Records that this account has dealt with `id`, so automatic mode leaves it alone. */
async function markChecked(api: Api, id: string) {
	const account = currentUserId()
	if (!account) return
	await save(api, ({ synced = {} }) => ({
		synced: {
			...synced,
			[account]: [...new Set([...(synced[account] ?? []), id])],
		},
	}))
}

/** Blocks someone already on the list, on the current account. */
async function doBlockHere(api: Api, id: string, label: string) {
	try {
		await blockUser(id)
		await markChecked(api, id)
		toast(`Blocked ${label} on this account`, 'success')
	} catch (e) {
		api.logger.error(`Failed to block ${id}`, e)
		toast(`Couldn't block: ${errorMessage(e)}`, 'critical')
	}
}

/** Unblocks on the current account only; they stay on the list for other accounts. */
async function doUnblock(api: Api, id: string, label: string) {
	try {
		await unblockUser(id)
		await markChecked(api, id)
		toast(`Unblocked ${label} on this account`, 'success')
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

/** Block / ignore status of `id` on the current account, kept up to date. */
function useRelationship(id: string) {
	const read = () => ({ blocked: isBlocked(id), ignored: isIgnored(id) })
	const [state, setState] = useState(read)
	useEffect(() => {
		const update = () => setState(read())
		update()
		return subscribeRelationships(update)
	}, [id])
	return state
}

async function doToggleIgnore(
	api: Api,
	id: string,
	label: string,
	ignored: boolean,
) {
	try {
		if (ignored) await unignoreUser(id)
		else await ignoreUser(id)
		toast(
			`${ignored ? 'Stopped ignoring' : 'Ignoring'} ${label} on this account`,
			'success',
		)
	} catch (e) {
		api.logger.error(`Failed to ${ignored ? 'unignore' : 'ignore'} ${id}`, e)
		toast(
			`Couldn't ${ignored ? 'unignore' : 'ignore'}: ${errorMessage(e)}`,
			'critical',
		)
	}
}

/** Small round ✕ that takes someone off the list. */
function RemoveButton({
	onPress,
	disabled,
}: {
	onPress(): void
	disabled: boolean
}) {
	const { Text } = Design
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel="Remove from list"
			hitSlop={8}
			disabled={disabled}
			onPress={onPress}
			style={{
				width: 28,
				height: 28,
				borderRadius: 14,
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: 'rgba(255, 255, 255, 0.08)',
				opacity: disabled ? 0.5 : 1,
			}}
		>
			<Text variant="text-sm/bold" color="text-muted">
				✕
			</Text>
		</Pressable>
	)
}

function BlockedRow({ api, entry }: { api: Api; entry: BlockedEntry }) {
	const { TableRow, Button, Stack } = Design
	const user = useUserInfo(entry.id)
	const { blocked, ignored } = useRelationship(entry.id)
	const [busy, setBusy] = useState<'block' | 'ignore' | 'remove' | null>(null)
	const name = user?.name ?? (entry.label !== entry.id ? entry.label : entry.id)
	const run = async (
		kind: 'block' | 'ignore' | 'remove',
		action: () => Promise<void>,
	) => {
		setBusy(kind)
		await action()
		setBusy(null)
	}

	return (
		<TableRow
			label={name}
			subLabel={`${user ? `@${user.username} · ` : ''}${entry.id} · ${new Date(entry.blockedAt).toLocaleDateString()}`}
			icon={<Avatar url={user?.avatarUrl ?? entry.avatarUrl} size={40} />}
			trailing={
				blocked ? (
					<Button
						text="Unblock"
						size="sm"
						variant="secondary"
						loading={busy === 'block'}
						onPress={() => run('block', () => doUnblock(api, entry.id, name))}
					/>
				) : (
					<Stack
						direction="horizontal"
						spacing={6}
						align="center"
						style={{ width: 'auto' }}
					>
						<RemoveButton
							disabled={!!busy}
							onPress={() =>
								run('remove', async () => {
									await removeFromHistory(api, entry.id)
									toast(`Removed ${name} from your list`, 'default')
								})
							}
						/>
						<Button
							text={ignored ? 'Unignore' : 'Ignore'}
							size="sm"
							variant="secondary"
							disabled={!!busy && busy !== 'ignore'}
							loading={busy === 'ignore'}
							onPress={() =>
								run('ignore', () =>
									doToggleIgnore(api, entry.id, name, ignored),
								)
							}
						/>
						<Button
							text="Block"
							size="sm"
							variant="destructive"
							disabled={!!busy && busy !== 'block'}
							loading={busy === 'block'}
							onPress={() =>
								run('block', () => doBlockHere(api, entry.id, name))
							}
						/>
					</Stack>
				)
			}
		/>
	)
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
	const [checking, setChecking] = useState(false)

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ padding: 16 }}
			keyboardShouldPersistTaps="handled"
		>
			<Stack spacing={24}>
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

				<TableRowGroup title="Other accounts">
					<TableSwitchRow
						label="Block automatically on every account"
						subLabel="When you switch accounts, block anyone on this list that account hasn't blocked yet. Each person is checked once per account, and friends are skipped. Off: use the Block buttons below."
						value={settings?.syncAcrossAccounts === true}
						onValueChange={(on: boolean) =>
							save(api, () => ({ syncAcrossAccounts: on }))
						}
					/>
					<TableRow
						label="Block everyone missing on this account"
						subLabel={
							currentUserId()
								? undefined
								: 'Not logged in to an account right now'
						}
						disabled={checking || !currentUserId()}
						onPress={async () => {
							setChecking(true)
							await runSync(api, true)
							setChecking(false)
						}}
						trailing={checking ? <ActivityIndicator /> : <TableRow.Arrow />}
					/>
				</TableRowGroup>

				{history.length ? (
					<TableRowGroup
						title="Your block list"
						description="Buttons show this account: Unblock if they're blocked here, Block if not. Unblocking keeps them on the list for your other accounts."
					>
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
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: { history: [] },
	},
	start(api) {
		stopped = false
		api.logger.log('Block by ID started')
		api.cleanup(
			// Fires when an account connects: app start, reconnects, account switches.
			onFluxEventDispatched('CONNECTION_OPEN', payload => {
				schedule(api, 4000)
				return payload
			}),
			() => {
				stopped = true
				for (const t of timers) clearTimeout(t)
				timers.clear()
			},
		)
		// Started while already logged in (e.g. just enabled).
		if (currentUserId()) schedule(api, 4000)
	},
	stop() {
		AlertActionCreators.dismissAlert(ALERT_KEY)
	},
	SettingsComponent: SettingsPage,
})
