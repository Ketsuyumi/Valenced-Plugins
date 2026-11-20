import { useState } from 'react'
import { Image, View } from 'react-native'
import type { Frame } from './shop'

/**
 * A profile frame drawn from its layers around a card of [cardW] × [cardH], laid out the way
 * Discord's ProfileFrame does: scale = card width / inner width, every layer as wide as the card
 * plus the side overflow, staples pinned to the top (or bottom) with the top/bottom overflow,
 * side borders stretched to the card's height. [children] is the card itself, drawn between the
 * back and front layers.
 */
function Layer({
	url,
	w,
	top,
	bottom,
	h,
	stretch,
}: {
	url: string
	w: number
	top?: number
	bottom?: number
	h?: number
	stretch: boolean
}) {
	const [ratio, setRatio] = useState(0)
	const height = stretch ? h : ratio ? w * ratio : undefined
	if (!height) {
		// Measure the picture first (its own shape decides its height).
		return (
			<Image
				source={{ uri: url }}
				style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
				onLoad={(e: any) => {
					const s = e?.nativeEvent?.source
					if (s?.width && s?.height) setRatio(s.height / s.width)
				}}
			/>
		)
	}
	return (
		<Image
			source={{ uri: url }}
			resizeMode={stretch ? 'stretch' : 'contain'}
			style={{
				position: 'absolute',
				left: 0,
				width: w,
				height,
				...(bottom != null ? { bottom } : { top: top ?? 0 }),
			}}
		/>
	)
}

export function FrameView({
	frame,
	cardW,
	cardH,
	children,
}: {
	frame: Frame
	cardW: number
	cardH: number
	children?: any
}) {
	const k = cardW / frame.innerWidth
	const top = frame.top * k
	const bottom = frame.bottom * k
	const side = frame.side * k
	const W = cardW + side * 2
	const H = cardH + top + bottom
	const draw = (front: boolean) =>
		frame.layers
			.filter(l => l.front === front)
			.map((l, i) => (
				<Layer
					key={`${front ? 'f' : 'b'}${i}`}
					url={l.url}
					w={W}
					stretch={l.stretch}
					h={H}
					{...(l.bottom && !l.stretch ? { bottom: 0 } : { top: 0 })}
				/>
			))
	return (
		<View style={{ width: W, height: H }}>
			{draw(false)}
			<View
				style={{
					position: 'absolute',
					left: side,
					top,
					width: cardW,
					height: cardH,
				}}
			>
				{children}
			</View>
			{draw(true)}
		</View>
	)
}

/** The biggest card (profile-shaped, 1 : 1.35) whose frame fits in [boxW] × [boxH]. */
export function fitCard(
	frame: Frame,
	boxW: number,
	boxH: number,
): { cardW: number; cardH: number } {
	const s = frame.side / frame.innerWidth
	const tb = (frame.top + frame.bottom) / frame.innerWidth
	const cardW = Math.floor(Math.min(boxW / (1 + 2 * s), boxH / (1.35 + tb)))
	return { cardW, cardH: Math.floor(cardW * 1.35) }
}
