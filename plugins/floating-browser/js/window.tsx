import { ToastActionCreators } from '@valenced/discord/actions'
import { after } from '@valenced/patcher'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
	BackHandler,
	Dimensions,
	Linking,
	PanResponder,
	Pressable,
	ScrollView,
	Text,
	TextInput,
	View,
} from 'react-native'
import {
	afterLoad,
	beforeLoad,
	blockedNav,
	DESKTOP_UA,
	pageFilters,
	tokensCss,
} from './ext'
import { blocksDocument, compiled, cosmeticForTokens } from './filters'
import { onFilters } from './updater'
import { findModule } from './find'
import { hostOf, save, settings, toUrl, useSettings, type Win } from './store'
import { findWebView } from './webview'

/**
 * The floating browser: one window over the whole app (drawn beside Discord's toast container, as
 * Embed Playback's player is), so the page keeps playing while you scroll, switch chats and type.
 * Drag it by its bar, resize from the ◢ corner, or use the Big / Corner / 16:9 presets. Moving and
 * resizing only change the outer box, so the page is never reloaded.
 */

const BAR = 34
const MIN_W = 180
const MIN_H = 120

let open = false
let win: Win | undefined
let startUrl = ''
let mounted = false
const listeners = new Set<() => void>()
const emit = () => {
	for (const l of listeners) l()
}
export const browserReady = () => mounted

/** Set right before handing a link to the system, so the link hook lets it through. */
export const external = { skip: false }

function toast(text: string) {
	try {
		ToastActionCreators.open('floating-browser', { text } as never)
	} catch {}
}

const screen = () => Dimensions.get('window')
function clamp(w: Win): Win {
	const { width, height } = screen()
	const ww = Math.max(MIN_W, Math.min(width, Math.round(w.w)))
	const hh = Math.max(MIN_H + BAR, Math.min(height - 40, Math.round(w.h)))
	return {
		w: ww,
		h: hh,
		x: Math.max(0, Math.min(width - ww, Math.round(w.x))),
		y: Math.max(24, Math.min(height - hh, Math.round(w.y))),
	}
}
const presets = {
	big: (): Win => {
		const { width, height } = screen()
		return clamp({ x: 0, y: 90, w: width, h: Math.round(height * 0.62) })
	},
	corner: (): Win => {
		const { width, height } = screen()
		const w = Math.round(width * 0.62)
		const h = Math.round((w * 9) / 16) + BAR
		return clamp({ x: width - w - 10, y: height - h - 150, w, h })
	},
	video: (): Win => {
		const { width } = screen()
		return clamp({
			x: 0,
			y: 100,
			w: width,
			h: Math.round((width * 9) / 16) + BAR,
		})
	},
}
const isBig = () =>
	!!win && win.w >= screen().width * 0.9 && win.h > screen().height * 0.5

let saveTimer: any
function setWin(next: Win) {
	win = clamp(next)
	emit()
	clearTimeout(saveTimer)
	saveTimer = setTimeout(() => save({ win }), 800)
}

export function openBrowser(url?: string) {
	if (!mounted)
		return toast(
			'Restart Discord once to finish setting up the floating browser',
		)
	const s = settings()
	startUrl = url ? toUrl(url) : s.lastUrl || s.home
	win = win ?? (s.win ? clamp(s.win) : presets.big())
	open = true
	emit()
	if (url) loadHook?.(startUrl)
}
export function closeBrowser() {
	open = false
	emit()
}
let loadHook: ((url: string) => void) | undefined

/** The window before a video went fullscreen in it, to go back to afterwards. */
let beforeFullscreen: Win | undefined
/** A video went fullscreen in the window: turn the window into a full-width landscape box, and back. */
function sideways(on: boolean) {
	if (on) {
		if (!beforeFullscreen && win) beforeFullscreen = { ...win }
		const { width, height } = screen()
		const h = Math.round((width * 9) / 16) + BAR
		setWin({ x: 0, y: Math.max(60, Math.round((height - h) / 3)), w: width, h })
	} else if (beforeFullscreen) {
		setWin(beforeFullscreen)
		beforeFullscreen = undefined
	}
}

let dragStart: Win = { x: 0, y: 0, w: 0, h: 0 }
const dragger = PanResponder.create({
	onStartShouldSetPanResponder: () => false,
	onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
	onPanResponderGrant: () => {
		if (win) dragStart = { ...win }
	},
	onPanResponderMove: (_, g) =>
		setWin({ ...dragStart, x: dragStart.x + g.dx, y: dragStart.y + g.dy }),
})
const resizer = PanResponder.create({
	onStartShouldSetPanResponder: () => true,
	onMoveShouldSetPanResponder: () => true,
	onPanResponderGrant: () => {
		if (win) dragStart = { ...win }
	},
	onPanResponderMove: (_, g) =>
		setWin({ ...dragStart, w: dragStart.w + g.dx, h: dragStart.h + g.dy }),
})

function Btn({
	label,
	onPress,
	hint,
	off,
}: {
	label: string
	onPress: () => void
	hint: string
	off?: boolean
}) {
	return (
		<Pressable
			onPress={onPress}
			disabled={off}
			accessibilityLabel={hint}
			hitSlop={6}
			style={{
				paddingHorizontal: 8,
				height: BAR,
				justifyContent: 'center',
				opacity: off ? 0.35 : 1,
			}}
		>
			<Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>
				{label}
			</Text>
		</Pressable>
	)
}

function Toggle({
	label,
	on,
	onPress,
}: {
	label: string
	on: boolean
	onPress: () => void
}) {
	return (
		<Pressable
			onPress={onPress}
			style={{
				paddingHorizontal: 11,
				paddingVertical: 7,
				margin: 3,
				borderRadius: 14,
				backgroundColor: on ? '#5865F2' : 'rgba(255,255,255,0.08)',
			}}
		>
			<Text
				style={{
					color: '#ffffff',
					fontSize: 13,
					fontWeight: on ? '700' : '500',
				}}
			>
				{label}
			</Text>
		</Pressable>
	)
}

function Browser({ box }: { box: Win }) {
	const s = useSettings()
	const WebView = findWebView()
	const ref = useRef<any>(null)
	const [url, setUrl] = useState(startUrl)
	const [page, setPage] = useState({
		url: startUrl,
		title: '',
		back: false,
		forward: false,
	})
	const [address, setAddress] = useState<string | undefined>(
		startUrl ? undefined : '',
	)
	const [panel, setPanel] = useState(false)
	const big = isBig()

	useEffect(() => {
		loadHook = next => {
			setUrl(next)
			setAddress(undefined)
		}
		return () => {
			loadHook = undefined
		}
	}, [])
	// A switch changed: apply it to the page that's open, no reload.
	useEffect(() => {
		if (page.url) ref.current?.injectJavaScript?.(afterLoad(s, page.url))
	}, [s.adHide, s.dark, s.videoFocus, s.scripts])
	// Back: the page's history first, then shrink a big window.
	useEffect(() => {
		const sub = BackHandler.addEventListener('hardwareBackPress', () => {
			if (page.back) {
				ref.current?.goBack?.()
				return true
			}
			if (big) {
				setWin(presets.corner())
				return true
			}
			return false
		})
		return () => sub.remove()
	}, [page.back, big])

	const go = (text: string) => {
		const next = toUrl(text)
		if (!next) return
		setUrl(next)
		setAddress(undefined)
		setPanel(false)
	}
	const bookmarked = s.bookmarks.some(b => b.url === page.url)
	// Requests and pages stopped by the filters on this page.
	const [blocked, setBlocked] = useState({ inPage: 0, pages: 0 })
	const [filtersVersion, setFiltersVersion] = useState(0)
	useEffect(() => onFilters(() => setFiltersVersion(v => v + 1)), [])
	// The start-of-page script only changes with these, so it isn't rebuilt (and resent) every render.
	const startScript = useMemo(
		() => beforeLoad(s),
		[s.popupBlock, s.uBlock, s.inWindowFullscreen, filtersVersion],
	)
	const h = box.h - BAR

	return (
		<View
			style={{
				position: 'absolute',
				left: box.x,
				top: box.y,
				width: box.w,
				height: box.h,
				borderRadius: big ? 0 : 12,
				overflow: 'hidden',
				backgroundColor: '#111214',
				elevation: 1000,
				zIndex: 1000,
				borderWidth: big ? 0 : 1,
				borderColor: 'rgba(255,255,255,0.12)',
			}}
		>
			<View
				{...dragger.panHandlers}
				style={{
					height: BAR,
					flexDirection: 'row',
					alignItems: 'center',
					backgroundColor: 'rgba(24,25,28,0.97)',
				}}
			>
				<Btn
					label="‹"
					hint="Back"
					off={!page.back}
					onPress={() => ref.current?.goBack?.()}
				/>
				<Pressable
					style={{ flex: 1, height: BAR, justifyContent: 'center' }}
					onPress={() => setAddress(page.url)}
					accessibilityLabel="Address"
				>
					<Text numberOfLines={1} style={{ color: '#c4c9ce', fontSize: 12 }}>
						⠿ {page.title || hostOf(page.url) || 'Floating Browser'}
					</Text>
				</Pressable>
				{box.w >= 240 ? (
					<Btn
						label="↻"
						hint="Reload"
						onPress={() => ref.current?.reload?.()}
					/>
				) : null}
				<Btn
					label="☰"
					hint="Extensions and bookmarks"
					onPress={() => setPanel(p => !p)}
				/>
				<Btn
					label={big ? '▁' : '⤢'}
					hint={big ? 'Small window' : 'Big window'}
					onPress={() => setWin(big ? presets.corner() : presets.big())}
				/>
				<Btn label="✕" hint="Close" onPress={closeBrowser} />
			</View>

			<View style={{ width: box.w, height: h }}>
				{url && WebView ? (
					<WebView
						ref={ref}
						key={`${s.desktop ? 'desktop' : 'mobile'}:${s.inWindowFullscreen ? 'win' : 'os'}`}
						source={{ uri: url }}
						userAgent={s.desktop ? DESKTOP_UA : undefined}
						originWhitelist={['*']}
						javaScriptEnabled
						domStorageEnabled
						allowsInlineMediaPlayback
						// Left on: with it off, players inside frames (where the in-window script may not reach)
						// decide fullscreen is impossible and hide their button.
						allowsFullscreenVideo
						injectedJavaScriptForMainFrameOnly={false}
						injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
						mediaPlaybackRequiresUserAction={false}
						setSupportMultipleWindows={false}
						javaScriptCanOpenWindowsAutomatically={!s.popupBlock}
						injectedJavaScriptBeforeContentLoaded={startScript}
						injectedJavaScript={afterLoad(s, url)}
						onLoadStart={(e: any) => {
							const u = e?.nativeEvent?.url
							setBlocked({ inPage: 0, pages: 0 })
							if (u && settings().uBlock && compiled())
								ref.current?.injectJavaScript?.(
									`(function(){${pageFilters(u)}})();true;`,
								)
						}}
						onMessage={(e: any) => {
							let data: any
							try {
								data = JSON.parse(e?.nativeEvent?.data ?? '')
							} catch {
								return
							}
							if (data?.fb === 'fs') return sideways(!!data.on)
							if (data?.fb === 'blocked' && typeof data.n === 'number')
								setBlocked(b => ({ ...b, inPage: data.n }))
							else if (
								data?.fb === 'tokens' &&
								Array.isArray(data.t) &&
								settings().uBlock
							) {
								const css = cosmeticForTokens(
									data.t.slice(0, 4000),
									String(data.h ?? ''),
								)
								if (css.length) ref.current?.injectJavaScript?.(tokensCss(css))
							}
						}}
						onLoadEnd={(e: any) => {
							const u = e?.nativeEvent?.url ?? page.url
							ref.current?.injectJavaScript?.(afterLoad(settings(), u))
						}}
						onShouldStartLoadWithRequest={(req: any) => {
							const next = String(req?.url ?? '')
							if (settings().popupBlock && blockedNav(next)) return false
							// uBlock's lists: don't leave the page for an ad or malware host (the usual pop-under trick).
							if (
								settings().uBlock &&
								/^https?:/i.test(next) &&
								hostOf(next) !== hostOf(page.url) &&
								blocksDocument(hostOf(next))
							) {
								setBlocked(b => ({ ...b, pages: b.pages + 1 }))
								return false
							}
							if (!/^(https?|about|data|blob):/i.test(next)) return false
							return true
						}}
						onNavigationStateChange={(n: any) => {
							setPage({
								url: n?.url ?? '',
								title: n?.title ?? '',
								back: !!n?.canGoBack,
								forward: !!n?.canGoForward,
							})
							if (n?.url && /^https?:/i.test(n.url)) save({ lastUrl: n.url })
						}}
						style={{ flex: 1, backgroundColor: '#ffffff' }}
					/>
				) : (
					<Home onGo={go} />
				)}

				{address !== undefined ? (
					<View
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							right: 0,
							padding: 6,
							backgroundColor: 'rgba(24,25,28,0.98)',
							flexDirection: 'row',
							alignItems: 'center',
						}}
					>
						<TextInput
							value={address}
							onChangeText={setAddress}
							onSubmitEditing={() => go(address)}
							autoFocus
							autoCapitalize="none"
							autoCorrect={false}
							keyboardType="url"
							returnKeyType="go"
							selectTextOnFocus
							placeholder="Search or type an address"
							placeholderTextColor="#80848e"
							style={{
								flex: 1,
								color: '#ffffff',
								fontSize: 14,
								paddingHorizontal: 10,
								height: 36,
								borderRadius: 8,
								backgroundColor: 'rgba(255,255,255,0.08)',
							}}
						/>
						<Btn
							label="✕"
							hint="Close the address bar"
							onPress={() => setAddress(undefined)}
						/>
					</View>
				) : null}

				{panel ? (
					<ScrollView
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							right: 0,
							maxHeight: h,
							backgroundColor: 'rgba(24,25,28,0.98)',
						}}
						contentContainerStyle={{ padding: 8 }}
					>
						<Text
							style={{
								color: '#80848e',
								fontSize: 11,
								marginLeft: 4,
								marginBottom: 2,
							}}
						>
							EXTENSIONS
						</Text>
						<View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
							<Toggle
								label="Pop-up blocker"
								on={s.popupBlock}
								onPress={() => save({ popupBlock: !s.popupBlock })}
							/>
							<Toggle
								label={`uBlock${s.uBlock && (blocked.inPage || blocked.pages) ? ` · ${blocked.inPage + blocked.pages} blocked` : ''}`}
								on={s.uBlock}
								onPress={() => save({ uBlock: !s.uBlock })}
							/>
							<Toggle
								label="Fullscreen in window"
								on={s.inWindowFullscreen}
								onPress={() =>
									save({ inWindowFullscreen: !s.inWindowFullscreen })
								}
							/>
							<Toggle
								label="Hide ads"
								on={s.adHide}
								onPress={() => save({ adHide: !s.adHide })}
							/>
							<Toggle
								label="Dark pages"
								on={s.dark}
								onPress={() => save({ dark: !s.dark })}
							/>
							<Toggle
								label="Video focus"
								on={s.videoFocus}
								onPress={() => save({ videoFocus: !s.videoFocus })}
							/>
							<Toggle
								label="Desktop site"
								on={s.desktop}
								onPress={() => save({ desktop: !s.desktop })}
							/>
							{s.scripts.map(sc => (
								<Toggle
									key={sc.id}
									label={`⚙ ${sc.name || 'script'}`}
									on={sc.on}
									onPress={() =>
										save({
											scripts: s.scripts.map(x =>
												x.id === sc.id ? { ...x, on: !x.on } : x,
											),
										})
									}
								/>
							))}
						</View>
						<Text
							style={{
								color: '#80848e',
								fontSize: 11,
								marginLeft: 4,
								marginTop: 8,
								marginBottom: 2,
							}}
						>
							WINDOW
						</Text>
						<View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
							<Toggle
								label="Big"
								on={false}
								onPress={() => setWin(presets.big())}
							/>
							<Toggle
								label="Corner"
								on={false}
								onPress={() => setWin(presets.corner())}
							/>
							<Toggle
								label="16:9"
								on={false}
								onPress={() => setWin(presets.video())}
							/>
						</View>
						<Text
							style={{
								color: '#80848e',
								fontSize: 11,
								marginLeft: 4,
								marginTop: 8,
								marginBottom: 2,
							}}
						>
							PAGE
						</Text>
						<View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
							{page.url ? (
								<Toggle
									label={bookmarked ? '★ Bookmarked' : '☆ Bookmark'}
									on={bookmarked}
									onPress={() =>
										save({
											bookmarks: bookmarked
												? s.bookmarks.filter(b => b.url !== page.url)
												: [
														...s.bookmarks,
														{
															title: page.title || hostOf(page.url),
															url: page.url,
														},
													],
										})
									}
								/>
							) : null}
							<Toggle
								label="⌂ Home"
								on={false}
								onPress={() => {
									setUrl('')
									setPanel(false)
								}}
							/>
							{page.forward ? (
								<Toggle
									label="Forward ›"
									on={false}
									onPress={() => ref.current?.goForward?.()}
								/>
							) : null}
							{page.url ? (
								<Toggle
									label="Open outside"
									on={false}
									onPress={() => {
										external.skip = true
										void Linking.openURL(page.url).catch(() => {})
										setTimeout(() => (external.skip = false), 1500)
									}}
								/>
							) : null}
						</View>
					</ScrollView>
				) : null}

				<View
					{...resizer.panHandlers}
					accessibilityLabel="Resize"
					style={{
						position: 'absolute',
						right: 0,
						bottom: 0,
						width: 32,
						height: 32,
						alignItems: 'flex-end',
						justifyContent: 'flex-end',
						padding: 4,
					}}
				>
					<Text
						style={{
							color: 'rgba(128,128,128,0.9)',
							fontSize: 16,
							fontWeight: '700',
						}}
					>
						◢
					</Text>
				</View>
				{!WebView && url ? (
					<View
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							right: 0,
							bottom: 0,
							alignItems: 'center',
							justifyContent: 'center',
						}}
					>
						<Text style={{ color: '#ffffff' }}>
							Couldn't start a web view on this Discord version.
						</Text>
					</View>
				) : null}
			</View>
		</View>
	)
}

function Home({ onGo }: { onGo: (text: string) => void }) {
	const s = useSettings()
	const [text, setText] = useState('')
	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: '#111214' }}
			contentContainerStyle={{ padding: 12 }}
			keyboardShouldPersistTaps="handled"
		>
			<TextInput
				value={text}
				onChangeText={setText}
				onSubmitEditing={() => onGo(text)}
				autoCapitalize="none"
				autoCorrect={false}
				keyboardType="url"
				returnKeyType="go"
				placeholder="Search or type an address"
				placeholderTextColor="#80848e"
				style={{
					color: '#ffffff',
					fontSize: 15,
					paddingHorizontal: 12,
					height: 42,
					borderRadius: 10,
					backgroundColor: 'rgba(255,255,255,0.08)',
				}}
			/>
			<View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
				{s.bookmarks.map(b => (
					<Pressable
						key={b.url}
						onPress={() => onGo(b.url)}
						style={{
							paddingHorizontal: 12,
							paddingVertical: 9,
							margin: 3,
							borderRadius: 10,
							backgroundColor: 'rgba(255,255,255,0.07)',
							maxWidth: '100%',
						}}
					>
						<Text numberOfLines={1} style={{ color: '#ffffff', fontSize: 13 }}>
							★ {b.title || hostOf(b.url)}
						</Text>
					</Pressable>
				))}
			</View>
			{!s.bookmarks.length ? (
				<Text style={{ color: '#80848e', fontSize: 12, marginTop: 8 }}>
					Bookmarks you add from ☰ show up here.
				</Text>
			) : null}
		</ScrollView>
	)
}

function Host() {
	const [, tick] = useState(0)
	useEffect(() => {
		mounted = true
		const on = () => tick(n => n + 1)
		listeners.add(on)
		return () => {
			listeners.delete(on)
			mounted = false
		}
	}, [])
	return (
		<View
			pointerEvents="box-none"
			style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
		>
			{open && win ? <Browser box={win} /> : null}
		</View>
	)
}

export function installWindow(): () => void {
	const undo: Array<() => void> = []
	undo.push(
		findModule(
			'modules/toast/native/AppToastContainer.tsx',
			['AppToastContainer'],
			(mod: any) => {
				if (typeof mod?.default !== 'function') return
				undo.push(
					after(mod, 'default', ((rendered: any) => (
						<>
							{rendered}
							<Host />
						</>
					)) as never),
				)
			},
		),
	)
	return () => {
		for (const u of undo.splice(0))
			try {
				u()
			} catch {}
		open = false
		mounted = false
		clearTimeout(saveTimer)
	}
}
