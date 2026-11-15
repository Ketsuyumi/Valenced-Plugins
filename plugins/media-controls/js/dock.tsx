import { Design } from '@valenced/discord/design'
import { getModules, lookupModule } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	FilterScopes,
	withProps,
} from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import {
	cloneElement,
	createElement,
	Fragment,
	isValidElement,
	useEffect,
	useRef,
	useState,
} from 'react'
// No plain `View` import here: the bundler would rewrite the `.View` in `Animated.View` to it.
import { Animated, PanResponder, Pressable } from 'react-native'
import { Player, useMedia } from './player'
import type { LayoutRectangle } from 'react-native'

const nameOf = (value: unknown): string => {
	const v = value as any
	if (typeof v === 'function') return v.displayName || v.name || ''
	if (v && typeof v === 'object')
		return (
			v.displayName ||
			v.type?.displayName ||
			v.type?.name ||
			v.render?.name ||
			''
		)
	return ''
}

/** Modules that export a component with this name (as default or a named export). */
const withComponentName = createFilterGenerator<[name: string]>(
	([name], _id, exports) => {
		if (
			!exports ||
			(typeof exports !== 'object' && typeof exports !== 'function')
		)
			return false
		if (nameOf(exports) === name) return true
		if (typeof exports !== 'object') return false
		for (const key of Object.keys(exports)) {
			try {
				if (nameOf((exports as any)[key]) === name) return true
			} catch {}
		}
		return false
	},
	([name]) => `dev.ketsuyumi.media-controls.componentName(${name})`,
	FilterScopes.Initialized,
)

/** Discord's own YouBar spacing hooks, when they exist. */
function useYouBarMargins() {
	const [mod] = lookupModule(withProps('useYouBarBottomMargin'))
	const m = mod as Record<string, () => unknown> | undefined
	const num = (fn: unknown, fallback: number) => {
		if (typeof fn !== 'function') return fallback
		const value = (fn as () => unknown)()
		return typeof value === 'number' ? value : fallback
	}
	// Hooks: always called in the same order when the module exists, so this is stable.
	return {
		bottom: num(m?.useYouBarBottomMargin, 12),
		horizontal: num(m?.useYouBarHorizontalMargin, 12),
	}
}

/** Pixels of the card (its handle) left above the bar while tucked away. */
const PEEK = 22
const GAP = 8

export interface DockOptions {
	enabled(): boolean
	tucked(): boolean
	setTucked(tucked: boolean): void
}

/** The grab handle: a small pill, like a bottom sheet's. */
function Handle() {
	return (
		<Animated.View
			style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 10 }}
		>
			<Animated.View
				style={{
					width: 36,
					height: 4,
					borderRadius: 2,
					backgroundColor: 'rgba(255, 255, 255, 0.35)',
				}}
			/>
		</Animated.View>
	)
}

/**
 * The player card above the YouBar. Drag it (or its handle) down to tuck it behind the bar, with
 * only the handle peeking out; drag it up or tap the handle to bring it back.
 */
function Dock({
	bar,
	options,
}: {
	bar: LayoutRectangle | null
	options: DockOptions
}) {
	const { Card } = Design
	const { playback } = useMedia()
	const [height, setHeight] = useState(0)
	const [tucked, setTuckedState] = useState(options.tucked)
	const margins = useYouBarMargins()

	// How far down the card moves when tucked: everything but the handle goes behind the bar.
	const travel = Math.max(height + GAP - PEEK, 0)
	const offset = useRef(new Animated.Value(0)).current
	const travelRef = useRef(travel)
	travelRef.current = travel
	const tuckedRef = useRef(tucked)
	tuckedRef.current = tucked

	const snap = (next: boolean) => {
		tuckedRef.current = next
		setTuckedState(next)
		options.setTucked(next)
		Animated.spring(offset, {
			toValue: next ? travelRef.current : 0,
			useNativeDriver: true,
			bounciness: 4,
		}).start()
	}

	// Keep the resting position right when the card's height changes (new song, measured).
	useEffect(() => {
		offset.setValue(tucked ? travel : 0)
	}, [travel])

	const pan = useRef(
		PanResponder.create({
			// Only claim clearly vertical drags, so buttons and the seek bar keep working.
			onMoveShouldSetPanResponder: (_e, g) =>
				Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
			onPanResponderMove: (_e, g) => {
				const base = tuckedRef.current ? travelRef.current : 0
				offset.setValue(Math.min(Math.max(base + g.dy, 0), travelRef.current))
			},
			onPanResponderRelease: (_e, g) => {
				const base = tuckedRef.current ? travelRef.current : 0
				const position = base + g.dy
				// A flick decides; otherwise whichever side of halfway it ended on.
				const next =
					Math.abs(g.vy) > 0.5 ? g.vy > 0 : position > travelRef.current / 2
				snap(next)
			},
			onPanResponderTerminate: () => snap(tuckedRef.current),
		}),
	).current

	if (!options.enabled() || !playback) return null

	const position = bar
		? { top: bar.y - height - GAP }
		: { bottom: margins.bottom + 64 + GAP }

	return (
		<Animated.View
			{...pan.panHandlers}
			onLayout={(e: any) => setHeight(e.nativeEvent.layout.height)}
			style={{
				position: 'absolute',
				left: bar ? bar.x : margins.horizontal,
				right: bar ? undefined : margins.horizontal,
				width: bar ? bar.width : undefined,
				// Hidden until measured, so it doesn't flash in the wrong place.
				opacity: bar && !height ? 0 : 1,
				transform: [{ translateY: offset }],
				...position,
			}}
		>
			<Card
				variant="secondary"
				border="subtle"
				shadow="medium"
				style={{ paddingTop: 0 }}
			>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={tucked ? 'Show player' : 'Tuck player away'}
					onPress={() => snap(!tucked)}
					hitSlop={12}
				>
					<Handle />
				</Pressable>
				<Player p={playback} />
			</Card>
		</Animated.View>
	)
}

function DockedYouBar({
	rendered,
	options,
}: {
	rendered: any
	options: DockOptions
}) {
	const [bar, setBar] = useState<LayoutRectangle | null>(null)
	// Measure the bar when its root passes onLayout through; otherwise fall back to margins.
	const measured = isValidElement(rendered)
		? cloneElement(rendered as any, {
				onLayout: (e: any) => {
					;(rendered as any).props?.onLayout?.(e)
					setBar(e.nativeEvent.layout)
				},
			})
		: rendered
	// The card comes first so the bar draws over it: tucked, it slides behind the bar.
	return createElement(
		Fragment,
		null,
		createElement(Dock, { bar, options }),
		measured,
	)
}

/** Shows the player above Discord's YouBar. Returns unpatch functions. */
export function patchYouBar(
	options: DockOptions,
	logger: { log(m: string): void; warn(m: string): void },
) {
	const unpatches: (() => void)[] = []
	const patched = new WeakSet<object>()

	const patchComponent = (parent: any, key: string | number) => {
		const value = parent[key]
		// Memo components keep the render function in `type`.
		const [target, prop] =
			typeof value === 'function'
				? [parent, key]
				: typeof value?.type === 'function'
					? [value, 'type']
					: [null, null]
		if (!target || patched.has(target[prop as any])) return
		unpatches.push(
			after(target, prop as never, (rendered: unknown) =>
				createElement(DockedYouBar, { rendered, options }),
			),
		)
		patched.add(target[prop as any])
		logger.log(`Docked player on YouBarThemed (${String(key)})`)
	}

	const unsubscribe = getModules(
		withComponentName('YouBarThemed'),
		(_exports, id) => {
			// Patch the namespace object importers read from.
			const [namespace] = lookupModule(withComponentName('YouBarThemed'), {
				returnNamespace: true,
			}) as unknown as [any]
			const ns = namespace ?? _exports
			if (!ns) return
			if (nameOf(ns) === 'YouBarThemed') {
				logger.warn(
					`YouBarThemed module ${id} exports the component directly; can't dock`,
				)
				return
			}
			for (const key of Object.keys(ns))
				if (nameOf(ns[key]) === 'YouBarThemed') patchComponent(ns, key)
		},
		{ returnNamespace: true },
	)

	return [
		unsubscribe,
		() => {
			for (const u of unpatches.splice(0)) u()
		},
	]
}
