import { Design } from '@valenced/discord/design'
import { after } from '@valenced/patcher'
import { useEffect, useRef, useState } from 'react'
import { BackHandler, Dimensions, Linking, PanResponder, Pressable, View } from 'react-native'
import { findModule } from './find'
import { findWebView } from './webview'
import { external, MODES, playerSource } from './youtube'
import type { PlayerMode } from './youtube'

/**
 * The player, drawn beside Discord's toast container (mounted once over the whole app), so it stays
 * while you scroll and change channels. It is one free window: drag it by its bar, resize it from
 * the ◢ corner (16:9 kept), or jump to the big or small preset. It opens big, on the embed's
 * thumbnail (when Discord says where that is), or small. Moving and resizing only change the outer
 * box, so the WebView (and the video) is never reloaded.
 */

export interface Video {
	videoId: string
	start?: number
}
/** A rectangle in window coordinates (where the embed's thumbnail is). */
export interface Rect {
	x: number
	y: number
	width: number
	height: number
}
export type OpenAs = 'big' | 'thumbnail' | 'small'
export interface PlayerSettings {
	pipSize: 'small' | 'medium' | 'large'
	openAs: OpenAs
	mode: PlayerMode
}

interface Window {
	x: number
	y: number
	/** Video width; the height follows at 16:9, plus the bar. */
	w: number
}

let current: (Video & Window) | null = null
const listeners = new Set<() => void>()
const emit = () => {
	for (const l of listeners) l()
}
let readSettings: () => PlayerSettings = () => ({ pipSize: 'medium', openAs: 'big', mode: 'discord' })
let saveMode: (mode: PlayerMode) => void = () => {}
let mounted = false
/** Where the overlay's top-left sits in the window, to place a thumbnail rectangle exactly. */
let overlayOffset = { x: 0, y: 0 }
export const playerAvailable = () => mounted

const BAR = 30
const MIN_W = 160
const BIG_TOP = 120
const SIZES = { small: 0.42, medium: 0.56, large: 0.72 }
const heightOf = (w: number) => Math.round((w * 9) / 16) + BAR

function screen() {
	const { width, height } = Dimensions.get('window')
	return { width, height }
}

/** Keeps the window on screen. */
function clamp(win: Window): Window {
	const { width, height } = screen()
	const w = Math.max(MIN_W, Math.min(width, Math.round(win.w)))
	const h = heightOf(w)
	return {
		w,
		x: Math.max(0, Math.min(width - w, Math.round(win.x))),
		y: Math.max(0, Math.min(height - h, Math.round(win.y))),
	}
}

export function bigWindow(): Window {
	return clamp({ x: 0, y: BIG_TOP, w: screen().width })
}
export function smallWindow(): Window {
	const { width, height } = screen()
	const w = Math.round(width * SIZES[readSettings().pipSize])
	return clamp({ x: width - w - 12, y: height - heightOf(w) - 150, w })
}
/** The window over the thumbnail: same width, the video where the thumbnail is, the bar just above. */
export function thumbnailWindow(rect: Rect): Window {
	return clamp({
		x: rect.x - overlayOffset.x,
		y: rect.y - overlayOffset.y - BAR,
		w: rect.width,
	})
}

export function play(video: Video, rect?: Rect) {
	const how = readSettings().openAs
	const win = how === 'small' ? smallWindow() : how === 'thumbnail' && rect ? thumbnailWindow(rect) : bigWindow()
	current = { ...video, ...win }
	emit()
}
export function closePlayer() {
	current = null
	emit()
}
function move(win: Window) {
	if (!current) return
	current = { ...current, ...clamp(win) }
	emit()
}
const isBig = () => !!current && current.w >= screen().width * 0.8

function Button({ label, onPress, hint }: { label: string; onPress: () => void; hint: string }) {
	const { Text } = Design as any
	return (
		<Pressable onPress={onPress} accessibilityLabel={hint} hitSlop={8} style={{ paddingHorizontal: 8, height: BAR, justifyContent: 'center' }}>
			<Text variant="text-md/bold" style={{ color: '#ffffff' }}>
				{label}
			</Text>
		</Pressable>
	)
}

// Drag and resize read and write the module's `current`, so the responders can be made once.
let dragStart: Window = { x: 0, y: 0, w: 0 }
const dragger = PanResponder.create({
	onStartShouldSetPanResponder: () => false,
	onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
	onPanResponderGrant: () => {
		if (current) dragStart = { x: current.x, y: current.y, w: current.w }
	},
	onPanResponderMove: (_, g) => move({ x: dragStart.x + g.dx, y: dragStart.y + g.dy, w: dragStart.w }),
})
const resizer = PanResponder.create({
	onStartShouldSetPanResponder: () => true,
	onMoveShouldSetPanResponder: () => true,
	onPanResponderGrant: () => {
		if (current) dragStart = { x: current.x, y: current.y, w: current.w }
	},
	// Whichever way the finger moved more decides the change; down or right grows, up or left shrinks.
	onPanResponderMove: (_, g) => {
		const fromHeight = (g.dy * 16) / 9
		const delta = Math.abs(g.dx) >= Math.abs(fromHeight) ? g.dx : fromHeight
		move({ x: dragStart.x, y: dragStart.y, w: dragStart.w + delta })
	},
})

function Player({ video }: { video: Video & Window }) {
	const { Text } = Design as any
	const WebView = findWebView()
	const big = isBig()
	const h = heightOf(video.w) - BAR
	return (
		<View
			style={{
				position: 'absolute',
				left: video.x,
				top: video.y,
				width: video.w,
				borderRadius: big ? 0 : 12,
				overflow: 'hidden',
				backgroundColor: '#000',
				elevation: 1000,
				zIndex: 1000,
			}}
		>
			<View {...dragger.panHandlers} style={{ height: BAR, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(20,20,24,0.92)' }}>
				<Text variant="text-xs/semibold" style={{ color: '#bbbbbb', flex: 1, paddingLeft: 10 }} numberOfLines={1}>
					⠿ YouTube
				</Text>
				<Button
					label="↻"
					hint="Try another way of loading the video"
					onPress={() => {
						const mode = readSettings().mode
						saveMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length])
						emit()
					}}
				/>
				{video.w >= 220 ? (
					<Button
						label="↗"
						hint="Open in YouTube"
						onPress={() => {
							external.skip = true
							void Linking.openURL(`https://www.youtube.com/watch?v=${video.videoId}`).catch(() => {})
							closePlayer()
						}}
					/>
				) : null}
				<Button
					label={big ? '▁' : '⤢'}
					hint={big ? 'Shrink to a floating window' : 'Make bigger'}
					onPress={() => move(big ? smallWindow() : bigWindow())}
				/>
				<Button label="✕" hint="Close the player" onPress={closePlayer} />
			</View>
			<View style={{ width: video.w, height: h }}>
				{WebView ? (
					<WebView
						key={`${video.videoId}:${readSettings().mode}`}
						source={playerSource(readSettings().mode, video.videoId, video.start)}
						originWhitelist={['*']}
						javaScriptEnabled
						domStorageEnabled
						allowsInlineMediaPlayback
						allowsFullscreenVideo
						mediaPlaybackRequiresUserAction={false}
						setSupportMultipleWindows={false}
						style={{ flex: 1, backgroundColor: '#000' }}
					/>
				) : (
					<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 }}>
						<Text variant="text-sm/medium" style={{ color: '#ffffff' }}>
							Couldn't start the player on this Discord version.
						</Text>
					</View>
				)}
				<View
					{...resizer.panHandlers}
					accessibilityLabel="Resize"
					style={{
						position: 'absolute',
						right: 0,
						bottom: 0,
						width: 30,
						height: 30,
						alignItems: 'flex-end',
						justifyContent: 'flex-end',
						padding: 4,
					}}
				>
					<Text variant="text-md/bold" style={{ color: 'rgba(255,255,255,0.8)' }}>
						◢
					</Text>
				</View>
			</View>
		</View>
	)
}

function Host() {
	const [, tick] = useState(0)
	const root = useRef<any>(null)
	useEffect(() => {
		mounted = true
		const on = () => tick(n => n + 1)
		listeners.add(on)
		return () => {
			listeners.delete(on)
			mounted = false
		}
	}, [])
	// Back shrinks a big player first, then lets Discord handle back as usual.
	useEffect(() => {
		if (!current || !isBig()) return
		const sub = BackHandler.addEventListener('hardwareBackPress', () => {
			move(smallWindow())
			return true
		})
		return () => sub.remove()
	}, [current?.videoId, current ? isBig() : false])
	return (
		<View
			ref={root}
			pointerEvents="box-none"
			onLayout={() => {
				try {
					root.current?.measureInWindow?.((x: number, y: number) => {
						if (Number.isFinite(x) && Number.isFinite(y)) overlayOffset = { x, y }
					})
				} catch {}
			}}
			style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
		>
			{current ? <Player video={current} /> : null}
		</View>
	)
}

export function installPlayer(read: () => PlayerSettings, writeMode: (mode: PlayerMode) => void): () => void {
	readSettings = read
	saveMode = writeMode
	const undo: Array<() => void> = []
	undo.push(
		findModule('modules/toast/native/AppToastContainer.tsx', ['AppToastContainer'], (mod: any) => {
			if (typeof mod?.default !== 'function') return
			undo.push(
				after(mod, 'default', ((rendered: any) => (
					<>
						{rendered}
						<Host />
					</>
				)) as never),
			)
		}),
	)
	return () => {
		for (const u of undo.splice(0))
			try {
				u()
			} catch {}
		current = null
		mounted = false
	}
}
