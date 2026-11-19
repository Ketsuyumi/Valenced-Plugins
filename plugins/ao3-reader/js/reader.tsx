import { ToastActionCreators } from '@valenced/discord/actions'
import { Tokens } from '@valenced/discord/common/tokens'
import { Stores } from '@valenced/discord/flux'
import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
	ActivityIndicator,
	FlatList,
	Linking,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	Text,
	View,
} from 'react-native'
import { Ao3Error, fetchWork, type Para, type Work } from './ao3'
import { textColor } from './color'
import {
	flushProgress,
	type Settings,
	save,
	saveProgress,
	settings,
	type ThemeName,
	useSettings,
} from './store'

/** Set right before opening a link ourselves, so the link hook lets it through. */
export const external = { skip: false }
export function openInBrowser(id: string) {
	external.skip = true
	void Linking.openURL(`https://archiveofourown.org/works/${id}`)
	setTimeout(() => (external.skip = false), 1500)
}

function toast(text: string) {
	try {
		ToastActionCreators.open('ao3-reader', { text } as never)
	} catch {}
}

// ── Themes ──────────────────────────────────────────────────────────

function discordColor(names: string[], fallback: string): string {
	try {
		const T = (Tokens as any).default
		const theme = (Stores as any).ThemeStore?.theme
		for (const name of names) {
			const token = T?.colors?.[name]
			if (!token) continue
			const v = T.internal.resolveSemanticColor(theme, token)
			if (typeof v === 'string' && v) return v
		}
	} catch {}
	return fallback
}

interface Theme {
	bg: string
	text: string
	muted: string
	bar: string
}
function themeOf(name: ThemeName): Theme {
	switch (name) {
		case 'light':
			return {
				bg: '#ffffff',
				text: '#1d1d1f',
				muted: '#6e6e73',
				bar: 'rgba(245,245,247,0.97)',
			}
		case 'sepia':
			return {
				bg: '#f4ecd8',
				text: '#4b3a2a',
				muted: '#8a7560',
				bar: 'rgba(236,224,198,0.97)',
			}
		case 'dark':
			return {
				bg: '#1c1c1e',
				text: '#dedede',
				muted: '#8e8e93',
				bar: 'rgba(40,40,42,0.97)',
			}
		case 'black':
			return {
				bg: '#000000',
				text: '#c9c9c9',
				muted: '#7a7a7a',
				bar: 'rgba(18,18,18,0.97)',
			}
		default: {
			const bg = discordColor(
				['BACKGROUND_BASE_LOWER', 'BACKGROUND_PRIMARY', 'BG_BASE_PRIMARY'],
				'#1e1f22',
			)
			return {
				bg,
				text: textColor(),
				muted: discordColor(['TEXT_MUTED'], '#949ba4'),
				bar: discordColor(
					['BACKGROUND_FLOATING', 'BACKGROUND_SECONDARY'],
					'#2b2d31',
				),
			}
		}
	}
}
const THEMES: Array<[ThemeName, string]> = [
	['discord', 'Discord'],
	['light', 'Light'],
	['sepia', 'Sepia'],
	['dark', 'Dark'],
	['black', 'Black'],
]

// ── List items ───────────────────────────────────────────────────────

type Item =
	| { kind: 'head'; key: string }
	| { kind: 'chapter'; key: string; chapter: number; title: string }
	| { kind: 'para'; key: string; chapter: number; para: Para }
	| { kind: 'end'; key: string }

function itemsOf(work: Work): { items: Item[]; chapterAt: number[] } {
	const items: Item[] = [{ kind: 'head', key: 'head' }]
	const chapterAt: number[] = []
	work.chapters.forEach((c, ci) => {
		chapterAt.push(items.length)
		if (work.chapters.length > 1 || ci > 0)
			items.push({
				kind: 'chapter',
				key: `c${ci}`,
				chapter: ci,
				title: c.title,
			})
		c.paras.forEach((para, pi) =>
			items.push({ kind: 'para', key: `p${ci}.${pi}`, chapter: ci, para }),
		)
	})
	items.push({ kind: 'end', key: 'end' })
	return { items, chapterAt }
}

/** Works opened this session, so reopening one doesn't download it again. */
const cache = new Map<string, Work>()

function useTop(): number {
	let top = 0
	try {
		const { useSafeAreaInsets, initialWindowMetrics } =
			ReactNativeSafeAreaContext as any
		top = Math.max(
			useSafeAreaInsets?.()?.top ?? 0,
			initialWindowMetrics?.insets?.top ?? 0,
		)
	} catch {}
	return top > 0 ? top : Platform.OS === 'ios' ? 50 : 28
}

// ── The reader ───────────────────────────────────────────────────────

function Reader({ id, close }: { id: string; close: () => void }) {
	const s = useSettings()
	const top = useTop()
	const theme = themeOf(s.theme)
	const [work, setWork] = useState<Work | undefined>(() => cache.get(id))
	const [error, setError] = useState<string | undefined>()
	const [bars, setBars] = useState(true)
	const [panel, setPanel] = useState<'none' | 'text' | 'chapters'>('none')
	const [where, setWhere] = useState(0)
	const list = useRef<any>(null)
	const restored = useRef(false)

	const load = useCallback(() => {
		setError(undefined)
		fetchWork(id)
			.then(w => {
				cache.set(id, w)
				if (cache.size > 4) cache.delete(cache.keys().next().value as string)
				setWork(w)
			})
			.catch(e =>
				setError(
					e instanceof Ao3Error
						? e.message
						: `Couldn't load it: ${e?.message ?? e}`,
				),
			)
	}, [id])
	useEffect(() => {
		if (!work) load()
		return () => flushProgress()
	}, [])

	const { items, chapterAt } = useMemo(
		() => (work ? itemsOf(work) : { items: [], chapterAt: [] }),
		[work],
	)
	const chapterOf = (index: number) => {
		let c = 0
		for (let i = 0; i < chapterAt.length; i++) if (chapterAt[i] <= index) c = i
		return c
	}

	const jump = (index: number, animated = false) => {
		try {
			list.current?.scrollToIndex({
				index: Math.max(0, Math.min(items.length - 1, index)),
				animated,
				viewPosition: 0,
			})
		} catch {}
	}
	// Back to where you stopped, once the list has its items.
	useEffect(() => {
		if (!work || restored.current) return
		restored.current = true
		const saved = settings().library[id]
		if (saved && saved.index > 2 && saved.total === items.length)
			setTimeout(() => jump(saved.index), 60)
	}, [work])

	const onViewable = useRef(({ viewableItems }: any) => {
		const first = viewableItems?.find((v: any) => v.isViewable)
		if (typeof first?.index === 'number') setWhere(first.index)
	}).current
	useEffect(() => {
		if (!work || !restored.current) return
		saveProgress({
			id,
			title: work.title,
			author: work.author,
			chapters: work.chapters.length,
			index: where,
			total: items.length,
			chapter: chapterOf(where),
			at: Date.now(),
		})
	}, [where, work])

	const fontFamily = s.serif
		? Platform.OS === 'ios'
			? 'Georgia'
			: 'serif'
		: undefined
	const base = {
		color: theme.text,
		fontSize: s.fontSize,
		lineHeight: Math.round(s.fontSize * s.lineSpacing),
		fontFamily,
	}
	const toggleBars = () => {
		if (panel !== 'none') return setPanel('none')
		setBars(b => !b)
	}

	const render = ({ item }: { item: Item }) => {
		if (item.kind === 'head' && work)
			return (
				<View style={{ paddingTop: top + 64, paddingBottom: 18 }}>
					<Text
						style={{
							...base,
							fontSize: s.fontSize + 9,
							lineHeight: Math.round((s.fontSize + 9) * 1.25),
							fontWeight: '700',
						}}
					>
						{work.title}
					</Text>
					<Text
						style={{
							color: theme.muted,
							fontSize: s.fontSize - 2,
							marginTop: 6,
						}}
					>
						by {work.author}
					</Text>
					{work.fandom || work.rating || work.words ? (
						<Text
							style={{
								color: theme.muted,
								fontSize: s.fontSize - 4,
								marginTop: 4,
							}}
						>
							{[
								work.fandom,
								work.rating,
								work.words && `${work.words} words`,
								`${work.chapters.length} ch`,
							]
								.filter(Boolean)
								.join(' · ')}
						</Text>
					) : null}
					{work.summary ? (
						<Text
							style={{
								...base,
								color: theme.muted,
								fontStyle: 'italic',
								fontSize: s.fontSize - 2,
								marginTop: 12,
							}}
						>
							{work.summary}
						</Text>
					) : null}
				</View>
			)
		if (item.kind === 'chapter')
			return (
				<Text
					onPress={toggleBars}
					style={{
						...base,
						fontWeight: '700',
						fontSize: s.fontSize + 4,
						marginTop: 28,
						marginBottom: 16,
						textAlign: 'center',
					}}
				>
					{item.title}
				</Text>
			)
		if (item.kind === 'end')
			return (
				<View style={{ paddingVertical: 48, alignItems: 'center', gap: 12 }}>
					<Text style={{ color: theme.muted, fontSize: s.fontSize - 2 }}>
						— The End —
					</Text>
					<Pressable onPress={() => openInBrowser(id)} hitSlop={8}>
						<Text
							style={{
								color: theme.muted,
								fontSize: s.fontSize - 3,
								textDecorationLine: 'underline',
							}}
						>
							Kudos and comments on AO3
						</Text>
					</Pressable>
				</View>
			)
		if (item.kind !== 'para') return null
		const p = item.para
		if (p.divider)
			return (
				<View
					style={{ alignItems: 'center', marginVertical: s.fontSize * 0.8 }}
				>
					<View
						style={{
							width: '40%',
							height: 1,
							backgroundColor: theme.muted,
							opacity: 0.5,
						}}
					/>
				</View>
			)
		return (
			<Text
				onPress={toggleBars}
				style={{
					...base,
					marginBottom: Math.round(s.fontSize * 0.75),
					textAlign: p.center ? 'center' : s.justify ? 'justify' : 'left',
					fontWeight: p.heading ? '700' : undefined,
				}}
			>
				{p.spans.map((sp, i) => (
					<Text
						key={i}
						style={{
							fontStyle: sp.i ? 'italic' : undefined,
							fontWeight: sp.b ? '700' : undefined,
							textDecorationLine:
								sp.u && sp.s
									? 'underline line-through'
									: sp.u
										? 'underline'
										: sp.s
											? 'line-through'
											: undefined,
						}}
					>
						{sp.t}
					</Text>
				))}
			</Text>
		)
	}

	const chapter = chapterOf(where)
	const percent =
		items.length > 1 ? Math.round((where / (items.length - 1)) * 100) : 0
	const barText = {
		color: theme.text,
		fontSize: 15,
		fontWeight: '600' as const,
	}
	const button = (label: string, onPress: () => void, off?: boolean) => (
		<Pressable
			key={label}
			onPress={onPress}
			disabled={off}
			hitSlop={6}
			accessibilityRole="button"
			accessibilityLabel={label}
			style={{
				paddingHorizontal: 10,
				paddingVertical: 8,
				opacity: off ? 0.35 : 1,
			}}
		>
			<Text style={barText}>{label}</Text>
		</Pressable>
	)

	return (
		<View style={{ flex: 1, backgroundColor: theme.bg }}>
			{work ? (
				<FlatList
					ref={list}
					data={items}
					keyExtractor={(it: Item) => it.key}
					renderItem={render}
					contentContainerStyle={{
						paddingHorizontal: s.margin,
						paddingBottom: 80,
					}}
					initialNumToRender={14}
					maxToRenderPerBatch={12}
					windowSize={9}
					removeClippedSubviews
					onViewableItemsChanged={onViewable}
					viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
					onScrollToIndexFailed={(info: any) => {
						list.current?.scrollToOffset({
							offset: info.averageItemLength * info.index,
							animated: false,
						})
						setTimeout(() => jump(info.index), 120)
					}}
				/>
			) : (
				<View
					style={{
						flex: 1,
						alignItems: 'center',
						justifyContent: 'center',
						padding: 32,
						gap: 16,
					}}
				>
					{error ? (
						<>
							<Text
								style={{ color: theme.text, fontSize: 16, textAlign: 'center' }}
							>
								{error}
							</Text>
							<View style={{ flexDirection: 'row', gap: 8 }}>
								{button('Try again', load)}
								{button('Open in browser', () => openInBrowser(id))}
								{button('Close', close)}
							</View>
						</>
					) : (
						<>
							<ActivityIndicator color={theme.muted} />
							<Text style={{ color: theme.muted }}>Loading from AO3…</Text>
						</>
					)}
				</View>
			)}

			{bars || !work ? (
				<View
					style={{
						position: 'absolute',
						top: 0,
						left: 0,
						right: 0,
						paddingTop: top,
						backgroundColor: theme.bar,
						flexDirection: 'row',
						alignItems: 'center',
						paddingHorizontal: 4,
					}}
				>
					{button('✕', close)}
					<Text numberOfLines={1} style={{ ...barText, flex: 1, fontSize: 14 }}>
						{work?.title ?? 'AO3'}
					</Text>
					{work && work.chapters.length > 1
						? button('☰', () =>
								setPanel(p => (p === 'chapters' ? 'none' : 'chapters')),
							)
						: null}
					{button('Aa', () => setPanel(p => (p === 'text' ? 'none' : 'text')))}
				</View>
			) : null}

			{work && (bars || panel !== 'none') ? (
				<View
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: theme.bar,
						paddingBottom: 18,
					}}
				>
					{panel === 'text' ? <TextPanel s={s} theme={theme} /> : null}
					{panel === 'chapters' ? (
						<ScrollView style={{ maxHeight: 340 }}>
							{work.chapters.map((c, i) => (
								<Pressable
									key={i}
									onPress={() => {
										setPanel('none')
										jump(chapterAt[i])
									}}
									style={{
										paddingHorizontal: 18,
										paddingVertical: 11,
										backgroundColor:
											i === chapter ? 'rgba(127,127,127,0.18)' : undefined,
									}}
								>
									<Text
										numberOfLines={1}
										style={{ color: theme.text, fontSize: 15 }}
									>
										{c.title}
									</Text>
								</Pressable>
							))}
						</ScrollView>
					) : null}
					<View
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							paddingHorizontal: 4,
						}}
					>
						{work.chapters.length > 1
							? button(
									'‹ Prev',
									() => jump(chapterAt[chapter - 1] ?? 0),
									chapter === 0,
								)
							: null}
						<Text
							style={{
								flex: 1,
								textAlign: 'center',
								color: theme.muted,
								fontSize: 13,
							}}
						>
							{work.chapters.length > 1
								? `Ch ${chapter + 1}/${work.chapters.length} · `
								: ''}
							{percent}%
						</Text>
						{work.chapters.length > 1
							? button(
									'Next ›',
									() => jump(chapterAt[chapter + 1] ?? items.length - 1),
									chapter >= work.chapters.length - 1,
								)
							: null}
					</View>
				</View>
			) : null}
		</View>
	)
}

function TextPanel({ s, theme }: { s: Settings; theme: Theme }) {
	const row = (
		label: string,
		value: string,
		minus: () => void,
		plus: () => void,
	) => (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				paddingHorizontal: 18,
				paddingVertical: 4,
			}}
		>
			<Text style={{ flex: 1, color: theme.text, fontSize: 14 }}>{label}</Text>
			<Pressable
				onPress={minus}
				hitSlop={8}
				style={{ paddingHorizontal: 14, paddingVertical: 6 }}
			>
				<Text style={{ color: theme.text, fontSize: 18 }}>−</Text>
			</Pressable>
			<Text
				style={{
					color: theme.muted,
					fontSize: 13,
					minWidth: 44,
					textAlign: 'center',
				}}
			>
				{value}
			</Text>
			<Pressable
				onPress={plus}
				hitSlop={8}
				style={{ paddingHorizontal: 14, paddingVertical: 6 }}
			>
				<Text style={{ color: theme.text, fontSize: 18 }}>+</Text>
			</Pressable>
		</View>
	)
	const clamp = (v: number, lo: number, hi: number) =>
		Math.max(lo, Math.min(hi, Math.round(v * 100) / 100))
	const chip = (label: string, on: boolean, onPress: () => void) => (
		<Pressable
			key={label}
			onPress={onPress}
			style={{
				paddingHorizontal: 12,
				paddingVertical: 7,
				marginRight: 6,
				borderRadius: 14,
				borderWidth: 1,
				borderColor: on ? theme.text : 'rgba(127,127,127,0.35)',
			}}
		>
			<Text
				style={{
					color: theme.text,
					fontSize: 13,
					fontWeight: on ? '700' : '400',
				}}
			>
				{label}
			</Text>
		</Pressable>
	)
	return (
		<View style={{ paddingTop: 10 }}>
			{row(
				'Text size',
				`${s.fontSize}`,
				() => save({ fontSize: clamp(s.fontSize - 1, 12, 32) }),
				() => save({ fontSize: clamp(s.fontSize + 1, 12, 32) }),
			)}
			{row(
				'Line spacing',
				s.lineSpacing.toFixed(2),
				() => save({ lineSpacing: clamp(s.lineSpacing - 0.1, 1.1, 2.4) }),
				() => save({ lineSpacing: clamp(s.lineSpacing + 0.1, 1.1, 2.4) }),
			)}
			{row(
				'Margins',
				`${s.margin}`,
				() => save({ margin: clamp(s.margin - 4, 4, 48) }),
				() => save({ margin: clamp(s.margin + 4, 4, 48) }),
			)}
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ paddingHorizontal: 14, paddingVertical: 6 }}
			>
				{chip('Serif', s.serif, () => save({ serif: true }))}
				{chip('Sans', !s.serif, () => save({ serif: false }))}
				{chip('Justify', s.justify, () => save({ justify: !s.justify }))}
			</ScrollView>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ paddingHorizontal: 14, paddingBottom: 6 }}
			>
				{THEMES.map(([name, label]) =>
					chip(label, s.theme === name, () => save({ theme: name })),
				)}
			</ScrollView>
		</View>
	)
}

// ── Host: a Modal, so it opens over everything from wherever it's mounted ──

let openId: string | undefined
const listeners = new Set<() => void>()
const notify = () => {
	for (const fn of listeners) fn()
}
const hosts: number[] = []
let nextHost = 0

export function closeReader() {
	flushProgress()
	openId = undefined
	notify()
}

export function openReader(id: string): boolean {
	if (!hosts.length) {
		toast('Restart Discord once to finish setting up the AO3 reader')
		return false
	}
	openId = id
	notify()
	return true
}

export function ReaderHost() {
	const [, tick] = useState(0)
	const me = useRef(-1)
	if (me.current === -1) me.current = nextHost++
	useEffect(() => {
		hosts.push(me.current)
		const on = () => tick(n => n + 1)
		listeners.add(on)
		return () => {
			listeners.delete(on)
			const i = hosts.indexOf(me.current)
			if (i !== -1) hosts.splice(i, 1)
		}
	}, [])
	const open = !!openId && hosts[hosts.length - 1] === me.current
	if (!open || !openId) return null
	return (
		<Modal
			visible
			animationType="slide"
			statusBarTranslucent
			onRequestClose={closeReader}
		>
			<Reader key={openId} id={openId} close={closeReader} />
		</Modal>
	)
}
