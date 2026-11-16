import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { useEffect, useState } from 'react'
import { Dimensions, ScrollView } from 'react-native'
import { newStats, resizeContent } from './resize'
import type { PluginApi } from '@valenced/plugins/types'
import type { ResizeOptions } from './resize'

interface Settings {
	/** How much smaller, in percent. */
	percent: number
	/** Images, videos and GIFs people upload. */
	uploads: boolean
	/** Link previews and GIFs from Tenor, Giphy and similar. */
	embeds: boolean
	/** Several uploads in one message: keep Discord's grid and shrink it (experimental). */
	keepGrid: boolean
}

type Api = PluginApi<{ jsonStorage: Settings }>

const DEFAULTS: Settings = {
	percent: 35,
	uploads: true,
	embeds: true,
	keepGrid: false,
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
		keepGrid: settings.keepGrid,
		screenWidth: width || 400,
		screenHeight: height || 800,
	}
}

function debugReport(settings: Settings) {
	const { width, height } = Dimensions.get('window')
	return [
		'Smaller Media debug',
		`settings: ${JSON.stringify(settings)}`,
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
	} = Design
	const settings = { ...DEFAULTS, ...api.jsonStorage.use() }
	const set = (patch: Partial<Settings>) =>
		api.jsonStorage.set({ ...settings, ...patch }, true)
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

				<TableRowGroup title="Several uploads in one message">
					<TableSwitchRow
						label="Keep the image grid"
						subLabel="Experimental. Off: each image is shown on its own, smaller, one under another. On: Discord's grid stays and the whole grid is made smaller."
						value={settings.keepGrid}
						disabled={!settings.uploads}
						onValueChange={(keepGrid: boolean) => set({ keepGrid })}
					/>
				</TableRowGroup>

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
		const refresh = () => {
			options = optionsFrom({ ...DEFAULTS, ...jsonStorage.cache })
		}
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
