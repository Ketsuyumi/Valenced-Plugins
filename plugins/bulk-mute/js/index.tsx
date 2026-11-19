import { Design } from '@valenced/discord/design'
import { instead } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { installBar, toast } from './bar'
import { findModule } from './find'
import { headerStatus, patchHeader } from './header'
import { muteMethod, watchCreators } from './mute'
import { patchRows, rowStatus } from './rows'
import { begin, currentGuild, end, S } from './state'

interface Settings {
	/** The bell beside the server's search bar. */
	bell: boolean
	/** "Mute channels" in the popup from long-pressing a server icon. */
	popup: boolean
}
const DEFAULTS: Settings = { bell: true, popup: true }
let storage: any
const settings = (): Settings => ({ ...DEFAULTS, ...(storage?.cache ?? {}) })

/** Starts selecting in [guildId]; opening another server's popup says to open it first. */
function startIn(guildId: string) {
	begin(guildId)
	if (guildId !== currentGuild()) {
		const name = S().GuildStore?.getGuild?.(guildId)?.name ?? 'the server'
		toast(`Open ${name} and tap its channels`)
	}
}

function SettingsPage() {
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow } = Design as any
	const [s, setS] = useState(settings)
	const set = (patch: Partial<Settings>) => {
		const next = { ...s, ...patch }
		storage?.set?.(next, true)
		setS(next)
	}
	return (
		<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
			<Stack spacing={16}>
				<Text variant="text-md/normal">
					Tap the bell next to a server's search bar (or long-press the server
					and choose Mute channels). Then tap channels to select them, like
					selecting messages on WhatsApp, and tap Mute to mute them all forever.
					All selects every channel that isn't muted yet.
				</Text>
				<TableRowGroup title="Where to start">
					<TableSwitchRow
						label="Bell next to search"
						subLabel="In the server's header, beside the search bar"
						value={s.bell}
						onValueChange={(bell: boolean) => set({ bell })}
					/>
					<TableSwitchRow
						label="Server long-press popup"
						subLabel="Mute channels, with Mark as Read and Server Info"
						value={s.popup}
						onValueChange={(popup: boolean) => set({ popup })}
					/>
				</TableRowGroup>
				<TableRowGroup title="Status">
					<TableRow
						label="Channel rows"
						subLabel={
							rowStatus.hooked ? 'Hooked' : 'Not found yet (open a server)'
						}
					/>
					<TableRow label="Muting with" subLabel={muteMethod()} />
					<TableRow
						label="Bell"
						subLabel={
							headerStatus.placedIn
								? `Placed in ${headerStatus.placedIn}`
								: 'Not placed yet (open a server). If it never shows, send a screenshot of this page.'
						}
					/>
					<TableRow
						label="Header candidates"
						subLabel={
							headerStatus.candidates.length
								? headerStatus.candidates.join('\n')
								: 'None found'
						}
					/>
				</TableRowGroup>
			</Stack>
		</ScrollView>
	)
}

export default plugin({
	start({ cleanup, jsonStorage }) {
		storage = jsonStorage
		cleanup(
			watchCreators(),
			patchRows(),
			installBar(),
			patchHeader(() => settings().bell),
			findModule(
				'design/components/ContextMenu/native/ContextMenuState.native.tsx',
				['showContextMenu'],
				(mod: any) => {
					if (typeof mod?.showContextMenu !== 'function') return
					cleanup(
						instead(
							mod,
							'showContextMenu',
							function (
								this: unknown,
								args: any[],
								orig: (...a: any[]) => any,
							) {
								try {
									const menu = args[0]
									const id = menu?.key
									if (
										settings().popup &&
										Array.isArray(menu?.items) &&
										typeof id === 'string' &&
										/^\d{5,}$/.test(id) &&
										S().GuildStore?.getGuild?.(id) &&
										!menu.items.some((i: any) => i?.bulkMute)
									)
										menu.items.push({
											bulkMute: true,
											IconComponent:
												lookupGeneratedIconComponent('BellSlashIcon' as any) ??
												lookupGeneratedIconComponent('BellIcon' as any),
											label: 'Mute channels',
											action: () => setTimeout(() => startIn(id), 300),
										})
								} catch {}
								return orig.apply(this, args)
							},
						),
					)
				},
			),
			() => end(),
			() => (storage = undefined),
		)
	},
	SettingsComponent: SettingsPage,
})
