import * as discordFinders from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
import { cloneElement, isValidElement, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { findModule } from './find'
import {
	focus,
	focusedId,
	isMuted,
	isStreamKey,
	keyOf,
	onChange,
	ownerOfKey,
	S,
	save,
	setVolume,
	streams,
	toggleMute,
	useSettings,
	volumeOf,
	watch,
} from './state'

/**
 * Call screen pieces (found by bleelblep for Pronouns, 352.2):
 * - `voice_panel/native/card/VoicePanelCard`: default `memo(VoicePanelCard)`, one per tile.
 * - `voice_panel/native/card/VoicePanelCardFloatingControls`: default `memo(FloatingControls)`,
 *   the name pill and buttons drawn over a tile.
 * Each still runs every render (hooks stay in order); only what it draws is dropped or added to.
 *
 * The call's control bar (mute, camera, hang up…) has no known module, so likely paths are tried,
 * plus any voice_panel "…Controls" module Valenced's path list has, when it shares it.
 */

export const tileStatus = {
	cards: false,
	overlays: false,
	controls: [] as string[],
}

const participantIdOf = (p: any): string | undefined => {
	const id = p?.participant?.id ?? p?.participantId ?? p?.id
	return typeof id === 'string' ? id : undefined
}

function useRedraw() {
	const [, tick] = useState(0)
	useEffect(() => {
		const off = onChange(() => tick(n => n + 1))
		const store = S().MediaEngineStore
		const on = () => tick(n => n + 1)
		store?.addChangeListener?.(on)
		return () => {
			off()
			store?.removeChangeListener?.(on)
		}
	}, [])
}

function Btn({
	label,
	onPress,
	wide,
}: {
	label: string
	onPress: () => void
	wide?: boolean
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={onPress}
			hitSlop={6}
			style={({ pressed }: { pressed: boolean }) => ({
				minWidth: wide ? 52 : 34,
				height: 34,
				paddingHorizontal: 6,
				borderRadius: 17,
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: pressed ? 'rgba(255,255,255,0.25)' : 'transparent',
			})}
		>
			<Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>
				{label}
			</Text>
		</Pressable>
	)
}

/** The bar over the focused stream: switch streams, stream mute and volume, clean view. */
function StreamBar({ streamKey }: { streamKey: string }) {
	useRedraw()
	const s = useSettings()
	const owner = ownerOfKey(streamKey) ?? ''
	const list = streams()
	const at = list.findIndex(st => keyOf(st) === streamKey)
	const go = (step: number) => {
		if (list.length < 2) return
		const next = list[(at + step + list.length) % list.length]
		watch(next)
		setTimeout(() => focus(keyOf(next)), 600)
	}
	const muted = isMuted(owner)
	const vol = volumeOf(owner)
	if (s.clean)
		return (
			<View
				pointerEvents="box-none"
				style={{ position: 'absolute', right: 8, bottom: 8 }}
			>
				<View style={{ borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.45)' }}>
					<Btn label="👁" onPress={() => save({ clean: false })} />
				</View>
			</View>
		)
	return (
		<View
			pointerEvents="box-none"
			style={{
				position: 'absolute',
				left: 0,
				right: 0,
				bottom: 8,
				alignItems: 'center',
			}}
		>
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					paddingHorizontal: 4,
					borderRadius: 20,
					backgroundColor: 'rgba(0,0,0,0.55)',
				}}
			>
				{list.length > 1 ? <Btn label="◀" onPress={() => go(-1)} /> : null}
				<Btn label={muted ? '🔇' : '🔊'} onPress={() => toggleMute(owner)} />
				<Btn label="−" onPress={() => setVolume(owner, vol - 10)} />
				<Btn
					label={`${Math.round(vol)}%`}
					wide
					onPress={() => setVolume(owner, 100)}
				/>
				<Btn label="+" onPress={() => setVolume(owner, vol + 10)} />
				{list.length > 1 ? <Btn label="▶" onPress={() => go(1)} /> : null}
				<Btn label="👁" onPress={() => save({ clean: true })} />
			</View>
		</View>
	)
}

/** While a stream is focused and clean view is on. */
const cleanFor = (s: ReturnType<typeof useSettings>) => {
	const f = focusedId()
	return s.clean && isStreamKey(f) ? f : undefined
}

function addChild(out: any, child: any): any {
	if (!isValidElement(out)) return out
	const kids = (out as any).props?.children
	const list = kids == null ? [] : Array.isArray(kids) ? kids : [kids]
	return cloneElement(out as any, undefined, ...list, child)
}

/** Memo exports keep the function on `.type`; plain ones are the function. */
function hostOf(mod: any, key = 'default'): [any, string] | undefined {
	const v = mod?.[key]
	if (typeof v === 'function') return [mod, key]
	if (v && typeof v === 'object') {
		if (typeof v.type === 'function') return [v, 'type']
		if (typeof v.render === 'function') return [v, 'render']
		if (typeof v.type?.render === 'function') return [v.type, 'render']
	}
	return undefined
}

const CONTROL_GUESSES = [
	'modules/voice_panel/native/controls/VoicePanelControls.tsx',
	'modules/voice_panel/native/controls/VoicePanelControlsBar.tsx',
	'modules/voice_panel/native/controls/VoicePanelBottomControls.tsx',
	'modules/voice_panel/native/controls/VoicePanelControlTray.tsx',
	'modules/voice_panel/native/controls/VoicePanelActionBar.tsx',
	'modules/voice_panel/native/controls/VoicePanelControlsContainer.tsx',
	'modules/voice_panel/native/VoicePanelControls.tsx',
	'modules/voice_panel/native/VoicePanelBottomControls.tsx',
]
const CONTROL_PATH =
	/^modules\/voice_panel\/native\/(controls\/)?(?!.*Floating)[^/]*Controls?[^/]*\.tsx$/

export function patchTiles(): () => void {
	const undo: Array<() => void> = []
	undo.push(
		findModule(
			'modules/voice_panel/native/card/VoicePanelCard.tsx',
			[],
			(mod: any) => {
				const host = hostOf(mod)
				if (!host) return
				tileStatus.cards = true
				undo.push(
					instead(
						host[0],
						host[1],
						function (this: unknown, args: any[], orig: any) {
							const s = useSettings()
							const out = orig.apply(this, args)
							try {
								const id = participantIdOf(args[0])
								const focused = focusedId()
								if (
									s.clean &&
									s.cleanHidesTiles &&
									isStreamKey(focused) &&
									id &&
									id !== focused
								)
									return null
								if (s.showBar && id && id === focused && isStreamKey(id))
									return addChild(
										out,
										<StreamBar key="stream-tools-bar" streamKey={id} />,
									)
							} catch {}
							return out
						},
					),
				)
			},
		),
	)
	undo.push(
		findModule(
			'modules/voice_panel/native/card/VoicePanelCardFloatingControls.tsx',
			[],
			(mod: any) => {
				const host = hostOf(mod)
				if (!host) return
				tileStatus.overlays = true
				undo.push(
					instead(
						host[0],
						host[1],
						function (this: unknown, args: any[], orig: any) {
							const s = useSettings()
							const out = orig.apply(this, args)
							try {
								const f = cleanFor(s)
								if (f && participantIdOf(args[0]) === f) return null
							} catch {}
							return out
						},
					),
				)
			},
		),
	)
	const tried = new Set<string>()
	const controls = (path: string, mod: any) => {
		if (!mod || tried.has(path)) return
		tried.add(path)
		const host = hostOf(mod)
		if (!host) return
		tileStatus.controls.push(path.split('/').pop() ?? path)
		undo.push(
			instead(
				host[0],
				host[1],
				function (this: unknown, args: any[], orig: any) {
					let s: ReturnType<typeof useSettings> | undefined
					try {
						s = useSettings()
					} catch {}
					const out = orig.apply(this, args)
					return s?.cleanHidesControls && cleanFor(s) ? null : out
				},
			),
		)
	}
	const load = (path: string) => {
		try {
			const found = (discordFinders as any).lookupModuleWithImportedPath?.(path)
			const mod = Array.isArray(found) ? found[0] : found
			if (mod) controls(path, mod)
			else
				undo.push(
					(discordFinders as any).getModuleWithImportedPath(path, (m: any) =>
						controls(path, m?.['0'] ?? m),
					),
				)
		} catch {}
	}
	for (const p of CONTROL_GUESSES) load(p)
	const tracker = (globalThis as any).valenced?.discord?.common?.importTracker
	const paths: Map<string, unknown> | undefined = tracker?.mImportedPaths
	if (paths && typeof paths.keys === 'function') {
		for (const p of paths.keys()) if (CONTROL_PATH.test(p)) load(p)
		const watchPath = (_id: unknown, p: string) => {
			if (typeof p === 'string' && CONTROL_PATH.test(p)) load(p)
		}
		tracker.sImportedPath?.add?.(watchPath)
		undo.push(() => tracker.sImportedPath?.delete?.(watchPath))
	}
	return () => {
		for (const u of undo.splice(0))
			try {
				u()
			} catch {}
		tileStatus.cards = false
		tileStatus.overlays = false
		tileStatus.controls = []
	}
}
