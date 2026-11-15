import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { useEffect, useRef, useState } from 'react'
import {
	ActivityIndicator,
	FlatList,
	Image,
	Pressable,
	useWindowDimensions,
	View,
} from 'react-native'
import { createEmojiCollector, createStickerCollector } from './api'
import type { Collector, Item } from './api'

const PADDING = 16
const GAP = 6

function Tile({
	item,
	size,
	showName,
}: {
	item: Item
	size: number
	showName: boolean
}) {
	const { Text } = Design
	return (
		<Pressable
			onPress={() =>
				ToastActionCreators.open('dm-details-plus', {
					text: `${showName ? item.name : `:${item.name}:`} · sent ${item.count}×`,
				})
			}
			style={{
				width: size,
				height: size,
				borderRadius: 8,
				overflow: 'hidden',
				backgroundColor: 'rgba(255, 255, 255, 0.06)',
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			{item.url ? (
				<Image
					source={{ uri: item.url }}
					resizeMode="contain"
					style={{ width: size * 0.8, height: size * 0.8 }}
				/>
			) : (
				<Text variant="text-xs/medium" style={{ textAlign: 'center' }}>
					{item.name}
				</Text>
			)}
			{item.senderAvatar && size >= 80 ? (
				<Image
					source={{ uri: item.senderAvatar }}
					style={{
						position: 'absolute',
						top: 6,
						right: 6,
						width: 22,
						height: 22,
						borderRadius: 11,
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
}

function CollectorGrid({
	create,
	columns,
	emptyText,
	showName,
}: {
	create: () => Collector
	columns: number
	emptyText: string
	showName: boolean
}) {
	const { Text, Button } = Design
	const collector = useRef<Collector>(null)
	if (!collector.current) collector.current = create()

	const [, setVersion] = useState(0)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string>()
	const busy = useRef(false)
	const { width } = useWindowDimensions()
	const size = Math.floor((width - PADDING * 2 - GAP * (columns - 1)) / columns)

	const load = async () => {
		const c = collector.current!
		if (busy.current || c.done) return
		busy.current = true
		setLoading(true)
		setError(undefined)
		try {
			// Keep going (up to 5 batches) until something new shows up.
			const before = c.items.length
			let batches = 0
			do await c.loadMore()
			while (!c.done && c.items.length === before && ++batches < 5)
		} catch (e: any) {
			setError(e?.body?.message ?? e?.message ?? String(e))
		} finally {
			busy.current = false
			setLoading(false)
			setVersion(v => v + 1)
		}
	}

	useEffect(() => {
		load()
	}, [])

	const c = collector.current
	return (
		<FlatList
			data={c.items}
			key={columns}
			numColumns={columns}
			keyExtractor={item => item.id}
			contentContainerStyle={{ padding: PADDING, gap: GAP }}
			columnWrapperStyle={columns > 1 ? { gap: GAP } : undefined}
			renderItem={({ item }) => (
				<Tile item={item} size={size} showName={showName} />
			)}
			onEndReached={() => load()}
			onEndReachedThreshold={0.5}
			ListEmptyComponent={
				loading ? null : (
					<Text variant="text-md/medium" color="text-muted">
						{error
							? `Couldn't load: ${error}`
							: c.done
								? emptyText
								: 'Nothing found yet. Tap Load more to look further back.'}
					</Text>
				)
			}
			ListFooterComponent={
				<View style={{ paddingVertical: 16, alignItems: 'center', gap: 8 }}>
					{loading ? <ActivityIndicator /> : null}
					{c.progress ? (
						<Text variant="text-xs/medium" color="text-muted">
							{c.progress}
						</Text>
					) : null}
					{!loading && !c.done ? (
						<Button
							text="Load more"
							size="sm"
							variant="secondary"
							onPress={load}
						/>
					) : null}
					{error && c.items.length ? (
						<Text variant="text-xs/medium" color="text-feedback-critical">
							{error}
						</Text>
					) : null}
				</View>
			}
		/>
	)
}

export function StickersPage({ channelId }: { channelId: string }) {
	return (
		<CollectorGrid
			create={() => createStickerCollector(channelId)}
			columns={3}
			showName
			emptyText="No stickers in this conversation yet."
		/>
	)
}

export function EmojiPage({ channelId }: { channelId: string }) {
	return (
		<CollectorGrid
			create={() => createEmojiCollector(channelId)}
			columns={5}
			showName={false}
			emptyText="No custom emoji found in the scanned messages."
		/>
	)
}
