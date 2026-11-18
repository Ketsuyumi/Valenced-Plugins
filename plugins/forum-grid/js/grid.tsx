import { ToastActionCreators } from '@valenced/discord/actions'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { after } from '@valenced/patcher'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
	ActivityIndicator,
	BackHandler,
	FlatList,
	Image,
	Pressable,
	ScrollView,
	useWindowDimensions,
	View,
} from 'react-native'
import {
	applyFilters,
	DEFAULT_FILTERS,
	errorText,
	forumTags,
	isUnread,
	markRead,
	openPost,
	searchPosts,
	serverSort,
} from './data'
import { findModule } from './find'
import type { Filters, PinnedMode, Post, Tag } from './data'

export interface GridSettings {
	columns: Columns
	pinned: PinnedMode
}
export type Columns = 2 | 3 | 4 | 5
const NEXT: Record<Columns, Columns> = { 2: 3, 3: 4, 4: 5, 5: 2 }
let readSettings: () => GridSettings = () => ({ columns: 2, pinned: 'first' })
let writeSettings: (patch: Partial<GridSettings>) => void = () => {}

// Which forum the grid shows; null when closed.
let forum: { id: string; name: string } | null = null
const listeners = new Set<() => void>()
const emit = () => {
	for (const l of listeners) l()
}
export const isGridOpen = () => !!forum
export function showGrid(channel: { id: string; name?: string }) {
	forum = { id: String(channel.id), name: String(channel.name ?? 'forum') }
	emit()
}
export function hideGrid() {
	forum = null
	emit()
}

let mounted = false
export const gridAvailable = () => mounted

function toast(text: string) {
	try {
		ToastActionCreators.open('forum-grid', { text } as never)
	} catch {}
}

function color(name: string, fallback: string): string {
	try {
		const T = (Tokens as any).default
		const theme = (Stores as any).ThemeStore?.theme
		return T.internal.resolveSemanticColor(theme, T.colors[name]) ?? fallback
	} catch {
		return fallback
	}
}

const ACCENT = '#5865F2'

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
}: {
	label: string
	on: boolean
	onPress: () => void
}) {
	const { Text } = Design as any
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityState={{ selected: on }}
			style={{
				paddingHorizontal: 11,
				paddingVertical: 5,
				borderRadius: 14,
				marginRight: 6,
				backgroundColor: on ? ACCENT : 'rgba(127,127,127,0.18)',
			}}
		>
			<Text
				variant="text-xs/semibold"
				style={{ color: on ? '#ffffff' : textColor() }}
			>
				{label}
			</Text>
		</Pressable>
	)
}

const Row = ({ children }: { children: any }) => (
	<ScrollView
		horizontal
		showsHorizontalScrollIndicator={false}
		contentContainerStyle={{ paddingHorizontal: 12 }}
	>
		{children}
	</ScrollView>
)

const ago = (ms: number) => {
	const m = Math.max(0, Date.now() - ms) / 60000
	if (m < 60) return `${Math.round(m)}m`
	if (m < 1440) return `${Math.round(m / 60)}h`
	if (m < 43200) return `${Math.round(m / 1440)}d`
	return `${Math.round(m / 43200)}mo`
}

function Card({
	post,
	size,
	tags,
	onPress,
	compact,
}: {
	post: Post
	size: number
	tags: Tag[]
	onPress: () => void
	/** 4 and 5 columns: image and title only. */
	compact?: boolean
}) {
	const { Text } = Design as any
	const names = post.tags
		.map(id => tags.find(t => t.id === id))
		.filter(Boolean)
		.map(t => `${t!.emoji ? `${t!.emoji} ` : ''}${t!.name}`)
	const unread = isUnread(post)
	const imgH = Math.round(size * (compact ? 1 : 0.75))
	return (
		<Pressable
			onPress={onPress}
			accessibilityLabel={post.name}
			style={{
				width: size,
				marginBottom: 10,
				borderRadius: 12,
				overflow: 'hidden',
				backgroundColor: color(
					'CARD_BACKGROUND_DEFAULT',
					'rgba(127,127,127,0.12)',
				),
			}}
		>
			{post.image ? (
				<Image
					source={{ uri: post.image }}
					resizeMode="cover"
					style={{ width: size, height: imgH }}
				/>
			) : (
				<View
					style={{
						width: size,
						height: imgH,
						padding: compact ? 4 : 8,
						backgroundColor: 'rgba(127,127,127,0.10)',
					}}
				>
					<Text
						variant={compact ? 'text-xxs/normal' : 'text-xs/normal'}
						color="text-muted"
						numberOfLines={compact ? 4 : 6}
					>
						{post.preview || ' '}
					</Text>
				</View>
			)}
			<View style={{ padding: compact ? 4 : 7, gap: 2 }}>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
					{unread ? (
						<View
							style={{
								width: 7,
								height: 7,
								borderRadius: 4,
								backgroundColor: textColor(),
							}}
						/>
					) : null}
					<Text
						variant={
							compact
								? unread
									? 'text-xxs/bold'
									: 'text-xxs/semibold'
								: unread
									? 'text-sm/bold'
									: 'text-sm/semibold'
						}
						numberOfLines={2}
						style={{ flex: 1, color: textColor() }}
					>
						{post.pinned ? '📌 ' : ''}
						{post.name}
					</Text>
				</View>
				{!compact && names.length ? (
					<Text variant="text-xxs/medium" color="text-muted" numberOfLines={1}>
						{names.join(' · ')}
					</Text>
				) : null}
				{compact ? null : (
					<Text variant="text-xxs/medium" color="text-muted" numberOfLines={1}>
						💬 {post.replies}
						{post.reactions ? `  ❤ ${post.reactions}` : ''}
						{`  · ${ago(post.lastActive)}`}
						{post.followed ? '  · following' : ''}
					</Text>
				)}
			</View>
		</Pressable>
	)
}

function Grid({ id, name }: { id: string; name: string }) {
	const { Text, TextInput } = Design as any
	const [settings, setSettings] = useState(readSettings)
	const [f, setF] = useState<Filters>(DEFAULT_FILTERS)
	const [posts, setPosts] = useState<Post[]>([])
	const [hasMore, setHasMore] = useState(true)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string>()
	const [showFilters, setShowFilters] = useState(false)
	const [, tick] = useState(0)
	const { width } = useWindowDimensions()
	const tags = useMemo(() => forumTags(id), [id])
	const gen = useRef(0)

	const cols = settings.columns
	const gap = cols >= 4 ? 6 : 8
	const size = Math.floor((width - 24 - gap * (cols - 1)) / cols)
	const server = serverSort(f)
	const serverKey = `${server.sort}|${server.order}|${f.query.trim()}|${f.tags.join(',')}`

	const load = async (reset: boolean) => {
		if (loading && !reset) return
		const mine = reset ? ++gen.current : gen.current
		setLoading(true)
		setError(undefined)
		try {
			const page = await searchPosts(id, {
				...server,
				offset: reset ? 0 : posts.length,
				name: f.query,
				tags: f.tags,
			})
			if (mine !== gen.current) return
			setPosts(prev => {
				const base = reset ? [] : prev
				const seen = new Set(base.map(p => p.id))
				return [...base, ...page.posts.filter(p => !seen.has(p.id))]
			})
			setHasMore(page.hasMore)
		} catch (e) {
			if (mine === gen.current) setError(errorText(e))
		} finally {
			if (mine === gen.current) setLoading(false)
		}
	}

	// Reload from the server when its sort, search or tags change (search waits for typing to stop).
	useEffect(() => {
		const t = setTimeout(() => void load(true), f.query ? 450 : 0)
		return () => clearTimeout(t)
	}, [serverKey])

	// Unread dots follow Discord's read states.
	useEffect(() => {
		const store = (Stores as any).ReadStateStore
		const on = () => tick(n => n + 1)
		store?.addChangeListener?.(on)
		return () => store?.removeChangeListener?.(on)
	}, [])

	const shown = useMemo(
		() => applyFilters(posts, f, settings.pinned),
		[posts, f, settings.pinned],
	)
	const set = (patch: Partial<Filters>) => setF(prev => ({ ...prev, ...patch }))
	const setS = (patch: Partial<GridSettings>) => {
		writeSettings(patch)
		setSettings(prev => ({ ...prev, ...patch }))
	}
	const active =
		f.tags.length +
		Number(f.unread) +
		Number(f.followed) +
		Number(f.images) +
		Number(f.mine) +
		Number(f.since !== 'any') +
		Number(f.minReactions > 0)

	const header = (
		<View style={{ gap: 8, paddingBottom: 8 }}>
			<View style={{ paddingHorizontal: 12 }}>
				<TextInput
					placeholder="Search posts"
					value={f.query}
					onChange={(query: string) => set({ query })}
					isClearable
				/>
			</View>
			<Row>
				<Chip
					label={
						showFilters
							? 'Hide filters'
							: `Filters${active ? ` (${active})` : ''}`
					}
					on={showFilters || active > 0}
					onPress={() => setShowFilters(s => !s)}
				/>
				{(
					[
						['active', 'Latest activity'],
						['newest', 'Newest'],
						['oldest', 'Oldest'],
						['replies', 'Most replies'],
						['reactions', 'Most reactions'],
					] as [Filters['sort'], string][]
				).map(([v, label]) => (
					<Chip
						key={v}
						label={label}
						on={f.sort === v}
						onPress={() => set({ sort: v })}
					/>
				))}
			</Row>
			{showFilters ? (
				<>
					{tags.length ? (
						<Row>
							{tags.map(t => (
								<Chip
									key={t.id}
									label={`${t.emoji ? `${t.emoji} ` : ''}${t.name}`}
									on={f.tags.includes(t.id)}
									onPress={() =>
										set({
											tags: f.tags.includes(t.id)
												? f.tags.filter(x => x !== t.id)
												: [...f.tags, t.id],
										})
									}
								/>
							))}
						</Row>
					) : null}
					<Row>
						<Chip
							label="Unread"
							on={f.unread}
							onPress={() => set({ unread: !f.unread })}
						/>
						<Chip
							label="Followed"
							on={f.followed}
							onPress={() => set({ followed: !f.followed })}
						/>
						<Chip
							label="Has image"
							on={f.images}
							onPress={() => set({ images: !f.images })}
						/>
						<Chip
							label="My posts"
							on={f.mine}
							onPress={() => set({ mine: !f.mine })}
						/>
					</Row>
					<Row>
						{(
							[
								['any', 'Any time'],
								['day', 'Today'],
								['week', 'This week'],
								['month', 'This month'],
							] as [Filters['since'], string][]
						).map(([v, label]) => (
							<Chip
								key={v}
								label={label}
								on={f.since === v}
								onPress={() => set({ since: v })}
							/>
						))}
					</Row>
					<Row>
						{[0, 1, 5, 10, 25, 50].map(n => (
							<Chip
								key={n}
								label={n ? `${n}+ reactions` : 'Any reactions'}
								on={f.minReactions === n}
								onPress={() => set({ minReactions: n })}
							/>
						))}
					</Row>
					<Row>
						{(
							[
								['first', 'Pinned first'],
								['normal', 'Pinned in place'],
								['hidden', 'Hide pinned'],
							] as [PinnedMode, string][]
						).map(([v, label]) => (
							<Chip
								key={v}
								label={label}
								on={settings.pinned === v}
								onPress={() => setS({ pinned: v })}
							/>
						))}
					</Row>
					<Row>
						<Chip
							label="Reset filters"
							on={false}
							onPress={() => setF({ ...DEFAULT_FILTERS, sort: f.sort })}
						/>
					</Row>
				</>
			) : null}
			<Text
				variant="text-xxs/medium"
				color="text-muted"
				style={{ paddingHorizontal: 12 }}
			>
				{shown.length} shown · {posts.length} loaded
				{hasMore ? ' · scroll for more' : ''}
			</Text>
		</View>
	)

	return (
		<View style={{ flex: 1 }}>
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					paddingHorizontal: 8,
					paddingVertical: 8,
					gap: 4,
				}}
			>
				<Pressable
					onPress={hideGrid}
					accessibilityLabel="Close grid"
					style={{ padding: 8 }}
				>
					<Text variant="heading-md/bold" style={{ color: textColor() }}>
						✕
					</Text>
				</Pressable>
				<Text
					variant="heading-md/bold"
					numberOfLines={1}
					style={{ flex: 1, color: textColor() }}
				>
					# {name}
				</Text>
				<Pressable
					onPress={() => setS({ columns: NEXT[cols] ?? 2 })}
					accessibilityLabel="Change columns"
					style={{ padding: 8 }}
				>
					<Text variant="text-sm/bold" color="text-link">
						{cols}×{cols}
					</Text>
				</Pressable>
				<Pressable
					accessibilityLabel="Mark all read"
					style={{ padding: 8 }}
					onPress={async () => {
						const unread = posts.filter(isUnread)
						if (!unread.length) return toast('Nothing unread here')
						try {
							const n = await markRead(unread)
							toast(`Marked ${n} post${n === 1 ? '' : 's'} read`)
						} catch (e) {
							toast(`Couldn't mark read: ${errorText(e)}`)
						}
					}}
				>
					<Text variant="text-sm/bold" color="text-link">
						Mark read
					</Text>
				</Pressable>
			</View>
			<FlatList
				key={`cols-${cols}`}
				style={{ flex: 1 }}
				data={shown}
				keyExtractor={p => p.id}
				numColumns={cols}
				ListHeaderComponent={header}
				columnWrapperStyle={{ gap, paddingHorizontal: 12 }}
				contentContainerStyle={{ paddingBottom: 40 }}
				keyboardShouldPersistTaps="handled"
				onEndReachedThreshold={0.6}
				onEndReached={() => {
					if (hasMore && !loading && !error) void load(false)
				}}
				refreshing={false}
				onRefresh={() => void load(true)}
				initialNumToRender={12}
				windowSize={7}
				ListFooterComponent={
					loading ? (
						<ActivityIndicator style={{ margin: 16 }} />
					) : error ? (
						<Pressable
							onPress={() => void load(posts.length === 0)}
							style={{ padding: 16 }}
						>
							<Text variant="text-sm/medium" color="text-feedback-critical">
								{error} · tap to retry
							</Text>
						</Pressable>
					) : null
				}
				ListEmptyComponent={
					!loading && !error ? (
						<Text
							variant="text-sm/medium"
							color="text-muted"
							style={{ padding: 16 }}
						>
							{posts.length
								? 'No posts match these filters.'
								: 'No posts found.'}
						</Text>
					) : null
				}
				renderItem={({ item }) => (
					<Card
						post={item}
						size={size}
						compact={cols >= 4}
						tags={tags}
						onPress={() => {
							hideGrid()
							if (!openPost(item)) toast("Couldn't open the post")
						}}
					/>
				)}
			/>
		</View>
	)
}

function Overlay() {
	const [, tick] = useState(0)
	useEffect(() => {
		mounted = true
		const on = () => tick(n => n + 1)
		listeners.add(on)
		return () => {
			listeners.delete(on)
			mounted = false
		}
	}, [])
	useEffect(() => {
		if (!forum) return
		const sub = BackHandler.addEventListener('hardwareBackPress', () => {
			hideGrid()
			return true
		})
		return () => sub.remove()
	}, [forum?.id])
	if (!forum) return null
	return (
		<View
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				paddingTop: 36,
				backgroundColor: color('BACKGROUND_BASE_LOWER', '#1e1f22'),
				zIndex: 1000,
				elevation: 1000,
			}}
		>
			<Grid key={forum.id} id={forum.id} name={forum.name} />
		</View>
	)
}

export function installGrid(settings: {
	read: () => GridSettings
	write: (patch: Partial<GridSettings>) => void
}): () => void {
	readSettings = settings.read
	writeSettings = settings.write
	const unpatches: Array<() => void> = []
	const unfind = findModule(
		'modules/toast/native/AppToastContainer.tsx',
		['AppToastContainer'],
		(mod: any) => {
			if (typeof mod?.default !== 'function') return
			unpatches.push(
				after(mod, 'default', ((rendered: any) => (
					<>
						{rendered}
						<Overlay />
					</>
				)) as never),
			)
		},
	)
	return () => {
		unfind()
		for (const u of unpatches.splice(0))
			try {
				u()
			} catch {}
		forum = null
		mounted = false
	}
}
