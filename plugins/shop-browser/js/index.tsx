import { AlertActionCreators } from '@valenced/discord/actions'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { useEffect, useMemo, useState } from 'react'
import {
	ActivityIndicator,
	FlatList,
	Image,
	Linking,
	Pressable,
	ScrollView,
	useWindowDimensions,
	View,
} from 'react-native'
import {
	applyFilters,
	DEFAULT_FILTERS,
	errorText,
	formatPrice,
	loadShop,
	TYPES,
} from './shop'
import type { Filters, Product, Shop } from './shop'

const GAP = 8
const PAD = 12
const ACCENT = '#5865F2'

let cached: Shop | undefined

/** The theme's main text colour. Some colour names (like `text-default`) don't exist on every Discord version, and Text then falls back to black. */
function textColor(): string {
	try {
		const T = (Tokens as any).default
		const theme = (Stores as any).ThemeStore?.theme
		for (const name of ['TEXT_DEFAULT', 'TEXT_NORMAL', 'HEADER_PRIMARY', 'TEXT_PRIMARY']) {
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


function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
	const { Text } = Design as any
	return (
		<Pressable
			onPress={onPress}
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
			<Text variant="text-sm/semibold" style={{ color: on ? '#ffffff' : textColor() }}>
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
		<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: PAD }}>
			{options.map(([v, label]) => (
				<Chip key={v} label={label} on={v === value} onPress={() => onChange(v)} />
			))}
		</ScrollView>
	)
}

function priceLine(p: Product): string {
	const parts = [formatPrice(p.money), p.orbs != null ? `${p.orbs} Orbs` : undefined].filter(Boolean)
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
						{[TYPES[p.type as keyof typeof TYPES] ?? 'Item', p.category].filter(Boolean).join(' · ')}
					</Text>
					{p.summary ? <Text variant="text-md/normal" style={{ color: textColor() }}>{p.summary}</Text> : null}
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
							void Linking.openURL(`https://discord.com/shop#itemSkuId=${p.sku}`).catch(() => {})
						}}
					/>
					<AlertActionButton text="Close" variant="secondary" onPress={close} />
				</>
			}
		/>,
	)
}

function Card({ p, size, owned }: { p: Product; size: number; owned: boolean }) {
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
							Owned
						</Text>
					</View>
				) : null}
			</View>
			<Text variant="text-xs/semibold" numberOfLines={1} style={{ marginTop: 4, color: textColor() }}>
				{p.name}
			</Text>
			<Text variant="text-xxs/medium" color="text-muted" numberOfLines={1}>
				{priceLine(p)}
			</Text>
		</Pressable>
	)
}

function ShopPage() {
	const { Text, TextInput, Button } = Design as any
	const [shop, setShop] = useState<Shop | undefined>(cached)
	const [error, setError] = useState<string>()
	const [f, setF] = useState<Filters>(DEFAULT_FILTERS)
	const { width } = useWindowDimensions()
	const size = Math.floor((width - PAD * 2 - GAP * 2) / 3)

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

	const items = useMemo(() => (shop ? applyFilters(shop, f) : []), [shop, f])
	const set = (patch: Partial<Filters>) => setF(prev => ({ ...prev, ...patch }))

	if (error)
		return (
			<View style={{ padding: 16, gap: 12 }}>
				<Text variant="text-md/semibold" color="text-feedback-critical">
					Couldn't load the shop: {error}
				</Text>
				<Button text="Try again" onPress={load} />
			</View>
		)
	if (!shop)
		return (
			<View style={{ padding: 32, alignItems: 'center' }}>
				<ActivityIndicator />
			</View>
		)

	const header = (
		<View style={{ gap: 8, paddingTop: PAD, paddingBottom: 4 }}>
			<View style={{ paddingHorizontal: PAD }}>
				<TextInput
					placeholder="Search items or categories"
					value={f.query}
					onChange={(query: string) => set({ query })}
					isClearable
				/>
			</View>
			<ChipRow
				options={[
					['all', 'All'],
					['0', 'Decorations'],
					['1', 'Effects'],
					['2', 'Nameplates'],
					['3', 'Frames'],
					['1000', 'Bundles'],
				]}
				value={String(f.type)}
				onChange={v => set({ type: v === 'all' ? 'all' : (Number(v) as Filters['type']) })}
			/>
			<ChipRow
				options={[
					['all', 'Owned or not'],
					['not-owned', 'Not owned'],
					['owned', 'Owned'],
				]}
				value={f.owned}
				onChange={owned => set({ owned })}
			/>
			<ChipRow
				options={[
					['all', 'Any price'],
					['orbs', 'Orbs'],
					['money', 'Paid'],
				]}
				value={f.pay}
				onChange={pay => set({ pay })}
			/>
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
			<ChipRow
				options={[['all', 'All categories'], ...shop.categories.map(c => [c.id, c.name] as [string, string])]}
				value={f.category}
				onChange={category => set({ category })}
			/>
			<View style={{ paddingHorizontal: PAD, flexDirection: 'row', justifyContent: 'space-between' }}>
				<Text variant="text-xs/medium" color="text-muted">
					{items.length} of {shop.products.length} items
				</Text>
				<Pressable onPress={() => setF(DEFAULT_FILTERS)}>
					<Text variant="text-xs/semibold" color="text-link">
						Reset filters
					</Text>
				</Pressable>
			</View>
		</View>
	)

	return (
		<FlatList
			style={{ flex: 1 }}
			data={items}
			keyExtractor={p => p.sku}
			numColumns={3}
			ListHeaderComponent={header}
			columnWrapperStyle={{ gap: GAP, paddingHorizontal: PAD }}
			contentContainerStyle={{ paddingBottom: 32 }}
			keyboardShouldPersistTaps="handled"
			initialNumToRender={18}
			windowSize={7}
			refreshing={false}
			onRefresh={load}
			ListEmptyComponent={
				<Text variant="text-sm/medium" color="text-muted" style={{ padding: PAD }}>
					No items match these filters.
				</Text>
			}
			renderItem={({ item }) => <Card p={item} size={size} owned={shop.owned.has(item.sku)} />}
		/>
	)
}

export default plugin({
	start() {},
	SettingsComponent: ShopPage,
})
