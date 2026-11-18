import { Design } from '@valenced/discord/design'
import { after } from '@valenced/patcher'
import { useEffect, useRef, useState } from 'react'
import { BackHandler, Linking, PanResponder, Pressable, useWindowDimensions, View } from 'react-native'
import { findModule } from './find'
import { findWebView } from './webview'
import { external, MODES, playerSource } from './youtube'
import type { PlayerMode } from './youtube'

/**
 * The player, drawn beside Discord's toast container (mounted once over the whole app, like Multi
 * Select's bar), so it stays while you scroll and change channels. "Big" docks it under the
 * header; "small" is a floating picture-in-picture window you can drag to a corner. Switching only
 * changes the outer box's size and place, so the WebView (and the video) is never reloaded.
 */

export interface Video {
	videoId: string
	start?: number
}
export interface PlayerSettings {
	pipSize: 'small' | 'medium' | 'large'
	startSmall: boolean
	mode: PlayerMode
}

let current: (Video & { small: boolean }) | null = null
const listeners = new Set<() => void>()
const emit = () => {
	for (const l of listeners) l()
}
let readSettings: () => PlayerSettings = () => ({ pipSize: 'medium', startSmall: false, mode: 'discord' })
let saveMode: (mode: PlayerMode) => void = () => {}
let mounted = false
export const playerAvailable = () => mounted

export function play(video: Video) {
	current = { ...video, small: readSettings().startSmall }
	emit()
}
export function closePlayer() {
	current = null
	emit()
}
const setSmall = (small: boolean) => {
	if (!current) return
	current = { ...current, small }
	emit()
}

const BAR = 30
const SIZES = { small: 0.42, medium: 0.56, large: 0.72 }

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

function Player({ video }: { video: Video & { small: boolean } }) {
	const { Text } = Design as any
	const { width, height } = useWindowDimensions()
	const WebView = findWebView()
	// Where the small window sits: offset from the bottom-right corner, moved by dragging.
	const [offset, setOffset] = useState({ x: 12, y: 150 })
	const start = useRef(offset)
	const pan = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => false,
			onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
			onPanResponderGrant: () => {
				start.current = offsetRef.current
			},
			onPanResponderMove: (_, g) => {
				setOffset({
					x: Math.max(0, start.current.x - g.dx),
					y: Math.max(0, start.current.y - g.dy),
				})
			},
		}),
	).current
	const offsetRef = useRef(offset)
	offsetRef.current = offset

	const small = video.small
	const w = small ? Math.round(width * SIZES[readSettings().pipSize]) : width
	const h = Math.round((w * 9) / 16)
	const box = small
		? {
				right: Math.min(offset.x, width - w),
				bottom: Math.min(offset.y, height - h - BAR - 40),
				width: w,
				borderRadius: 12,
			}
		: { top: 96, left: 0, width: w }

	return (
		<View
			style={{
				position: 'absolute',
				...box,
				overflow: 'hidden',
				backgroundColor: '#000',
				elevation: 1000,
				zIndex: 1000,
			}}
		>
			<View
				{...(small ? pan.panHandlers : {})}
				style={{ height: BAR, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(20,20,24,0.92)' }}
			>
				<Text variant="text-xs/semibold" style={{ color: '#bbbbbb', flex: 1, paddingLeft: 10 }} numberOfLines={1}>
					{small ? '⠿ drag' : 'YouTube'}
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
				{!small ? (
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
				<Button label={small ? '⤢' : '▁'} hint={small ? 'Make bigger' : 'Shrink to a floating window'} onPress={() => setSmall(!small)} />
				<Button label="✕" hint="Close the player" onPress={closePlayer} />
			</View>
			<View style={{ width: w, height: h }}>
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
			</View>
		</View>
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
	// Back shrinks the big player first, then lets Discord handle back as usual.
	useEffect(() => {
		if (!current || current.small) return
		const sub = BackHandler.addEventListener('hardwareBackPress', () => {
			setSmall(true)
			return true
		})
		return () => sub.remove()
	}, [current?.videoId, current?.small])
	if (!current) return null
	return (
		<View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
			<Player video={current} />
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
