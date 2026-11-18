import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { bump, refreshLists } from './list'
import { channel, dmData, GROUP_DM, labels, nameOf, on, onChange, PALETTE, setDm } from './state'
import { Chip } from './ui'

/** Everything you can set for one DM. Saves as you change it. */
export function DmEditor({ id }: { id: string }) {
	const { Stack, Text, TextInput, TableRowGroup, TableSwitchRow } = Design as any
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
					<Chip label="None" on={!d.color} onPress={() => set({ color: undefined })} />
					{PALETTE.map(([hex, name]) => (
						<Chip key={hex} label={name} on={d.color === hex} color={hex} onPress={() => set({ color: hex })} />
					))}
				</ScrollView>
			</Stack>
			<TextInput
				label="Label"
				placeholder="school, irl, work…"
				value={d.label ?? ''}
				onChange={(label: string) => set({ label: label.slice(0, 24) })}
				isClearable
				description={on('tabs') ? 'Each label gets its own tab in your DM list.' : undefined}
			/>
			{known.length ? (
				<ScrollView horizontal showsHorizontalScrollIndicator={false}>
					{known.map(l => (
						<Chip key={l} label={l} on={false} onPress={() => set({ label: l })} />
					))}
				</ScrollView>
			) : null}
			<TextInput
				label="Emoji"
				placeholder="⭐"
				value={d.emoji ?? ''}
				onChange={(emoji: string) => set({ emoji: [...emoji].slice(0, 2).join('') })}
				isClearable
			/>
			{c?.type !== GROUP_DM ? (
				<TextInput
					label="Private nickname"
					placeholder="Only you see this"
					value={d.nickname ?? ''}
					onChange={(nickname: string) => set({ nickname: nickname.slice(0, 32) })}
					isClearable
					description="Shown instead of their name wherever Discord shows friend nicknames."
				/>
			) : null}
			<TableRowGroup>
				<TableSwitchRow label="Pin to top" value={!!d.pinned} onValueChange={(pinned: boolean) => set({ pinned })} />
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
			actions={<AlertActionButton text="Done" variant="primary" onPress={close} />}
		/>,
	)
}
