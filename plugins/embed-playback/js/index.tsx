import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { existsSync } from '@valenced/modules/native/fs'
import { pluginDistDirFor } from '@valenced/plugins/constants'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { Linking, ScrollView } from 'react-native'
import { findModule } from './find'
import { installPlayer, play, playerAvailable } from './player'
import { findWebView } from './webview'
import { describeSource, external, MODE_NAMES, MODES, youtubeInSource, youtubeOf } from './youtube'
import type { PlayerMode } from './youtube'
import type { OpenAs, PlayerSettings, Rect } from './player'

interface Settings extends PlayerSettings {
	/** Old setting (1.0–1.2): open as a floating window. Read once to pick `openAs`. */
	startSmall?: boolean
	/** YouTube embeds open here instead of Discord's full-screen viewer. */
	embeds: boolean
	/** YouTube links in messages open here instead of the YouTube app. */
	links: boolean
}
const DEFAULTS: Settings = { embeds: true, links: true, pipSize: 'medium', openAs: 'big', mode: 'discord' }
let settings: () => Settings = () => DEFAULTS

/**
 * Palm's Block YouTube Ads (community repo) hooks every Android WebView as it loads and adds
 * AdGuard's script to YouTube frames, so it covers this player too. It's an optional dependency:
 * loaded first when installed, nothing breaks when it isn't.
 */
const ADBLOCK_ID = 'palmdevs.block-youtube-ads'
function adblockInstalled(): boolean {
	try {
		return existsSync(`${pluginDistDirFor(ADBLOCK_ID)}/manifest.json`)
	} catch {
		return false
	}
}

let lastOpened = 0

/**
 * Where the embed's thumbnail is on screen, if Discord passed it to the viewer (viewers are given
 * the tapped item's position so they can animate from it). Any object in the arguments with a
 * position and a size counts; layout-like key names are preferred.
 */
function findRect(value: unknown): Rect | undefined {
	let best: { rect: Rect; score: number } | undefined
	const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
	const visit = (node: any, key: string, depth: number) => {
		if (!node || typeof node !== 'object' || depth > 5) return
		const x = num(node.pageX) ?? num(node.x) ?? num(node.left)
		const y = num(node.pageY) ?? num(node.y) ?? num(node.top)
		const width = num(node.width)
		const height = num(node.height)
		if (x !== undefined && y !== undefined && width && height && width > 60 && height > 40) {
			const score = (/layout|origin|frame|rect|measure|position/i.test(key) ? 2 : 0) + (node.pageX !== undefined ? 1 : 0)
			if (!best || score > best.score) best = { rect: { x, y, width, height }, score }
		}
		for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') visit(v, k, depth + 1)
	}
	visit(value, '', 0)
	return best?.rect
}

/** The arguments the viewer opener got for the last YouTube video, for "Copy debug info". */
let lastArgs = ''
function describeArgs(args: unknown): string {
	const seen = new WeakSet<object>()
	try {
		return JSON.stringify(
			args,
			(_k, v) => {
				if (typeof v === 'function') return '[fn]'
				if (v && typeof v === 'object') {
					if (seen.has(v)) return '[seen]'
					seen.add(v)
				}
				return typeof v === 'string' && v.length > 200 ? `${v.slice(0, 200)}…` : v
			},
			1,
		).slice(0, 6000)
	} catch (e) {
		return String(e)
	}
}
/** What happened to the last YouTube tap, for Settings → Status. */
let lastTap = 'No YouTube video tapped yet'
/** Which hooks attached, and what the viewer was last given. */
const hooked = { opener: false, header: false, links: false }
let lastSource = 'Nothing opened in the viewer yet'

/** Plays [video] if the player can; false lets Discord do what it would have done. */
function tryPlay(video: { videoId: string; start?: number } | undefined, via: string, rect?: Rect): boolean {
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
	if (settings().openAs === 'thumbnail')
		lastTap += rect ? ' · on the thumbnail' : " · thumbnail position not given, opened big"
	play(video, rect)
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
				<TableRadioGroup title="Open as" defaultValue={s.openAs} value={s.openAs} onChange={(openAs: OpenAs) => set({ openAs })}>
					<TableRadioRow label="Big" subLabel="Across the top of the screen." value="big" />
					<TableRadioRow label="On the thumbnail" subLabel="Where the embed's picture is, the same size." value="thumbnail" />
					<TableRadioRow label="Small floating window" value="small" />
				</TableRadioGroup>
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
				<TableRowGroup title="Ads">
					<TableRow
						label="Block YouTube Ads"
						subLabel={
							adblockInstalled()
								? "Installed. Keep it enabled: it blocks ads in this player's videos too."
								: 'Not installed. Get it from Plugins → Community Plugins (by Palm) to block ads in these videos.'
						}
					/>
				</TableRowGroup>
				<TableRowGroup title="Status">
					<TableRow label="Player" subLabel={playerAvailable() ? 'Ready' : 'Not attached yet (open any chat once)'} />
					<TableRow label="Web view" subLabel={findWebView() ? 'Found' : "Not found: videos open Discord's usual way"} />
					<TableRow label="Last YouTube tap" subLabel={lastTap} />
					<TableRow
						label="Hooks"
						subLabel={`Viewer opener: ${hooked.opener ? 'yes' : 'no'} · Viewer header: ${hooked.header ? 'yes' : 'no'} · Links: ${hooked.links ? 'yes' : 'no'}`}
					/>
					<TableRow label="Last thing the viewer showed" subLabel={lastSource} />
					<TableRow
						label="Copy debug info"
						subLabel="What Discord passed for the last YouTube video, to send to the developer."
						onPress={() => {
							void Clipboard.setString(lastArgs || 'No YouTube video opened through the viewer yet')
							try {
								ToastActionCreators.open('embed-playback', { text: 'Copied' } as never)
							} catch {}
						}}
					/>
				</TableRowGroup>
				<Text variant="text-sm/medium" color="text-muted">
					Drag the player by its bar and resize it from the ◢ corner. ▁ shrinks it to a small floating
					window and ⤢ makes it big; it keeps playing while you scroll and switch channels. ↻ tries
					another way of loading the video, ↗ opens it in YouTube, ✕ closes it. Back shrinks a big player.
				</Text>
			</Stack>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }) {
		settings = () => {
			const s = { ...DEFAULTS, ...jsonStorage.cache } as Settings
			if (!(jsonStorage.cache as any)?.openAs && s.startSmall) s.openAs = 'small'
			return s
		}
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
								const video = youtubeInSource(sources[index] ?? sources[0]) ?? youtubeInSource(args)
								if (video) lastArgs = describeArgs(args)
								if (tryPlay(video, 'the viewer opener', findRect(args))) return
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
