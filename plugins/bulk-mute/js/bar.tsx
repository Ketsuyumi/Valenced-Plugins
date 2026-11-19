import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { after } from '@valenced/patcher'
import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { findModule } from './find'
import { setMuted } from './mute'
import {
	changed,
	channelsOf,
	end,
	isMuted,
	onChange,
	S,
	selection,
} from './state'

/**
 * The bar at the bottom while selecting: the count, All, Mute, Unmute and ✕. Drawn beside
 * Discord's toast container (AppToastContainer's `default`, mounted once over the whole app),
 * as Multi Select's bar is.
 */

export function toast(text: string) {
	try {
		ToastActionCreators.open('bulk-mute', { text } as never)
	} catch {}
}

let busy = false

async function apply(mute: boolean) {
	const guildId = selection.guildId
	const ids = [...selection.ids]
	if (!guildId || !ids.length || busy) return
	busy = true
	changed()
	try {
		await setMuted(guildId, ids, mute)
		toast(
			`${mute ? 'Muted' : 'Unmuted'} ${ids.length} channel${ids.length === 1 ? '' : 's'}${mute ? ' forever' : ''}`,
		)
		end()
	} catch (e: any) {
		toast(
			`Couldn't ${mute ? 'mute' : 'unmute'}: ${e?.body?.message ?? e?.message ?? e}`,
		)
	} finally {
		busy = false
		changed()
	}
}

/** Selects every channel not muted yet; if they're all selected already, clears. */
function selectAll() {
	const guildId = selection.guildId
	if (!guildId) return
	const ids = channelsOf(guildId)
		.map(c => String(c.id))
		.filter(id => !isMuted(guildId, id))
	const all = ids.length > 0 && ids.every(id => selection.ids.has(id))
	selection.ids.clear()
	if (!all) for (const id of ids) selection.ids.add(id)
	changed()
}

function Bar() {
	const { Text } = Design as any
	const [, tick] = useState(0)
	useEffect(() => onChange(() => tick(n => n + 1)), [])
	if (!selection.active) return null
	const n = selection.ids.size
	const name = S().GuildStore?.getGuild?.(selection.guildId)?.name
	const elsewhere = selection.guildId !== S().SelectedGuildStore?.getGuildId?.()
	const button = (
		label: string,
		onPress: () => void,
		opts: { strong?: boolean; off?: boolean } = {},
	) => (
		<Pressable
			key={label}
			accessibilityRole="button"
			accessibilityLabel={label}
			disabled={opts.off || busy}
			onPress={onPress}
			style={({ pressed }: { pressed: boolean }) => ({
				height: 34,
				borderRadius: 17,
				paddingHorizontal: 12,
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: opts.strong
					? '#5865F2'
					: pressed
						? 'rgba(255,255,255,0.14)'
						: 'rgba(255,255,255,0.07)',
				opacity: opts.off || busy ? 0.45 : 1,
			})}
		>
			<Text variant="text-sm/semibold" style={{ color: '#ffffff' }}>
				{label}
			</Text>
		</Pressable>
	)
	return (
		<View
			pointerEvents="box-none"
			style={{
				position: 'absolute',
				bottom: 120,
				left: 10,
				right: 10,
				alignItems: 'center',
			}}
		>
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					gap: 6,
					paddingLeft: 14,
					paddingRight: 6,
					paddingVertical: 6,
					borderRadius: 24,
					backgroundColor: 'rgba(30, 31, 34, 0.96)',
					borderWidth: 1,
					borderColor: 'rgba(255, 255, 255, 0.08)',
					maxWidth: 520,
				}}
			>
				<Text
					variant="text-sm/semibold"
					style={{ color: '#ffffff', marginRight: 4, flexShrink: 1 }}
					numberOfLines={1}
				>
					{busy
						? 'Saving…'
						: n
							? `${n} selected`
							: elsewhere && name
								? `Open ${name}`
								: 'Tap channels'}
				</Text>
				{button('All', selectAll)}
				{button('Mute', () => void apply(true), { strong: true, off: !n })}
				{button('Unmute', () => void apply(false), { off: !n })}
				{button('✕', end)}
			</View>
		</View>
	)
}

export function installBar(): () => void {
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
						<Bar />
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
	}
}
