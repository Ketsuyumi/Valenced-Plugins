import {
	ActionSheetActionCreators,
	AlertActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { instead } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { findModule } from './find'
import {
	canSave,
	folderOf,
	folders,
	guildName,
	isGuild,
	moveToFolder,
	newFolder,
	removeFromFolder,
	setSaver,
} from './folders'

/**
 * "Move to folder" in a server's long-press menu. The menu draws
 * `GuildActionSheetActions.GuildActionSheetSecondaryActions({ guild })` from the module at render
 * time (as Review DB documents), so wrapping that export adds a group after it.
 */

/**
 * The small popup from long-pressing a server icon (Mark as Read, Notifications, More Options,
 * Server Info) is built in the server bar's gesture handler and handed to `showContextMenu`, with
 * the server ID as its key (folders have none). Rows are pushed onto that same array, as
 * Override Server Appearance does: Discord picks the tapped row from it.
 */
const CONTEXT_MENU =
	'design/components/ContextMenu/native/ContextMenuState.native.tsx'

interface Settings {
	/** In the popup from long-pressing a server icon. */
	popup: boolean
	/** In the More Options sheet. */
	sheet: boolean
}
const DEFAULTS: Settings = { popup: true, sheet: false }
let storage: any
const settings = (): Settings => ({ ...DEFAULTS, ...(storage?.cache ?? {}) })
function setSettings(patch: Partial<Settings>) {
	storage?.set?.({ ...settings(), ...patch }, true)
}

const SHEET =
	'modules/guild_action_sheet/native/components/GuildActionSheetActions.tsx'
const TARGET = 'GuildActionSheetSecondaryActions'
const COLORS = [
	0x5865f2, 0x23a55a, 0xf0b232, 0xeb459e, 0xf23f42, 0x00a8fc, 0xb07fe6,
	0xe8743b,
]

function toast(text: string) {
	try {
		ToastActionCreators.open('quick-folders', { text } as never)
	} catch {}
}

async function run(task: () => Promise<void>, done: string) {
	try {
		await task()
		toast(done)
	} catch (e: any) {
		toast(`Couldn't move it: ${e?.message ?? e}`)
	}
}

function Picker({ guildId, close }: { guildId: string; close: () => void }) {
	const { Stack, Text, TextInput, TableRowGroup, TableRow, Button } =
		Design as any
	const [naming, setNaming] = useState(false)
	const [name, setName] = useState('')
	const [color, setColor] = useState(COLORS[0])
	const list = folders()
	const current = folderOf(guildId)
	const server = guildName(guildId)

	if (naming)
		return (
			<Stack spacing={12}>
				<TextInput
					label="Folder name"
					placeholder="Friends, Games…"
					value={name}
					onChange={setName}
					isClearable
					autoFocus
				/>
				<ScrollView horizontal showsHorizontalScrollIndicator={false}>
					{COLORS.map(c => (
						<Pressable
							key={c}
							onPress={() => setColor(c)}
							accessibilityLabel={`Colour ${c.toString(16)}`}
							style={{
								width: 30,
								height: 30,
								borderRadius: 15,
								marginRight: 8,
								backgroundColor: `#${c.toString(16).padStart(6, '0')}`,
								borderWidth: color === c ? 3 : 0,
								borderColor: '#ffffff',
							}}
						/>
					))}
				</ScrollView>
				<Button
					text="Create folder"
					onPress={() => {
						close()
						void run(
							() => newFolder(guildId, name, color),
							`${server} → ${name.trim() || 'new folder'}`,
						)
					}}
				/>
				<Button
					text="Back"
					variant="secondary"
					onPress={() => setNaming(false)}
				/>
			</Stack>
		)

	return (
		<View style={{ maxHeight: 460 }}>
			<ScrollView keyboardShouldPersistTaps="handled">
				<Stack spacing={12}>
					<TableRowGroup>
						<TableRow
							label="New folder…"
							arrow
							onPress={() => setNaming(true)}
						/>
						{current ? (
							<TableRow
								label="Remove from folder"
								subLabel={`Out of ${current.name}`}
								onPress={() => {
									close()
									void run(
										() => removeFromFolder(guildId),
										`${server} is out of ${current.name}`,
									)
								}}
							/>
						) : null}
					</TableRowGroup>
					{list.length ? (
						<TableRowGroup title="Your folders">
							{list.map(f => {
								const here = current?.id === f.id
								return (
									<TableRow
										key={String(f.id)}
										label={f.name}
										subLabel={`${f.guildIds.length} server${f.guildIds.length === 1 ? '' : 's'}${here ? ' · already here' : ''}`}
										icon={
											<View
												style={{
													width: 14,
													height: 14,
													borderRadius: 4,
													backgroundColor: f.color ?? '#5865f2',
												}}
											/>
										}
										disabled={here}
										onPress={() => {
											close()
											void run(
												() => moveToFolder(guildId, f.id),
												`${server} → ${f.name}`,
											)
										}}
									/>
								)
							})}
						</TableRowGroup>
					) : (
						<Text variant="text-sm/medium" color="text-muted">
							You don't have any folders yet. Make one with New folder.
						</Text>
					)}
				</Stack>
			</ScrollView>
		</View>
	)
}

export function openPicker(guildId: string) {
	if (!canSave())
		return toast("Couldn't find Discord's folder saving on this version")
	const { AlertModal, AlertActionButton } = Design as any
	const key = `quick-folders-${guildId}`
	const close = () => (AlertActionCreators as any).dismissAlert(key)
	;(AlertActionCreators as any).openAlert(
		key,
		<AlertModal
			title={`Move ${guildName(guildId)} to…`}
			extraContent={<Picker guildId={guildId} close={close} />}
			actions={
				<AlertActionButton text="Cancel" variant="secondary" onPress={close} />
			}
		/>,
	)
}

function MoveGroup({ guildId }: { guildId: string }) {
	const { ActionSheetRow } = Design as any
	if (!ActionSheetRow?.Group) return null
	const Icon: any =
		lookupGeneratedIconComponent('FolderIcon' as any) ??
		lookupGeneratedIconComponent('FolderPlusIcon' as any)
	const current = folderOf(guildId)
	return (
		<ActionSheetRow.Group hasIcons={!!Icon}>
			<ActionSheetRow
				label="Move to folder"
				subLabel={current ? `In ${current.name}` : undefined}
				icon={Icon ? <ActionSheetRow.Icon IconComponent={Icon} /> : undefined}
				onPress={() => {
					try {
						;(ActionSheetActionCreators as any).hideActionSheet?.()
					} catch {}
					// Opened once the sheet is away, so the two don't fight over the screen.
					setTimeout(() => openPicker(guildId), 250)
				}}
			/>
		</ActionSheetRow.Group>
	)
}

function SettingsPage() {
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow } = Design as any
	const [s, setS] = useState(settings)
	const set = (patch: Partial<Settings>) => {
		setSettings(patch)
		setS({ ...s, ...patch })
	}
	return (
		<ScrollView contentContainerStyle={{ padding: 16 }}>
			<Stack spacing={16}>
				<Text variant="text-md/normal">
					Long-press a server and choose Move to folder. Pick a folder, make a
					new one (with a name and colour), or take the server out of its
					folder. It saves the same way dragging does, so it syncs to your other
					devices.
				</Text>
				<TableRowGroup title="Where it shows">
					<TableSwitchRow
						label="Long-press popup"
						subLabel="The small menu with Mark as Read and Server Info"
						value={s.popup}
						onValueChange={(popup: boolean) => set({ popup })}
					/>
					<TableSwitchRow
						label="More Options"
						subLabel="The full server sheet"
						value={s.sheet}
						onValueChange={(sheet: boolean) => set({ sheet })}
					/>
				</TableRowGroup>
				<TableRowGroup title="Status">
					<TableRow
						label="Folder saving"
						subLabel={
							canSave() ? 'Ready' : 'Not found yet (open the server list once)'
						}
					/>
					<TableRow label="Folders" subLabel={`${folders().length}`} />
				</TableRowGroup>
			</Stack>
		</ScrollView>
	)
}

export default plugin({
	start({ cleanup, jsonStorage }) {
		storage = jsonStorage
		cleanup(
			findModule(CONTEXT_MENU, ['showContextMenu'], (mod: any) => {
				if (typeof mod?.showContextMenu !== 'function') return
				cleanup(
					instead(
						mod,
						'showContextMenu',
						function (this: unknown, args: any[], orig: (...a: any[]) => any) {
							try {
								const menu = args[0]
								const id = menu?.key
								if (
									settings().popup &&
									Array.isArray(menu?.items) &&
									typeof id === 'string' &&
									/^\d{5,}$/.test(id) &&
									isGuild(id) &&
									!menu.items.some((i: any) => i?.quickFolders)
								)
									menu.items.push({
										quickFolders: true,
										IconComponent:
											lookupGeneratedIconComponent('FolderIcon' as any) ??
											lookupGeneratedIconComponent('FolderPlusIcon' as any),
										label: 'Move to folder',
										action() {
											// Opened once the menu has closed, so the two don't fight over the screen.
											setTimeout(() => openPicker(id), 300)
										},
									})
							} catch {}
							return orig.apply(this, args)
						},
					),
				)
			}),
			findModule(
				'actions/UserSettingsActionCreators.tsx',
				['saveGuildFolders'],
				(mod: any) => {
					const host =
						typeof mod?.saveGuildFolders === 'function' ? mod : mod?.default
					if (typeof host?.saveGuildFolders === 'function')
						setSaver(list => host.saveGuildFolders(list))
				},
			),
			findModule(SHEET, [TARGET], (mod: any) => {
				if (typeof mod?.[TARGET] !== 'function') return
				cleanup(
					instead(
						mod,
						TARGET,
						function (this: unknown, args: any[], orig: (...a: any[]) => any) {
							const out = orig.apply(this, args)
							const guildId = args[0]?.guild?.id
							if (typeof guildId !== 'string' || !settings().sheet) return out
							return (
								<>
									{out}
									<MoveGroup guildId={guildId} />
								</>
							)
						},
					),
				)
			}),
			() => setSaver(undefined),
			() => (storage = undefined),
		)
	},
	SettingsComponent: SettingsPage,
})
