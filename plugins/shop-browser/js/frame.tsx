import { useEffect, useState } from 'react'
import { Image, PixelRatio, View } from 'react-native'
import type { Frame } from './shop'

/**
 * A profile frame drawn from its layers around a card of [cardW] × [cardH], laid out the way
 * Discord's ProfileFrame does: scale = card width / inner width, every layer as wide as the card
 * plus the side overflow, staples pinned to the top (or bottom) with the top/bottom overflow,
 * side borders stretched to the card's height. [children] is the card itself, drawn between the
 * back and front layers.
 */
const ratios = new Map<string, number>()

/** Like Discord: measure the bare picture, then ask the CDN for it at the exact size drawn. */
function useRatio(url: string): number {
	const [ratio, setRatio] = useState(() => ratios.get(url) ?? 0)
	useEffect(() => {
		if (ratio) return
		let gone = false
		Image.getSize(
			url,
			(w: number, h: number) => {
				if (w > 0 && !gone) {
					ratios.set(url, h / w)
					setRatio(h / w)
				}
			},
			() => {},
		)
		return () => {
			gone = true
		}
	}, [url])
	return ratio
}

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
	const ratio = useRatio(url)
	if (!ratio) return null
	const height = stretch && h ? h : w * ratio
	const px = Math.round(w * PixelRatio.get())
	return (
		<Image
			source={{ uri: `${url}?width=${px}&height=${Math.round(px * ratio)}` }}
			resizeMode={stretch ? 'stretch' : 'cover'}
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
