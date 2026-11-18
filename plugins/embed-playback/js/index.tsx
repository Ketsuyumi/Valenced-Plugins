import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { Linking, ScrollView } from 'react-native'
import { findModule } from './find'
import { installPlayer, play, playerAvailable } from './player'
import { findWebView } from './webview'
import { describeSource, external, MODE_NAMES, MODES, youtubeInSource, youtubeOf } from './youtube'
import type { PlayerMode } from './youtube'
import type { PlayerSettings } from './player'

interface Settings extends PlayerSettings {
	/** YouTube embeds open here instead of Discord's full-screen viewer. */
	embeds: boolean
	/** YouTube links in messages open here instead of the YouTube app. */
	links: boolean
}
const DEFAULTS: Settings = { embeds: true, links: true, pipSize: 'medium', startSmall: false, mode: 'discord' }
let settings: () => Settings = () => DEFAULTS

let lastOpened = 0
/** What happened to the last YouTube tap, for Settings → Status. */
let lastTap = 'No YouTube video tapped yet'
/** Which hooks attached, and what the viewer was last given. */
const hooked = { opener: false, header: false, links: false }
let lastSource = 'Nothing opened in the viewer yet'

/** Plays [video] if the player can; false lets Discord do what it would have done. */
function tryPlay(video: { videoId: string; start?: number } | undefined, via: string): boolean {
	if (!video) return false
	if (!playerAvailable()) {
		lastTap = `Caught by ${via}, but the player isn't attached (open a chat once)`
		return false
	}
	if (!findWebView()) {
		lastTap = `Caught by ${via}, but Discord's web view wasn't found`
		return false
	}
	lastTap = `Played via ${via}`
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
				<TableRadioGroup
					title="How the video loads"
					defaultValue={s.mode}
					value={s.mode}
					onChange={(mode: PlayerMode) => set({ mode })}
				>
					{MODES.map(m => (
						<TableRadioRow key={m} label={MODE_NAMES[m]} value={m} />
					))}
				</TableRadioGroup>
				<Text variant="text-sm/medium" color="text-muted">
					If YouTube says "This video is unavailable" or shows an error code, tap ↻ in the player to try
					the next way. The one you end on is remembered.
				</Text>
				<TableRowGroup title="Status">
					<TableRow label="Player" subLabel={playerAvailable() ? 'Ready' : 'Not attached yet (open any chat once)'} />
					<TableRow label="Web view" subLabel={findWebView() ? 'Found' : "Not found: videos open Discord's usual way"} />
					<TableRow label="Last YouTube tap" subLabel={lastTap} />
					<TableRow
						label="Hooks"
						subLabel={`Viewer opener: ${hooked.opener ? 'yes' : 'no'} · Viewer header: ${hooked.header ? 'yes' : 'no'} · Links: ${hooked.links ? 'yes' : 'no'}`}
					/>
					<TableRow label="Last thing the viewer showed" subLabel={lastSource} />
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
		cleanup(
			installPlayer(
				() => settings(),
				mode => jsonStorage.set({ ...settings(), mode }, true),
			),
		)

		// Embeds: Discord opens YouTube embeds in its media viewer (openMediaModal).
		cleanup(
			findModule('modules/media_viewer/native/components/openMediaModal.tsx', ['openMediaModal'], (mod: any) => {
				const host = typeof mod?.openMediaModal === 'function' ? mod : typeof mod?.default?.openMediaModal === 'function' ? mod.default : null
				if (!host) return
				hooked.opener = true
				cleanup(
					instead(host, 'openMediaModal', function (this: unknown, args: any[], orig: (...a: any[]) => any) {
						try {
							if (settings().embeds) {
								const options = args[0] ?? {}
								const sources: any[] = options.initialSources ?? options.sources ?? []
								const index = Number(options.initialIndex ?? options.index ?? 0) || 0
								lastSource = `opener: ${describeSource(sources[index] ?? sources[0] ?? options)}`
								if (tryPlay(youtubeInSource(sources[index] ?? sources[0]), 'the viewer opener')) return
							}
						} catch {}
						return orig.apply(this, args)
					}),
				)
			}),
		)

		// The viewer itself: however Discord opened it, its header gets the current source and
		// onClose (Pocket Browser's notes, 350.4+). A YouTube source closes the viewer and plays here.
		let handled = ''
		const onHeader = (props: any) => {
			try {
				if (props?.source) lastSource = `header: ${describeSource(props.source)}`
				if (!settings().embeds) return
				const video = youtubeInSource(props?.source)
				if (!video) return
				const key = `${video.videoId}:${video.start ?? 0}`
				if (handled === key) return
				handled = key
				setTimeout(() => (handled = ''), 1500)
				if (Date.now() - lastOpened < 1500) {
					// Already playing from an earlier hook; just close the viewer.
					props?.onClose?.()
					return
				}
				if (tryPlay(video, "the viewer's header")) setTimeout(() => props?.onClose?.(), 0)
			} catch {}
		}
		cleanup(
			findModule(
				'modules/media_viewer/native/components/overlay/MediaModalOverlayHeader.tsx',
				['MediaModalOverlayHeader'],
				(mod: any) => {
					for (const key of ['MediaModalOverlayHeader', 'default']) {
						const target = mod?.[key]
						const host =
							typeof target === 'function'
								? { o: mod, k: key }
								: typeof target?.type === 'function'
									? { o: target, k: 'type' }
									: null
						if (!host) continue
						hooked.header = true
						cleanup(
							instead(host.o, host.k, function (this: unknown, args: any[], orig: (...a: any[]) => any) {
								onHeader(args[0])
								return orig.apply(this, args)
							}),
						)
						break
					}
				},
			),
		)

		// Links in messages, and anything else that would leave the app for YouTube.
		cleanup(
			getModules((withProps as any)('handleClick'), (mod: any) => {
				if (typeof mod?.handleClick !== 'function') return
				hooked.links = true
				cleanup(
					instead(mod, 'handleClick', function (this: unknown, args: any[], orig: (...a: any[]) => any) {
						if (settings().links && tryPlay(youtubeOf(args[0]?.href), 'the link handler')) return
						return orig.apply(this, args)
					}),
				)
			}),
			instead(Linking, 'openURL', function (args: any[], orig: (...a: any[]) => any) {
				if (external.skip) {
					external.skip = false
					return orig.apply(Linking, args)
				}
				if ((settings().links || settings().embeds) && tryPlay(youtubeOf(args[0]), 'the open-link hook')) return Promise.resolve(true)
				return orig.apply(Linking, args)
			}),
		)
	},
	SettingsComponent: SettingsPage,
})
