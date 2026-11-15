import { getAssetIdByName } from '@valenced/assets'
import { Design } from '@valenced/discord/design'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Image, View } from 'react-native'
import { control, getState, positionOf, subscribe } from './store'
import type { Playback } from './store'

export const useMedia = () => useSyncExternalStore(subscribe, getState)

/** First icon name that exists in this Discord version. */
function icon(...names: string[]): number | undefined {
	for (const name of names) {
		const id = getAssetIdByName(name)
		if (typeof id === 'number') return id
	}
	return undefined
}

const ICONS = {
	play: () => icon('PlayIcon', 'MediaPlayIcon'),
	pause: () => icon('PauseIcon', 'MediaPauseIcon'),
	next: () => icon('SkipForwardIcon', 'SkipNextIcon', 'ArrowSmallRightIcon'),
	previous: () =>
		icon('SkipBackwardIcon', 'SkipPreviousIcon', 'ArrowSmallLeftIcon'),
	shuffle: () => icon('ShuffleIcon', 'ArrowsLeftRightIcon'),
	repeat: () => icon('RepeatIcon', 'LoopIcon', 'RefreshIcon'),
	music: () => icon('MusicIcon', 'HeadphonesIcon'),
	close: () => icon('XSmallIcon', 'CloseSmallIcon', 'XLargeIcon'),
	collapse: () => icon('ChevronSmallDownIcon', 'ArrowSmallDownIcon'),
	expand: () => icon('ChevronSmallUpIcon', 'ArrowSmallUpIcon'),
}

function time(ms: number) {
	const total = Math.max(0, Math.floor(ms / 1000))
	const h = Math.floor(total / 3600)
	const m = Math.floor((total % 3600) / 60)
	const s = String(total % 60).padStart(2, '0')
	return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** Re-renders every half second while playing, so the time moves. */
function useTicker(active: boolean) {
	const [, setTick] = useState(0)
	useEffect(() => {
		if (!active) return
		const t = setInterval(() => setTick(n => n + 1), 500)
		return () => clearInterval(t)
	}, [active])
}

function Cover({ uri, size }: { uri: string | null; size: number }) {
	const music = ICONS.music()
	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: 8,
				overflow: 'hidden',
				backgroundColor: 'rgba(255, 255, 255, 0.08)',
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			{uri ? (
				<Image source={{ uri }} style={{ width: size, height: size }} />
			) : music ? (
				<Image
					source={music}
					style={{ width: size / 2, height: size / 2, opacity: 0.6 }}
				/>
			) : null}
		</View>
	)
}

function Btn({
	name,
	onPress,
	primary,
	active,
	label,
}: {
	name: keyof typeof ICONS
	onPress(): void
	primary?: boolean
	active?: boolean
	label: string
}) {
	const { IconButton } = Design
	const id = ICONS[name]()
	if (id === undefined) return null
	return (
		<IconButton
			icon={id}
			size={primary ? 'lg' : 'md'}
			variant={primary ? 'primary' : active ? 'active' : 'secondary'}
			onPress={onPress}
			accessibilityLabel={label}
		/>
	)
}

function Progress({ p }: { p: Playback }) {
	const { Slider, Text } = Design
	const [drag, setDrag] = useState<number | null>(null)
	useTicker(p.playing && drag === null)
	const pos = drag ?? positionOf(p) / 1000
	const max = Math.max(p.duration / 1000, 1)

	return (
		<View style={{ gap: 2 }}>
			{p.canSeek ? (
				<Slider
					step={1}
					value={Math.min(pos, max)}
					minimumValue={0}
					maximumValue={max}
					onSlidingStart={() => setDrag(pos)}
					onValueChange={setDrag}
					onSlidingComplete={value => {
						setDrag(null)
						control('seek', Math.round(value * 1000))
					}}
				/>
			) : (
				<View
					style={{
						height: 4,
						borderRadius: 2,
						marginVertical: 8,
						backgroundColor: 'rgba(255, 255, 255, 0.12)',
						overflow: 'hidden',
					}}
				>
					<View
						style={{
							height: 4,
							width: `${p.duration ? (pos / max) * 100 : 0}%`,
							backgroundColor: 'rgba(255, 255, 255, 0.6)',
						}}
					/>
				</View>
			)}
			<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
				<Text variant="text-xs/medium" color="text-muted">
					{time(pos * 1000)}
				</Text>
				<Text variant="text-xs/medium" color="text-muted">
					{p.duration ? time(p.duration) : ''}
				</Text>
			</View>
		</View>
	)
}

export function Player({
	p,
	compact,
	onToggleCompact,
	onClose,
}: {
	p: Playback
	compact?: boolean
	onToggleCompact?(): void
	onClose?(): void
}) {
	const { Text } = Design
	const playPause = (
		<Btn
			name={p.playing ? 'pause' : 'play'}
			primary={!compact}
			label={p.playing ? 'Pause' : 'Play'}
			onPress={() => control('playPause')}
		/>
	)

	return (
		<View style={{ gap: 10 }}>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
				<Cover uri={p.artwork} size={compact ? 44 : 56} />
				<View style={{ flex: 1, minWidth: 0 }}>
					<Text variant="text-md/semibold" lineClamp={1}>
						{p.title}
					</Text>
					<Text variant="text-sm/medium" color="text-muted" lineClamp={1}>
						{p.subtitle}
						{p.app && p.subtitle !== p.app ? ` · ${p.app}` : ''}
					</Text>
				</View>
				{compact ? (
					<>
						{playPause}
						<Btn name="next" label="Next" onPress={() => control('next')} />
					</>
				) : null}
				{onToggleCompact ? (
					<Btn
						name={compact ? 'expand' : 'collapse'}
						label={compact ? 'Expand' : 'Collapse'}
						onPress={onToggleCompact}
					/>
				) : null}
				{onClose ? <Btn name="close" label="Hide" onPress={onClose} /> : null}
			</View>

			{compact ? null : (
				<>
					{p.source === 'bridge' ? <Progress p={p} /> : null}
					<View
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							justifyContent: 'space-between',
						}}
					>
						<View style={{ width: 48, alignItems: 'center' }}>
							{p.canShuffle ? (
								<Btn
									name="shuffle"
									label="Shuffle"
									active={p.shuffle}
									onPress={() => control('shuffle')}
								/>
							) : null}
						</View>
						<Btn
							name="previous"
							label="Previous"
							onPress={() => control('previous')}
						/>
						{playPause}
						<Btn name="next" label="Next" onPress={() => control('next')} />
						<View style={{ width: 48, alignItems: 'center' }}>
							{p.canRepeat ? (
								<Btn
									name="repeat"
									label={`Repeat: ${p.repeat}`}
									active={p.repeat !== 'off'}
									onPress={() => control('repeat')}
								/>
							) : null}
						</View>
					</View>
				</>
			)}
		</View>
	)
}
