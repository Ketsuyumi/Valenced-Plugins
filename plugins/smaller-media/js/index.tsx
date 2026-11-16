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
}

type Api = PluginApi<{ jsonStorage: Settings }>

const DEFAULTS: Settings = { percent: 35, uploads: true, embeds: true }
const PERCENTS = [30, 35, 40, 50]

let stats = newStats()
let hooked = 'Waiting for Discord to load its message builder'

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

function debugReport(settings: Settings) {
	const { width, height } = Dimensions.get('window')
	return [
		'Smaller Media debug',
		`settings: ${JSON.stringify(settings)}`,
		`screen: ${Math.round(width)}x${Math.round(height)}`,
		`hook: ${hooked}`,
		`messages seen: ${stats.messages}, media resized: ${stats.resized}`,
		...stats.samples,
		`content keys: ${stats.contentKeys}`,
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

				<TableRowGroup title="Status">
					<TableRow label="Message builder" subLabel={hooked} />
					<TableRow
						label="This session"
						subLabel={`${stats.resized} media resized in ${stats.messages} messages`}
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
		hooked = 'Waiting for Discord to load its message builder'
		// Rebuilt when the settings change, not for every message.
		let options = optionsFrom({ ...DEFAULTS, ...jsonStorage.cache })
		const refresh = () => {
			options = optionsFrom({ ...DEFAULTS, ...jsonStorage.cache })
		}
		cleanup(jsonStorage.subscribe(refresh))
		jsonStorage.get().then(refresh, () => {})
		const rotation = Dimensions.addEventListener?.('change', refresh)
		cleanup(() => rotation?.remove?.())

		cleanup(
			// The function that builds the data each chat row is drawn from.
			getModules(withName<any>('createMessageContent'), exports => {
				try {
					if (typeof exports?.default !== 'function') return
					cleanup(
						after(exports, 'default', ((content: unknown) => {
							try {
								return resizeContent(content, options, stats)
							} catch {
								return content
							}
						}) as never),
					)
					hooked = 'Found'
				} catch (error) {
					hooked = 'Found, but could not be patched'
					plugin.reportError(error)
				}
			}),
		)
	},
	SettingsComponent: SettingsPage,
})
