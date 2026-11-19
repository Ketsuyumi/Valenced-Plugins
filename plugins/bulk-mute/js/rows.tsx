import { instead } from '@valenced/patcher'
import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { findModule } from './find'
import { onChange, selection, toggle } from './state'

/**
 * While selecting, every channel row gets a layer on top that catches the tap (so the channel
 * doesn't open) and shows a check circle. Rows come from
 * channel_list_v2/native/renderRedesignChannelListItem's renderChannelListItem({ guildChannels,
 * section, row }), the same function Better Channel List+ draws its previews through.
 */

export const rowStatus = { hooked: false }

function useSelection() {
	const [, tick] = useState(0)
	useEffect(() => onChange(() => tick(n => n + 1)), [])
}

function RowPick({
	id,
	guildId,
	children,
}: {
	id: string
	guildId: string
	children: any
}) {
	useSelection()
	const on = selection.active && selection.guildId === guildId
	const picked = on && selection.ids.has(id)
	return (
		<View>
			{children}
			{on ? (
				<Pressable
					accessibilityRole="checkbox"
					accessibilityState={{ checked: picked }}
					onPress={() => toggle(id)}
					style={{
						position: 'absolute',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						flexDirection: 'row',
						alignItems: 'center',
						justifyContent: 'flex-end',
						paddingRight: 14,
						borderRadius: 8,
						backgroundColor: picked ? 'rgba(88,101,242,0.22)' : 'transparent',
					}}
				>
					<View
						style={{
							width: 22,
							height: 22,
							borderRadius: 11,
							borderWidth: 2,
							borderColor: picked ? '#5865F2' : 'rgba(255,255,255,0.45)',
							backgroundColor: picked ? '#5865F2' : 'rgba(0,0,0,0.25)',
							alignItems: 'center',
							justifyContent: 'center',
						}}
					>
						{picked ? (
							<View
								style={{
									width: 10,
									height: 6,
									borderLeftWidth: 2,
									borderBottomWidth: 2,
									borderColor: '#ffffff',
									transform: [{ rotate: '-45deg' }],
									marginTop: -2,
								}}
							/>
						) : null}
					</View>
				</Pressable>
			) : null}
		</View>
	)
}

function channelOf(args: any[]): any {
	const p = args[0]
	try {
		return p?.guildChannels?.getChannelFromSectionRow?.(p.section, p.row)
			?.channel?.record
	} catch {
		return undefined
	}
}

export function patchRows(): () => void {
	let unpatch: (() => void) | undefined
	const unfind = findModule(
		'modules/channel_list_v2/native/renderRedesignChannelListItem.tsx',
		['renderChannelListItem', 'getChannelListItemSize'],
		(mod: any) => {
			if (typeof mod?.renderChannelListItem !== 'function') return
			rowStatus.hooked = true
			unpatch = instead(
				mod,
				'renderChannelListItem',
				function (this: unknown, args: any[], orig: any) {
					const out = orig.apply(this, args)
					try {
						const ch = channelOf(args)
						// Channels only: categories (4) and odd rows are left as they are.
						if (!out || !ch?.id || !ch.guild_id || ch.type === 4) return out
						return (
							<RowPick key={out.key ?? ch.id} id={ch.id} guildId={ch.guild_id}>
								{out}
							</RowPick>
						)
					} catch {
						return out
					}
				},
			)
		},
	)
	return () => {
		unfind()
		unpatch?.()
		rowStatus.hooked = false
	}
}
