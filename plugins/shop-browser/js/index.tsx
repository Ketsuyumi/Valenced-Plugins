import { AlertActionCreators } from '@valenced/discord/actions'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import {
	cloneElement,
	createElement,
	Fragment,
	useEffect,
	useMemo,
	useState,
} from 'react'
import {
	ActivityIndicator,
	FlatList,
	Image,
	Linking,
	Modal,
	Pressable,
	ScrollView,
	useWindowDimensions,
	View,
} from 'react-native'
import { ToastActionCreators } from '@valenced/discord/actions'
import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import { afterJSX } from '@valenced/react/jsx-runtime'
import {
	activeCount,
	allTags,
	applyFilters,
	collabIds,
	DEFAULT_FILTERS,
	errorText,
	formatPrice,
	loadShop,
	SWATCHES,
	TYPES,
} from './shop'
import type { Filters, Product, Shop, Swatch } from './shop'

const GAP = 8
const PAD = 12
const ACCENT = '#5865F2'

let cached: Shop | undefined

/** The theme's main text colour. Some colour names (like `text-default`) don't exist on every Discord version, and Text then falls back to black. */
function textColor(): string {
	try {
		const T = (Tokens as any).default
		const theme = (Stores as any).ThemeStore?.theme
		for (const name of [
			'TEXT_DEFAULT',
			'TEXT_NORMAL',
			'HEADER_PRIMARY',
			'TEXT_PRIMARY',
		]) {
			const token = T?.colors?.[name]
			if (!token) continue
			const value = T.internal.resolveSemanticColor(theme, token)
			if (typeof value === 'string' && value) return value
		}
		return theme === 'light' ? '#060607' : '#f2f3f5'
	} catch {
		return '#f2f3f5'
	}
}

function Chip({
	label,
	on,
	onPress,
	onLongPress,
}: {
	label: string
	on: boolean
	onPress: () => void
	onLongPress?: () => void
}) {
	const { Text } = Design as any
	return (
		<Pressable
			onPress={onPress}
			onLongPress={onLongPress}
			accessibilityRole="button"
			accessibilityState={{ selected: on }}
			style={{
				paddingHorizontal: 12,
				paddingVertical: 6,
				borderRadius: 16,
				marginRight: 6,
				backgroundColor: on ? ACCENT : 'rgba(127,127,127,0.18)',
			}}
		>
			<Text
				variant="text-sm/semibold"
				style={{ color: on ? '#ffffff' : textColor() }}
			>
				{label}
			</Text>
		</Pressable>
	)
}

function ChipRow<T extends string>({
	options,
	value,
	onChange,
}: {
	options: [T, string][]
	value: T
	onChange: (v: T) => void
}) {
	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={{ paddingHorizontal: PAD }}
		>
			{options.map(([v, label]) => (
				<Chip
					key={v}
					label={label}
					on={v === value}
					onPress={() => onChange(v)}
				/>
			))}
		</ScrollView>
	)
}

function priceLine(p: Product): string {
	const parts = [
		formatPrice(p.money),
		p.orbs != null ? `${p.orbs} Orbs` : undefined,
	].filter(Boolean)
	return parts.join(' · ') || '—'
}

function openDetail(p: Product, owned: boolean) {
	const { AlertModal, AlertActionButton, Text, Stack } = Design as any
	const key = `shop-browser-${p.sku}`
	const close = () => (AlertActionCreators as any).dismissAlert(key)
	;(AlertActionCreators as any).openAlert(
		key,
		<AlertModal
			title={p.name}
			content={
				<Stack spacing={10}>
					{p.image ? (
						<Image
							source={{ uri: p.image }}
							resizeMode="contain"
							style={{ width: '100%', height: 160, borderRadius: 12 }}
						/>
					) : null}
					<Text variant="text-sm/medium" color="text-muted">
						{[TYPES[p.type as keyof typeof TYPES] ?? 'Item', p.category]
							.filter(Boolean)
							.join(' · ')}
					</Text>
					{p.summary ? (
						<Text variant="text-md/normal" style={{ color: textColor() }}>
							{p.summary}
						</Text>
					) : null}
					<Text variant="text-md/semibold" style={{ color: textColor() }}>
						{priceLine(p)}
						{p.nitro ? `  (Nitro: ${formatPrice(p.nitro)})` : ''}
					</Text>
					{owned ? (
						<Text variant="text-sm/semibold" color="text-feedback-positive">
							You own this
						</Text>
					) : null}
				</Stack>
			}
			actions={
				<>
					<AlertActionButton
						text="Open in the Shop"
						variant="primary"
						onPress={() => {
							close()
							void Linking.openURL(
								`https://discord.com/shop#itemSkuId=${p.sku}`,
							).catch(() => {})
						}}
					/>
					<AlertActionButton text="Close" variant="secondary" onPress={close} />
				</>
			}
		/>,
	)
}

function Card({
	p,
	size,
	owned,
	compact,
}: {
	p: Product
	size: number
	owned: boolean
	compact?: boolean
}) {
	const { Text } = Design as any
	return (
		<Pressable
			onPress={() => openDetail(p, owned)}
			style={{ width: size, marginBottom: GAP }}
			accessibilityLabel={p.name}
		>
			<View
				style={{
					width: size,
					height: size,
					borderRadius: 12,
					overflow: 'hidden',
					backgroundColor: 'rgba(127,127,127,0.14)',
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				{p.image ? (
					<Image
						source={{ uri: p.image }}
						resizeMode={p.type === 2 ? 'cover' : 'contain'}
						style={{ width: size * 0.9, height: size * 0.9 }}
					/>
				) : (
					<Text variant="text-xs/medium" color="text-muted">
						{TYPES[p.type as keyof typeof TYPES] ?? 'Item'}
					</Text>
				)}
				{owned ? (
					<View
						style={{
							position: 'absolute',
							top: 4,
							right: 4,
							borderRadius: 8,
							paddingHorizontal: 5,
							paddingVertical: 1,
							backgroundColor: '#23A55A',
						}}
					>
						<Text variant="text-xxs/bold" style={{ color: '#ffffff' }}>
							{compact ? '✓' : 'Owned'}
						</Text>
					</View>
				) : null}
			</View>
			<Text
				variant={compact ? 'text-xxs/semibold' : 'text-xs/semibold'}
				numberOfLines={1}
				style={{ marginTop: 4, color: textColor() }}
			>
				{p.name}
			</Text>
			{compact ? null : (
				<Text variant="text-xxs/medium" color="text-muted" numberOfLines={1}>
					{priceLine(p)}
				</Text>
			)}
		</Pressable>
	)
}

interface Settings {
	/** Categories the user marked as collab (true) or not (false), overriding detection. */
	collabMarks: Record<string, boolean>
	/** Grid columns: 3, 4 or 5. */
	columns?: 3 | 4 | 5
	/** Discord's Shop → Shop All opens the browser (older setting). */
	inShop?: boolean
	/** Where it shows in Discord's Shop: in the page, as a pop-up from Shop All, or not at all. */
	shopMode?: 'inline' | 'popup' | 'off'
}
type Storage = {
	use(): Partial<Settings> | undefined
	set(value: Settings, save?: boolean): void
}

function toast(text: string) {
	try {
		ToastActionCreators.open('shop-browser', { text } as never)
	} catch {}
}

/** A tick box row, like the desktop Shop's filter list. */
function Check({
	label,
	on,
	onPress,
}: {
	label: string
	on: boolean
	onPress: () => void
}) {
	const { Text } = Design as any
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="checkbox"
			accessibilityState={{ checked: on }}
			style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7 }}
		>
			<View
				style={{
					width: 20,
					height: 20,
					borderRadius: 5,
					borderWidth: 2,
					borderColor: on ? ACCENT : 'rgba(127,127,127,0.6)',
					backgroundColor: on ? ACCENT : 'transparent',
					alignItems: 'center',
					justifyContent: 'center',
					marginRight: 10,
				}}
			>
				{on ? (
					<Text
						style={{
							color: '#ffffff',
							fontSize: 12,
							lineHeight: 14,
							fontWeight: '800',
						}}
					>
						✓
					</Text>
				) : null}
			</View>
			<Text
				variant="text-sm/semibold"
				style={{ color: textColor(), flexShrink: 1 }}
			>
				{label}
			</Text>
		</Pressable>
	)
}

function Heading({ children }: { children: string }) {
	const { Text } = Design as any
	return (
		<Text
			variant="text-sm/bold"
			style={{ color: textColor(), marginTop: 14, marginBottom: 2 }}
		>
			{children}
		</Text>
	)
}

const toggle = <T,>(list: T[], v: T) =>
	list.includes(v) ? list.filter(x => x !== v) : [...list, v]

/** The filter panel, laid out like the desktop Shop's (Item Type, Show Only, Colour, Theme…). */
function FilterPanel({
	shop,
	f,
	set,
	collabs,
	toggleCollab,
	cols,
	setCols,
	close,
	inline,
}: {
	shop: Shop
	f: Filters
	set: (patch: Partial<Filters>) => void
	collabs: Set<string>
	toggleCollab: (id: string, name: string) => void
	cols: number
	setCols: (n: 3 | 4 | 5) => void
	close: () => void
	/** In the Shop page itself: laid out in the page instead of sliding over it. */
	inline?: boolean
}) {
	const { Text } = Design as any
	const tags = useMemo(() => allTags(shop), [shop])
	const Wrap: any = inline ? View : ScrollView
	const wrapProps = inline
		? { style: { padding: 12 } }
		: { contentContainerStyle: { padding: 14, paddingBottom: 60 } }
	return (
		<View
			style={
				inline
					? {
							borderRadius: 12,
							marginBottom: 8,
							backgroundColor: 'rgba(127,127,127,0.10)',
						}
					: {
							position: 'absolute',
							top: 0,
							right: 0,
							bottom: 0,
							width: '74%',
							maxWidth: 360,
							backgroundColor: panelColor(),
							borderLeftWidth: 1,
							borderColor: 'rgba(127,127,127,0.25)',
							elevation: 20,
							zIndex: 20,
						}
			}
		>
			<Wrap {...wrapProps}>
				<View style={{ flexDirection: 'row', alignItems: 'center' }}>
					<Text
						variant="heading-md/bold"
						style={{ color: textColor(), flex: 1 }}
					>
						Filters
					</Text>
					<Pressable
						onPress={() =>
							set({ ...DEFAULT_FILTERS, query: f.query, sort: f.sort })
						}
						hitSlop={8}
						style={{ marginRight: 14 }}
					>
						<Text variant="text-sm/semibold" color="text-link">
							Reset
						</Text>
					</Pressable>
					<Pressable onPress={close} hitSlop={10}>
						<Text
							style={{ color: textColor(), fontSize: 20, fontWeight: '700' }}
						>
							✕
						</Text>
					</Pressable>
				</View>

				<Heading>Item Type</Heading>
				{(
					[
						[0, 'Avatar Decorations'],
						[2, 'Nameplates'],
						[1, 'Profile Effects'],
						[3, 'Profile Frames'],
						[1000, 'Bundles'],
					] as [number, string][]
				).map(([t, label]) => (
					<Check
						key={t}
						label={label}
						on={f.types.includes(t)}
						onPress={() => set({ types: toggle(f.types, t) })}
					/>
				))}

				<Heading>Show Only</Heading>
				<Check
					label="Orbs Eligible"
					on={f.pay === 'orbs'}
					onPress={() => set({ pay: f.pay === 'orbs' ? 'all' : 'orbs' })}
				/>
				<Check
					label="Paid with money"
					on={f.pay === 'money'}
					onPress={() => set({ pay: f.pay === 'money' ? 'all' : 'money' })}
				/>
				<Check
					label="Collabs"
					on={f.collab === 'collab'}
					onPress={() =>
						set({ collab: f.collab === 'collab' ? 'all' : 'collab' })
					}
				/>
				<Check
					label="Non-collab"
					on={f.collab === 'non-collab'}
					onPress={() =>
						set({ collab: f.collab === 'non-collab' ? 'all' : 'non-collab' })
					}
				/>
				<Check
					label="Owned"
					on={f.owned === 'owned'}
					onPress={() => set({ owned: f.owned === 'owned' ? 'all' : 'owned' })}
				/>
				<Check
					label="Not owned"
					on={f.owned === 'not-owned'}
					onPress={() =>
						set({ owned: f.owned === 'not-owned' ? 'all' : 'not-owned' })
					}
				/>

				<Heading>Colour</Heading>
				<View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
					{(Object.entries(SWATCHES) as [Swatch, string][]).map(
						([name, hex]) => {
							const on = f.swatches.includes(name)
							return (
								<Pressable
									key={name}
									accessibilityRole="checkbox"
									accessibilityLabel={name}
									accessibilityState={{ checked: on }}
									onPress={() => set({ swatches: toggle(f.swatches, name) })}
									style={{
										width: 34,
										height: 34,
										borderRadius: 17,
										margin: 4,
										backgroundColor: hex,
										borderWidth: on ? 3 : 1,
										borderColor: on ? ACCENT : 'rgba(127,127,127,0.5)',
										alignItems: 'center',
										justifyContent: 'center',
									}}
								>
									{on ? (
										<Text
											style={{
												color:
													name === 'white' || name === 'yellow'
														? '#000'
														: '#fff',
												fontWeight: '800',
											}}
										>
											✓
										</Text>
									) : null}
								</Pressable>
							)
						},
					)}
				</View>

				{tags.length ? (
					<>
						<Heading>Theme</Heading>
						<View
							style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}
						>
							{tags.map(t => (
								<View key={t} style={{ marginBottom: 6 }}>
									<Chip
										label={t}
										on={f.tags.includes(t)}
										onPress={() => set({ tags: toggle(f.tags, t) })}
									/>
								</View>
							))}
						</View>
					</>
				) : null}

				<Heading>Category</Heading>
				<Text variant="text-xxs/medium" color="text-muted">
					🤝 = collab. Long-press a category to mark or unmark it.
				</Text>
				<View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
					<View style={{ marginBottom: 6 }}>
						<Chip
							label="All"
							on={f.category === 'all'}
							onPress={() => set({ category: 'all' })}
						/>
					</View>
					{shop.categories.map(c => (
						<View key={c.id} style={{ marginBottom: 6 }}>
							<Chip
								label={`${collabs.has(c.id) ? '🤝 ' : ''}${c.name}`}
								on={f.category === c.id}
								onPress={() =>
									set({ category: f.category === c.id ? 'all' : c.id })
								}
								onLongPress={() => toggleCollab(c.id, c.name)}
							/>
						</View>
					))}
				</View>

				<Heading>Grid</Heading>
				<View style={{ flexDirection: 'row', marginTop: 4 }}>
					{([3, 4, 5] as const).map(n => (
						<Chip
							key={n}
							label={`${n} × ${n}`}
							on={cols === n}
							onPress={() => setCols(n)}
						/>
					))}
				</View>
			</Wrap>
		</View>
	)
}

/** The sheet / panel colour of the theme. */
function panelColor(): string {
	try {
		const T = (Tokens as any).default
		const theme = (Stores as any).ThemeStore?.theme
		for (const name of [
			'BACKGROUND_FLOATING',
			'BACKGROUND_SECONDARY',
			'BG_SURFACE_OVERLAY',
		]) {
			const token = T?.colors?.[name]
			if (!token) continue
			const v = T.internal.resolveSemanticColor(theme, token)
			if (typeof v === 'string' && v) return v
		}
	} catch {}
	return '#2b2d31'
}

let storage: Storage | undefined

function ShopPage({ onClose }: { onClose?: () => void }) {
	const stored = storage?.use()
	const marks = stored?.collabMarks ?? {}
	const { Text, TextInput, Button } = Design as any
	const [shop, setShop] = useState<Shop | undefined>(cached)
	const [error, setError] = useState<string>()
	const [f, setF] = useState<Filters>(DEFAULT_FILTERS)
	const [panel, setPanel] = useState(false)
	const { width } = useWindowDimensions()
	const cols = stored?.columns ?? 3
	const size = Math.floor((width - PAD * 2 - GAP * (cols - 1)) / cols)
	const save = (patch: Partial<Settings>) =>
		storage?.set({ collabMarks: marks, ...stored, ...patch } as Settings, true)

	const load = () => {
		setError(undefined)
		loadShop()
			.then(s => {
				cached = s
				setShop(s)
			})
			.catch(e => setError(errorText(e)))
	}
	useEffect(() => {
		if (!cached) load()
	}, [])

	const items = useMemo(
		() => (shop ? applyFilters(shop, f, marks) : []),
		[shop, f, marks],
	)
	const collabs = useMemo(
		() => (shop ? collabIds(shop, marks) : new Set<string>()),
		[shop, marks],
	)
	const toggleCollab = (id: string, name: string) => {
		const now = !collabs.has(id)
		save({ collabMarks: { ...marks, [id]: now } })
		toast(now ? `${name} marked as a collab` : `${name} marked as not a collab`)
	}
	const set = (patch: Partial<Filters>) => setF(prev => ({ ...prev, ...patch }))
	const active = activeCount(f)

	const top = (
		<View style={{ paddingTop: 8, paddingBottom: 6, gap: 8 }}>
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					paddingHorizontal: PAD,
					gap: 8,
				}}
			>
				{onClose ? (
					<Pressable
						onPress={onClose}
						hitSlop={10}
						accessibilityLabel="Close"
						style={{ paddingRight: 4 }}
					>
						<Text
							style={{ color: textColor(), fontSize: 22, fontWeight: '700' }}
						>
							✕
						</Text>
					</Pressable>
				) : null}
				<View style={{ flex: 1 }}>
					<TextInput
						placeholder="Search the Shop"
						value={f.query}
						onChange={(query: string) => set({ query })}
						isClearable
					/>
				</View>
				<Pressable
					onPress={() => setPanel(p => !p)}
					accessibilityLabel="Filters"
					style={{
						paddingHorizontal: 12,
						height: 40,
						borderRadius: 10,
						justifyContent: 'center',
						backgroundColor:
							panel || active ? ACCENT : 'rgba(127,127,127,0.18)',
					}}
				>
					<Text
						variant="text-sm/semibold"
						style={{ color: panel || active ? '#ffffff' : textColor() }}
					>
						{panel ? 'Hide Filters' : `Filters${active ? ` · ${active}` : ''}`}
					</Text>
				</Pressable>
			</View>
			<ChipRow
				options={[
					['shop', 'Shop order'],
					['cheap', 'Cheapest'],
					['pricey', 'Priciest'],
					['name', 'A–Z'],
				]}
				value={f.sort}
				onChange={sort => set({ sort })}
			/>
			{shop ? (
				<Text
					variant="text-xs/medium"
					color="text-muted"
					style={{ paddingHorizontal: PAD }}
				>
					{items.length} of {shop.products.length} items
				</Text>
			) : null}
		</View>
	)

	return (
		<View style={{ flex: 1 }}>
			{top}
			{error ? (
				<View style={{ padding: 16, gap: 12 }}>
					<Text variant="text-md/semibold" color="text-feedback-critical">
						Couldn't load the shop: {error}
					</Text>
					<Button text="Try again" onPress={load} />
				</View>
			) : !shop ? (
				<View style={{ padding: 32, alignItems: 'center' }}>
					<ActivityIndicator />
				</View>
			) : (
				<FlatList
					style={{ flex: 1 }}
					data={items}
					keyExtractor={p => p.sku}
					key={`cols-${cols}`}
					numColumns={cols}
					columnWrapperStyle={{ gap: GAP, paddingHorizontal: PAD }}
					contentContainerStyle={{ paddingBottom: 32, paddingTop: 4 }}
					keyboardShouldPersistTaps="handled"
					initialNumToRender={18}
					windowSize={7}
					refreshing={false}
					onRefresh={load}
					ListEmptyComponent={
						<Text
							variant="text-sm/medium"
							color="text-muted"
							style={{ padding: PAD }}
						>
							No items match these filters.
						</Text>
					}
					renderItem={({ item }) => (
						<Card
							p={item}
							size={size}
							owned={shop.owned.has(item.sku)}
							compact={cols >= 5}
						/>
					)}
				/>
			)}
			{panel && shop ? (
				<FilterPanel
					shop={shop}
					f={f}
					set={set}
					collabs={collabs}
					toggleCollab={toggleCollab}
					cols={cols}
					setCols={n => save({ columns: n })}
					close={() => setPanel(false)}
				/>
			) : null}
		</View>
	)
}

// ── In Discord's own Shop ────────────────────────────────────────────────────

const PAGE = 30

/**
 * The browser inside the Shop page itself, where Discord's "Shop All" button was: search, sort,
 * the desktop-style filters (opened in place) and the grid, scrolling with the rest of the Shop.
 * The Shop page is already a scrolling list, so the grid isn't one: it shows 30 items, then more.
 */
function InlineShop({ discordList }: { discordList?: () => void }) {
	const stored = storage?.use()
	const marks = stored?.collabMarks ?? {}
	const { Text, TextInput, Button } = Design as any
	const [shop, setShop] = useState<Shop | undefined>(cached)
	const [error, setError] = useState<string>()
	const [f, setF] = useState<Filters>(DEFAULT_FILTERS)
	const [filters, setFilters] = useState(false)
	const [shown, setShown] = useState(PAGE)
	const [width, setWidth] = useState(0)
	const cols = stored?.columns ?? 3
	const size = width ? Math.floor((width - GAP * (cols - 1)) / cols) : 0
	const save = (patch: Partial<Settings>) =>
		storage?.set({ collabMarks: marks, ...stored, ...patch } as Settings, true)
	const load = () => {
		setError(undefined)
		loadShop()
			.then(s => {
				cached = s
				setShop(s)
			})
			.catch(e => setError(errorText(e)))
	}
	useEffect(() => {
		if (!cached) load()
	}, [])
	useEffect(() => setShown(PAGE), [f])
	const items = useMemo(
		() => (shop ? applyFilters(shop, f, marks) : []),
		[shop, f, marks],
	)
	const collabs = useMemo(
		() => (shop ? collabIds(shop, marks) : new Set<string>()),
		[shop, marks],
	)
	const toggleCollab = (id: string, name: string) => {
		const now = !collabs.has(id)
		save({ collabMarks: { ...marks, [id]: now } })
		toast(now ? `${name} marked as a collab` : `${name} marked as not a collab`)
	}
	const set = (patch: Partial<Filters>) => setF(prev => ({ ...prev, ...patch }))
	const active = activeCount(f)
	return (
		<View
			style={{ marginTop: 8, marginBottom: 16 }}
			onLayout={(e: any) =>
				setWidth(Math.floor(e?.nativeEvent?.layout?.width ?? 0))
			}
		>
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					gap: 8,
					marginBottom: 8,
				}}
			>
				<View style={{ flex: 1 }}>
					<TextInput
						placeholder="Search the Shop"
						value={f.query}
						onChange={(query: string) => set({ query })}
						isClearable
					/>
				</View>
				<Pressable
					onPress={() => setFilters(v => !v)}
					accessibilityLabel="Filters"
					style={{
						paddingHorizontal: 12,
						height: 40,
						borderRadius: 10,
						justifyContent: 'center',
						backgroundColor:
							filters || active ? ACCENT : 'rgba(127,127,127,0.18)',
					}}
				>
					<Text
						variant="text-sm/semibold"
						style={{ color: filters || active ? '#ffffff' : textColor() }}
					>
						{filters
							? 'Hide Filters'
							: `Filters${active ? ` · ${active}` : ''}`}
					</Text>
				</Pressable>
			</View>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ marginBottom: 8 }}
			>
				{(
					[
						['shop', 'Recently Added'],
						['cheap', 'Cheapest'],
						['pricey', 'Priciest'],
						['name', 'A–Z'],
					] as [Filters['sort'], string][]
				).map(([v, label]) => (
					<Chip
						key={v}
						label={label}
						on={f.sort === v}
						onPress={() => set({ sort: v })}
					/>
				))}
			</ScrollView>
			{filters && shop ? (
				<FilterPanel
					inline
					shop={shop}
					f={f}
					set={set}
					collabs={collabs}
					toggleCollab={toggleCollab}
					cols={cols}
					setCols={n => save({ columns: n })}
					close={() => setFilters(false)}
				/>
			) : null}
			{error ? (
				<View style={{ gap: 8 }}>
					<Text variant="text-sm/semibold" color="text-feedback-critical">
						Couldn't load the shop: {error}
					</Text>
					<Button text="Try again" onPress={load} />
				</View>
			) : !shop || !size ? (
				<View style={{ padding: 24, alignItems: 'center' }}>
					<ActivityIndicator />
				</View>
			) : (
				<>
					<Text
						variant="text-xs/medium"
						color="text-muted"
						style={{ marginBottom: 6 }}
					>
						{items.length} of {shop.products.length} items
					</Text>
					<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
						{items.slice(0, shown).map(p => (
							<Card
								key={p.sku}
								p={p}
								size={size}
								owned={shop.owned.has(p.sku)}
								compact={cols >= 5}
							/>
						))}
					</View>
					{!items.length ? (
						<Text variant="text-sm/medium" color="text-muted">
							No items match these filters.
						</Text>
					) : null}
					{items.length > shown ? (
						<View style={{ marginTop: 4 }}>
							<Button
								text={`Show more (${items.length - shown} left)`}
								variant="secondary"
								onPress={() => setShown(n => n + PAGE * 2)}
							/>
						</View>
					) : null}
					{discordList ? (
						<Pressable
							onPress={discordList}
							style={{ marginTop: 10, alignSelf: 'center' }}
							hitSlop={8}
						>
							<Text variant="text-xs/semibold" color="text-muted">
								Discord's own list
							</Text>
						</Pressable>
					) : null}
				</>
			)}
		</View>
	)
}

// ── Or: "Shop All" opens this browser over the shop ──────────────────────────

let browsing = false
const browseListeners = new Set<() => void>()
function setBrowsing(on: boolean) {
	browsing = on
	for (const l of browseListeners) l()
}

/** Rendered next to the Shop's button: a full-screen Modal while browsing. */
function BrowseHost() {
	const [, tick] = useState(0)
	useEffect(() => {
		const l = () => tick(n => n + 1)
		browseListeners.add(l)
		return () => {
			browseListeners.delete(l)
		}
	}, [])
	if (!browsing) return null
	return (
		<Modal
			visible
			animationType="slide"
			onRequestClose={() => setBrowsing(false)}
			statusBarTranslucent
		>
			<View
				style={{
					flex: 1,
					paddingTop: topInset(),
					backgroundColor: pageColor(),
				}}
			>
				<ShopPage onClose={() => setBrowsing(false)} />
			</View>
		</Modal>
	)
}

function pageColor(): string {
	try {
		const T = (Tokens as any).default
		const theme = (Stores as any).ThemeStore?.theme
		for (const name of ['BACKGROUND_BASE_LOWER', 'BACKGROUND_PRIMARY']) {
			const token = T?.colors?.[name]
			if (!token) continue
			const v = T.internal.resolveSemanticColor(theme, token)
			if (typeof v === 'string' && v) return v
		}
	} catch {}
	return '#1e1f22'
}

function topInset(): number {
	try {
		const top = (ReactNativeSafeAreaContext as any)?.initialWindowMetrics
			?.insets?.top
		if (typeof top === 'number' && top > 0) return top
	} catch {}
	return 40
}

const SHOP_ALL = /^(shop all|browse all|see all)$/i
const textIn = (v: unknown, depth = 0): string => {
	if (depth > 4 || v == null || typeof v === 'boolean') return ''
	if (typeof v === 'string' || typeof v === 'number') return String(v)
	if (Array.isArray(v)) return v.map(x => textIn(x, depth + 1)).join('')
	if (typeof v === 'object')
		return textIn((v as any).props?.children, depth + 1)
	return ''
}

export const shopStatus = { hooked: false }

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: { collabMarks: {}, columns: 3, inShop: true },
	},
	start({ cleanup, jsonStorage }) {
		storage = jsonStorage as unknown as Storage
		const B = (Design as any).Button
		if (B) {
			shopStatus.hooked = true
			cleanup(
				afterJSX(B, (el: any) => {
					const st = (storage as any)?.cache ?? {}
					const mode: 'inline' | 'popup' | 'off' =
						st.shopMode ?? (st.inShop === false ? 'off' : 'inline')
					if (mode === 'off') return el
					const label = textIn(el?.props?.text ?? el?.props?.children).trim()
					if (!SHOP_ALL.test(label)) return el
					if (mode === 'inline')
						return createElement(InlineShop, {
							key: el?.key ?? 'shop-browser-inline',
							discordList: el?.props?.onPress,
						})
					return createElement(
						Fragment,
						{ key: el?.key ?? 'shop-browser' },
						cloneElement(el, { onPress: () => setBrowsing(true) }),
						createElement(BrowseHost, { key: 'shop-browser-host' }),
					)
				}) as any,
			)
		}
		cleanup(() => {
			setBrowsing(false)
			storage = undefined
		})
	},
	SettingsComponent: () => <SettingsPage />,
})

function SettingsPage() {
	const stored = storage?.use() as any
	const { TableRowGroup, TableSwitchRow } = Design as any
	return (
		<View style={{ flex: 1 }}>
			<View style={{ paddingHorizontal: PAD, paddingTop: 8 }}>
				<TableRowGroup>
					{(
						[
							[
								'inline',
								'In the Shop',
								"Right in Discord's Shop page, under Find your style (in place of Shop All)",
							],
							[
								'popup',
								'Pop-up from Shop All',
								"Discord's Shop → Shop All opens it full screen",
							],
							['off', 'Only here', "Leave Discord's Shop as it is"],
						] as const
					).map(([mode, label, sub]) => {
						const current =
							stored?.shopMode ?? (stored?.inShop === false ? 'off' : 'inline')
						return (
							<TableSwitchRow
								key={mode}
								label={label}
								subLabel={sub}
								value={current === mode}
								onValueChange={(on: boolean) =>
									on &&
									storage?.set(
										{ collabMarks: {}, ...stored, shopMode: mode } as Settings,
										true,
									)
								}
							/>
						)
					})}
				</TableRowGroup>
			</View>
			<ShopPage />
		</View>
	)
}
