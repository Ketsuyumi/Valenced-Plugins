import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { Image, Pressable, ScrollView, View } from 'react-native'
import { bump, refreshLists } from './list'
import {
	channel,
	dmData,
	GROUP_DM,
	labels,
	nameOf,
	on,
	onChange,
	PALETTE,
	setDm,
} from './state'
import { type CustomEmoji, emojiUrl, parseEmoji, searchEmoji } from './emoji'
import { Chip } from './ui'

/**
 * The emoji badge: a normal emoji, or a server emoji (any server you're in, animated ones too;
 * Nitro isn't needed because the badge is only drawn for you). Pasting `<:name:id>`,
 * `<a:name:id>` or an emoji link into the field works for emoji from other servers.
 */
function EmojiField({ id }: { id: string }) {
	const { Stack, Text, TextInput } = Design as any
	const [, tick] = useState(0)
	useEffect(() => onChange(() => tick(n => n + 1)), [])
	const [query, setQuery] = useState('')
	const d = dmData(id)
	const set = (patch: Parameters<typeof setDm>[1]) => {
		setDm(id, patch)
		bump()
		refreshLists()
	}
	const pickCustom = (e: CustomEmoji) =>
		set({ customEmoji: e, emoji: undefined })
	const hits = searchEmoji(query)
	return (
		<Stack spacing={8}>
			<TextInput
				label="Emoji"
				placeholder="⭐  or paste <:name:id>"
				value={d.customEmoji ? '' : (d.emoji ?? '')}
				onChange={(text: string) => {
					const custom = parseEmoji(text)
					if (custom) return pickCustom(custom)
					set({
						emoji: [...text].slice(0, 2).join('') || undefined,
						customEmoji: undefined,
					})
				}}
				isClearable
			/>
			{d.customEmoji ? (
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
					<Image
						source={{ uri: emojiUrl(d.customEmoji, 96) }}
						style={{ width: 32, height: 32 }}
					/>
					<Text variant="text-sm/medium" style={{ flex: 1 }}>
						:{d.customEmoji.name}:{d.customEmoji.animated ? ' (animated)' : ''}
					</Text>
					<Chip
						label="Remove"
						on={false}
						onPress={() => set({ customEmoji: undefined })}
					/>
				</View>
			) : null}
			<TextInput
				placeholder="Search server emoji (Nitro and animated work too)"
				value={query}
				onChange={setQuery}
				isClearable
				size="sm"
			/>
			{query.trim() ? (
				hits.length ? (
					<View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
						{hits.map(e => (
							<Pressable
								key={e.id}
								accessibilityLabel={`:${e.name}:`}
								onPress={() => {
									pickCustom(e)
									setQuery('')
								}}
								style={({ pressed }: { pressed: boolean }) => ({
									padding: 5,
									margin: 2,
									borderRadius: 8,
									backgroundColor:
										d.customEmoji?.id === e.id
											? 'rgba(88,101,242,0.35)'
											: pressed
												? 'rgba(255,255,255,0.12)'
												: 'transparent',
								})}
							>
								<Image
									source={{ uri: emojiUrl(e, 64) }}
									style={{ width: 32, height: 32 }}
								/>
							</Pressable>
						))}
					</View>
				) : (
					<Text variant="text-sm/medium" color="text-muted">
						No server emoji called that. You can also paste one as{' '}
						{'<:name:id>'}.
					</Text>
				)
			) : null}
		</Stack>
	)
}

/** Everything you can set for one DM. Saves as you change it. */
export function DmEditor({ id }: { id: string }) {
	const { Stack, Text, TextInput, TableRowGroup, TableSwitchRow } =
		Design as any
	const [, tick] = useState(0)
	useEffect(() => onChange(() => tick(n => n + 1)), [])
	const c = channel(id)
	const d = dmData(id)
	const set = (patch: Parameters<typeof setDm>[1]) => {
		setDm(id, patch)
		bump()
		refreshLists()
	}
	const known = labels().filter(l => l !== d.label)
	return (
		<Stack spacing={16}>
			<Text variant="heading-md/bold">{nameOf(c) || 'DM'}</Text>
			<Stack spacing={6}>
				<Text variant="text-sm/semibold" color="text-muted">
					Colour
				</Text>
				<ScrollView horizontal showsHorizontalScrollIndicator={false}>
					<Chip
						label="None"
						on={!d.color}
						onPress={() => set({ color: undefined })}
					/>
					{PALETTE.map(([hex, name]) => (
						<Chip
							key={hex}
							label={name}
							on={d.color === hex}
							color={hex}
							onPress={() => set({ color: hex })}
						/>
					))}
				</ScrollView>
			</Stack>
			<TextInput
				label="Label"
				placeholder="school, irl, work…"
				value={d.label ?? ''}
				onChange={(label: string) => set({ label: label.slice(0, 24) })}
				isClearable
				description={
					on('tabs')
						? 'Each label gets its own tab in your DM list.'
						: undefined
				}
			/>
			{known.length ? (
				<ScrollView horizontal showsHorizontalScrollIndicator={false}>
					{known.map(l => (
						<Chip
							key={l}
							label={l}
							on={false}
							onPress={() => set({ label: l })}
						/>
					))}
				</ScrollView>
			) : null}
			<EmojiField id={id} />
			{c?.type !== GROUP_DM ? (
				<TextInput
					label="Private nickname"
					placeholder="Only you see this"
					value={d.nickname ?? ''}
					onChange={(nickname: string) =>
						set({ nickname: nickname.slice(0, 32) })
					}
					isClearable
					description="Shown instead of their name wherever Discord shows friend nicknames."
				/>
			) : null}
			<TableRowGroup>
				<TableSwitchRow
					label="Pin to top"
					value={!!d.pinned}
					onValueChange={(pinned: boolean) => set({ pinned })}
				/>
				<TableSwitchRow
					label="Careful chat"
					subLabel="Ask “Send to …?” before each message here."
					value={!!d.careful}
					onValueChange={(careful: boolean) => set({ careful })}
				/>
			</TableRowGroup>
		</Stack>
	)
}

export function openEditor(id: string) {
	const { AlertModal, AlertActionButton } = Design as any
	const key = `better-dms-edit-${id}`
	const close = () => (AlertActionCreators as any).dismissAlert(key)
	;(AlertActionCreators as any).openAlert(
		key,
		<AlertModal
			title="DM options"
			extraContent={
				<View style={{ maxHeight: 520 }}>
					<ScrollView keyboardShouldPersistTaps="handled">
						<DmEditor id={id} />
					</ScrollView>
				</View>
			}
			actions={
				<AlertActionButton text="Done" variant="primary" onPress={close} />
			}
		/>,
	)
}
