import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { Linking, ScrollView } from 'react-native'
import { findModule } from './find'
import { installPlayer, play, playerAvailable } from './player'
import { findWebView } from './webview'
import { external, youtubeInSource, youtubeOf } from './youtube'
import type { PlayerSettings } from './player'

interface Settings extends PlayerSettings {
	/** YouTube embeds open here instead of Discord's full-screen viewer. */
	embeds: boolean
	/** YouTube links in messages open here instead of the YouTube app. */
	links: boolean
}
const DEFAULTS: Settings = { embeds: true, links: true, pipSize: 'medium', startSmall: false }
let settings: () => Settings = () => DEFAULTS

let lastOpened = 0
/** Plays [video] if the player can; false lets Discord do what it would have done. */
function tryPlay(video: { videoId: string; start?: number } | undefined): boolean {
	if (!video || !playerAvailable() || !findWebView()) return false
	// One tap can reach more than one hook; open once.
	const now = Date.now()
	if (now - lastOpened < 800) return true
	lastOpened = now
	play(video)
	return true
}

function SettingsPage({ api }: { api: any }) {
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow, TableRadioGroup, TableRadioRow } = Design as any
	const s: Settings = { ...DEFAULTS, ...api.jsonStorage.use() }
	const set = (patch: Partial<Settings>) => api.jsonStorage.set({ ...s, ...patch }, true)
	return (
		<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
			<Stack spacing={24}>
				<TableRowGroup title="Play here instead">
					<TableSwitchRow
						label="YouTube embeds"
						subLabel="Tapping a video embed plays it over the chat instead of Discord's full-screen viewer."
						value={s.embeds}
						onValueChange={(embeds: boolean) => set({ embeds })}
					/>
					<TableSwitchRow
						label="YouTube links"
						subLabel="Tapping a YouTube link in a message plays it here instead of opening the YouTube app."
						value={s.links}
						onValueChange={(links: boolean) => set({ links })}
					/>
				</TableRowGroup>
				<TableRowGroup title="Floating window">
					<TableSwitchRow
						label="Start as a floating window"
						subLabel="Open straight into picture-in-picture."
						value={s.startSmall}
						onValueChange={(startSmall: boolean) => set({ startSmall })}
					/>
				</TableRowGroup>
				<TableRadioGroup title="Floating window size" defaultValue={s.pipSize} value={s.pipSize} onChange={(pipSize: Settings['pipSize']) => set({ pipSize })}>
					<TableRadioRow label="Small" value="small" />
					<TableRadioRow label="Medium" value="medium" />
					<TableRadioRow label="Large" value="large" />
				</TableRadioGroup>
				<TableRowGroup title="Status">
					<TableRow label="Player" subLabel={playerAvailable() ? 'Ready' : 'Not attached yet (open any chat once)'} />
					<TableRow label="Web view" subLabel={findWebView() ? 'Found' : "Not found: videos open Discord's usual way"} />
				</TableRowGroup>
				<Text variant="text-sm/medium" color="text-muted">
					▁ shrinks the player into a floating window you can drag anywhere; it keeps playing while you
					scroll and switch channels. ⤢ makes it big again, ↗ opens the video in YouTube, ✕ closes it.
					Back shrinks the big player.
				</Text>
			</Stack>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }) {
		settings = () => ({ ...DEFAULTS, ...jsonStorage.cache })
		cleanup(installPlayer(() => settings()))

		// Embeds: Discord opens YouTube embeds in its media viewer (openMediaModal).
		cleanup(
			findModule('modules/media_viewer/native/components/openMediaModal.tsx', ['openMediaModal'], (mod: any) => {
				const host = typeof mod?.openMediaModal === 'function' ? mod : typeof mod?.default?.openMediaModal === 'function' ? mod.default : null
				if (!host) return
				cleanup(
					instead(host, 'openMediaModal', function (this: unknown, args: any[], orig: (...a: any[]) => any) {
						try {
							if (settings().embeds) {
								const options = args[0] ?? {}
								const sources: any[] = options.initialSources ?? options.sources ?? []
								const index = Number(options.initialIndex ?? options.index ?? 0) || 0
								if (tryPlay(youtubeInSource(sources[index] ?? sources[0]))) return
							}
						} catch {}
						return orig.apply(this, args)
					}),
				)
			}),
		)

		// Links in messages, and anything else that would leave the app for YouTube.
		cleanup(
			getModules((withProps as any)('handleClick'), (mod: any) => {
				if (typeof mod?.handleClick !== 'function') return
				cleanup(
					instead(mod, 'handleClick', function (this: unknown, args: any[], orig: (...a: any[]) => any) {
						if (settings().links && tryPlay(youtubeOf(args[0]?.href))) return
						return orig.apply(this, args)
					}),
				)
			}),
			instead(Linking, 'openURL', function (args: any[], orig: (...a: any[]) => any) {
				if (external.skip) {
					external.skip = false
					return orig.apply(Linking, args)
				}
				if ((settings().links || settings().embeds) && tryPlay(youtubeOf(args[0]))) return Promise.resolve(true)
				return orig.apply(Linking, args)
			}),
		)
	},
	SettingsComponent: SettingsPage,
})
