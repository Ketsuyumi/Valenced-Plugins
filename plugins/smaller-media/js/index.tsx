import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { useEffect, useState } from 'react'
import { Dimensions, ScrollView } from 'react-native'
import { placeIds, shouldShrink } from './places'
import { newStats, resizeContent } from './resize'
import type { PluginApi } from '@valenced/plugins/types'
import type { ListMode, Place } from './places'
import type { ResizeOptions } from './resize'

interface Settings {
	/** How much smaller, in percent. */
	percent: number
	/** Images, videos and GIFs people upload. */
	uploads: boolean
	/** Link previews and GIFs from Tenor, Giphy and similar. */
	embeds: boolean
	/** Servers, channels and DMs the list below is about. */
	places: Place[]
	/** Whether media is left alone in those places, or only shrunk there. */
	listMode: ListMode
}

type Api = PluginApi<{ jsonStorage: Settings }>

const DEFAULTS: Settings = {
	percent: 35,
	uploads: true,
	embeds: true,
	places: [],
	listMode: 'exclude',
}
const PERCENTS = [30, 35, 40, 50]

let stats = newStats()
let hooked = 'Waiting for Discord to load its chat row generator'
let hookCount = 0

function optionsFrom(settings: Settings): ResizeOptions {
	const { width, height } = Dimensions.get('window')
	const percent = Math.min(Math.max(Number(settings.percent) || 0, 0), 80)
	return {
		scale: 1 - percent / 100,
		uploads: settings.uploads,
		embeds: settings.embeds,
		screenWidth: width || 400,
		screenHeight: height || 800,
	}
}

const ID = /^\d{17,20}$/
const store = (name: string) => (Stores as any)[name] as any

/** What an id is, from what Discord has loaded: a server, or a channel / DM. */
function identify(id: string): Place | undefined {
	try {
		const guild = store('GuildStore')?.getGuild?.(id)
		if (guild) return { id, kind: 'server', label: guild.name ?? id }
		const channel = store('ChannelStore')?.getChannel?.(id)
		if (!channel) return undefined
		if (channel.guild_id) {
			const guildName = store('GuildStore')?.getGuild?.(channel.guild_id)?.name
			const name = `#${channel.name ?? id}`
			return {
				id,
				kind: 'channel',
				label: guildName ? `${name} in ${guildName}` : name,
			}
		}
		if (channel.name) return { id, kind: 'channel', label: channel.name }
		const recipients: string[] = channel.recipients ?? []
		if (recipients.length === 1) {
			const user = store('UserStore')?.getUser?.(recipients[0])
			const name = user?.globalName ?? user?.global_name ?? user?.username
			return { id, kind: 'channel', label: name ? `DM with ${name}` : 'DM' }
		}
		return { id, kind: 'channel', label: 'Group DM' }
	} catch {
		return undefined
	}
}

/** The server and the channel or DM last opened, for the quick-add rows. */
function currentPlaces(): Place[] {
	const out: Place[] = []
	try {
		const guildId = store('SelectedGuildStore')?.getGuildId?.()
		const server = typeof guildId === 'string' ? identify(guildId) : undefined
		if (server) out.push(server)
		const channelId = store('SelectedChannelStore')?.getChannelId?.()
		const channel =
			typeof channelId === 'string' ? identify(channelId) : undefined
		if (channel) out.push(channel)
	} catch {}
	return out
}

function debugReport(settings: Settings) {
	const { width, height } = Dimensions.get('window')
	return [
		'Smaller Media debug',
		`settings: ${JSON.stringify({ ...settings, places: settings.places?.length ?? 0 })}`,
		`screen: ${Math.round(width)}x${Math.round(height)}`,
		`hook: ${hooked}`,
		`rows: ${stats.rows}, messages: ${stats.messages}, media resized: ${stats.resized}`,
		`row keys: ${stats.rowKeys}`,
		...stats.samples,
		...stats.flags,
		`message keys: ${stats.contentKeys}`,
		...stats.shapes,
	].join('\n')
}

function SettingsPage({ api }: { api: Api }) {
	const {
		Stack,
		Text,
		TableRowGroup,
		TableSwitchRow,
		TableRow,
		TableRadioGroup,
		TableRadioRow,
		TextInput,
		Button,
	} = Design
	const settings = { ...DEFAULTS, ...api.jsonStorage.use() }
	const set = (patch: Partial<Settings>) =>
		api.jsonStorage.set({ ...settings, ...patch }, true)
	const [input, setInput] = useState('')
	const id = input.trim()
	const validId = ID.test(id)
	const found = validId ? identify(id) : undefined
	const listed = placeIds(settings.places)
	const add = (place: Place) =>
		set({ places: [...settings.places.filter(p => p.id !== place.id), place] })
	// The counters change while the page is open; refresh them now and then.
	const [, tick] = useState(0)
	useEffect(() => {
		const timer = setInterval(() => tick(n => n + 1), 2000)
		return () => clearInterval(timer)
	}, [])

	return (
		<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
			<Stack spacing={24}>
				<TableRadioGroup
					title="How much smaller"
					defaultValue={String(settings.percent)}
					value={String(settings.percent)}
					onChange={(value: string) => set({ percent: Number(value) })}
				>
					{PERCENTS.map(percent => (
						<TableRadioRow
							key={percent}
							label={`${percent}% smaller`}
							value={String(percent)}
						/>
					))}
				</TableRadioGroup>

				<TableRowGroup title="What to shrink">
					<TableSwitchRow
						label="Uploads"
						subLabel="Images, videos and GIFs people send as files"
						value={settings.uploads}
						onValueChange={(uploads: boolean) => set({ uploads })}
					/>
					<TableSwitchRow
						label="Links and GIF picker"
						subLabel="Link previews, and GIFs from Tenor, Giphy and similar"
						value={settings.embeds}
						onValueChange={(embeds: boolean) => set({ embeds })}
					/>
				</TableRowGroup>

				<TableRadioGroup
					title="Servers, channels and DMs"
					defaultValue={settings.listMode}
					value={settings.listMode}
					onChange={(listMode: ListMode) => set({ listMode })}
				>
					<TableRadioRow
						label="Don't shrink in the places below"
						subLabel="Media stays full size there"
						value="exclude"
					/>
					<TableRadioRow
						label="Only shrink in the places below"
						subLabel="Media stays full size everywhere else"
						value="only"
					/>
				</TableRadioGroup>

				<TableRowGroup title="Add a place">
					{currentPlaces()
						.filter(place => !listed.has(place.id))
						.map(place => (
							<TableRow
								key={place.id}
								label={`Add ${place.label}`}
								subLabel={
									place.kind === 'server'
										? 'The server you last had open'
										: 'The channel or DM you last had open'
								}
								arrow
								onPress={() => add(place)}
							/>
						))}
					<TableRow
						label="By ID"
						subLabel="Turn on Developer Mode, long-press a server, channel or DM, and copy its ID"
					/>
				</TableRowGroup>
				<Stack spacing={12}>
					<TextInput
						placeholder="Server, channel or DM ID"
						value={input}
						onChange={(value: string) => setInput(value)}
						isClearable
						status={id && !validId ? 'error' : 'default'}
						errorMessage={
							id && !validId ? 'An ID is a 17 to 20 digit number' : undefined
						}
						description={
							validId
								? listed.has(id)
									? 'Already on the list.'
									: (found?.label ??
										"Discord hasn't loaded this ID; it is added as it is.")
								: undefined
						}
					/>
					<Button
						text="Add"
						disabled={!validId || listed.has(id)}
						onPress={() => {
							add(found ?? { id, kind: 'channel', label: id })
							setInput('')
						}}
					/>
				</Stack>

				{settings.places.length ? (
					<TableRowGroup
						title={
							settings.listMode === 'only'
								? 'Only shrink in'
								: "Don't shrink in"
						}
					>
						{settings.places.map(place => (
							<TableRow
								key={place.id}
								label={place.label}
								subLabel={`${place.kind === 'server' ? 'Server' : 'Channel or DM'} · ${place.id}`}
								trailing={
									<Button
										text="✕"
										size="sm"
										variant="secondary"
										onPress={() =>
											set({
												places: settings.places.filter(p => p.id !== place.id),
											})
										}
									/>
								}
							/>
						))}
					</TableRowGroup>
				) : null}

				<TableRowGroup title="Status">
					<TableRow label="Chat row generator" subLabel={hooked} />
					<TableRow
						label="This session"
						subLabel={`${stats.resized} media resized in ${stats.rows} chat rows`}
					/>
					<TableRow
						label="Copy debug info"
						subLabel="If something isn't smaller, send this"
						arrow
						onPress={() => Clipboard.setString(debugReport(settings))}
					/>
				</TableRowGroup>

				<Text variant="text-sm/medium" color="text-muted">
					Only the preview in chat changes; tapping opens the full-size image or
					plays the video as before. Messages already on screen keep their size
					until they are drawn again, so reopen the channel after changing a
					setting.
				</Text>
			</Stack>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage, plugin }) {
		stats = newStats()
		hooked = 'Waiting for Discord to load its chat row generator'
		hookCount = 0
		// Rebuilt when the settings change, not for every message.
		let options = optionsFrom({ ...DEFAULTS, ...jsonStorage.cache })
		let ids = placeIds(DEFAULTS.places)
		let listMode: ListMode = DEFAULTS.listMode
		const refresh = () => {
			const settings = { ...DEFAULTS, ...jsonStorage.cache }
			options = optionsFrom(settings)
			ids = placeIds(Array.isArray(settings.places) ? settings.places : [])
			listMode = settings.listMode === 'only' ? 'only' : 'exclude'
		}
		refresh()
		cleanup(jsonStorage.subscribe(refresh))
		jsonStorage.get().then(refresh, () => {})
		const rotation = Dimensions.addEventListener?.('change', refresh)
		cleanup(() => rotation?.remove?.())

		// The chat's row generator. Each call returns the descriptor one row is drawn from, with
		// the message's media under `message.attachments` and `message.embeds`. Found by class
		// name with its `generate` method checked; there can be more than one RowManager.
		// (1.0.0 hooked `createMessageContent` by function name, which this Discord build does
		// not expose under that name, so nothing was ever resized.)
		const patchedPrototypes = new WeakSet<object>()
		cleanup(
			getModules(
				withName<any>('RowManager'),
				RowManager => {
					try {
						const prototype = RowManager?.prototype
						if (typeof prototype?.generate !== 'function') return
						if (patchedPrototypes.has(prototype)) return
						patchedPrototypes.add(prototype)
						cleanup(
							after(prototype, 'generate', ((row: any) => {
								try {
									const message = row?.message
									if (!message || typeof message !== 'object') return row
									stats.rows++
									if (!stats.rowKeys)
										stats.rowKeys = Object.keys(row).join(', ')
									// The list of places: skip this row's channel or server if it says so.
									if (
										!shouldShrink(
											ids,
											listMode,
											message.channelId,
											message.guildId,
										)
									)
										return row
									const next = resizeContent(message, options, stats)
									if (next === message) return row
									row.message = next
									// A read-only row: hand back a copy instead.
									return row.message === next ? row : { ...row, message: next }
								} catch {
									return row
								}
							}) as never),
						)
						hookCount++
						hooked = `Found (${hookCount})`
					} catch (error) {
						hooked = 'Found, but could not be patched'
						plugin.reportError(error)
					}
				},
				{ max: 10 },
			),
		)
	},
	SettingsComponent: SettingsPage,
})
