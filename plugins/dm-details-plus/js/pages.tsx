import {
	AlertActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { memo, useEffect, useReducer } from 'react'
import {
	ActivityIndicator,
	FlatList,
	Image,
	Linking,
	Pressable,
	useWindowDimensions,
	View,
} from 'react-native'
import { getCollector } from './api'
import type { Item, Kind } from './api'

const PADDING = 12
const GAP = 4

const EMPTY: Record<Kind, string> = {
	stickers: 'No stickers in this conversation yet.',
	emoji: 'No custom emoji found in the scanned messages.',
	pins: 'No pinned messages.',
	links: 'No links in this conversation yet.',
}

function openItem(kind: Kind, item: Item) {
	if (kind === 'links' && item.href) {
		Linking.openURL(item.href).catch(() => {})
		return
	}
	if (kind === 'pins') {
		const { AlertModal, AlertActionButton } = Design
		AlertActionCreators.openAlert(
			'dm-details-plus-pin',
			<AlertModal
				title={item.title}
				content={item.body || item.subtitle}
				actions={<AlertActionButton text="Close" variant="secondary" />}
			/>,
		)
		return
	}
	ToastActionCreators.open('dm-details-plus', {
		text: `${item.title} · sent ${item.count}×`,
	})
}

const Tile = memo(function Tile({
	kind,
	item,
	size,
}: {
	kind: Kind
	item: Item
	size: number
}) {
	const { Text } = Design
	const compact = kind === 'stickers' || kind === 'emoji'

	return (
		<Pressable
			onPress={() => openItem(kind, item)}
			style={{
				width: size,
				height: size,
				borderRadius: 6,
				overflow: 'hidden',
				backgroundColor: 'rgba(255, 255, 255, 0.06)',
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			{item.image ? (
				<Image
					source={{ uri: item.image }}
					resizeMode={compact ? 'contain' : 'cover'}
					fadeDuration={0}
					style={
						compact
							? { width: size * 0.8, height: size * 0.8 }
							: { width: size, height: size }
					}
				/>
			) : (
				<View style={{ padding: 8, width: size, gap: 2 }}>
					<Text variant="text-xs/bold" lineClamp={2}>
						{item.title}
					</Text>
					{item.subtitle ? (
						<Text
							variant="text-xxs/medium"
							color="text-muted"
							lineClamp={compact ? 2 : 5}
						>
							{item.subtitle}
						</Text>
					) : null}
				</View>
			)}
			{item.senderAvatar && size >= 80 ? (
				<Image
					source={{ uri: item.senderAvatar }}
					fadeDuration={0}
					style={{
						position: 'absolute',
						top: 5,
						right: 5,
						width: 20,
						height: 20,
						borderRadius: 10,
					}}
				/>
			) : null}
			{item.count > 1 ? (
				<View
					style={{
						position: 'absolute',
						bottom: 4,
						right: 4,
						paddingHorizontal: 5,
						borderRadius: 8,
						backgroundColor: 'rgba(0, 0, 0, 0.6)',
					}}
				>
					<Text variant="text-xxs/bold" color="white">
						×{item.count}
					</Text>
				</View>
			) : null}
		</Pressable>
	)
})

export function GridPage({
	kind,
	channelId,
}: {
	kind: Kind
	channelId: string
}) {
	const { Text, Button } = Design
	const collector = getCollector(kind, channelId)
	const [, rerender] = useReducer((n: number) => n + 1, 0)
	const { width } = useWindowDimensions()

	const columns = kind === 'emoji' ? 5 : 3
	const size = Math.floor((width - PADDING * 2 - GAP * (columns - 1)) / columns)

	useEffect(() => {
		const unsubscribe = collector.subscribe(rerender)
		collector.prefetch()
		return unsubscribe
	}, [collector])

	const c = collector
	return (
		<FlatList
			data={c.items}
			numColumns={columns}
			keyExtractor={item => item.key}
			contentContainerStyle={{ padding: PADDING, gap: GAP }}
			columnWrapperStyle={{ gap: GAP }}
			renderItem={({ item }) => <Tile kind={kind} item={item} size={size} />}
			initialNumToRender={columns * 6}
			maxToRenderPerBatch={columns * 6}
			windowSize={7}
			removeClippedSubviews
			onEndReached={() => c.loadMore()}
			onEndReachedThreshold={1}
			refreshing={false}
			onRefresh={() => c.refresh()}
			ListEmptyComponent={
				c.loading ? null : (
					<Text variant="text-md/medium" color="text-muted">
						{c.error
							? `Couldn't load: ${c.error}`
							: c.done
								? EMPTY[kind]
								: 'Nothing found yet. Tap Load more to look further back.'}
					</Text>
				)
			}
			ListFooterComponent={
				<View style={{ paddingVertical: 16, alignItems: 'center', gap: 8 }}>
					{c.loading ? <ActivityIndicator /> : null}
					{c.progress ? (
						<Text variant="text-xs/medium" color="text-muted">
							{c.progress}
						</Text>
					) : null}
					{!c.loading && !c.done ? (
						<Button
							text="Load more"
							size="sm"
							variant="secondary"
							onPress={() => c.loadMore()}
						/>
					) : null}
					{c.error && c.items.length ? (
						<Text variant="text-xs/medium" color="text-feedback-critical">
							{c.error}
						</Text>
					) : null}
				</View>
			}
		/>
	)
}
