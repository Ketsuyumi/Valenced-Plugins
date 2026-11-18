import { Design } from '@valenced/discord/design'
import { instead } from '@valenced/patcher'
import { View } from 'react-native'
import { findModule } from './find'
import {
	ago,
	channel,
	dmData,
	GROUP_DM,
	isFriend,
	isUnread,
	lastActive,
	mentionCount,
	mutualServers,
	noteOf,
	on,
	recipientOf,
	settings,
	user,
} from './state'

/**
 * Hints on each DM row's preview line. `ChannelRowPreview` draws the line under the name (the last
 * message) and gets the channel in its props, which is how Chat Lock hooks it too. Everything here
 * is added around Discord's own output; nothing of it is changed.
 */

const PREVIEW = 'modules/main_tabs_v2/native/shared_components/ChannelRowPreview.tsx'

function Tag({ text, color, filled }: { text: string; color?: string; filled?: boolean }) {
	const { Text } = Design as any
	return (
		<View
			style={{
				paddingHorizontal: 5,
				borderRadius: 6,
				marginRight: 4,
				backgroundColor: filled ? color : color ? `${color}33` : 'rgba(127,127,127,0.2)',
			}}
		>
			<Text variant="text-xxs/bold" style={{ color: filled ? '#ffffff' : (color ?? undefined) }} color={color ? undefined : 'text-muted'}>
				{text}
			</Text>
		</View>
	)
}

function Muted({ text }: { text: string }) {
	const { Text } = Design as any
	return (
		<Text variant="text-xxs/medium" color="text-muted" style={{ marginRight: 4 }}>
			{text}
		</Text>
	)
}

/** The hint pieces for one DM, in order: identity first, then status, then info. */
function pieces(id: string) {
	const c = channel(id)
	if (!c) return { lead: [] as any[], info: [] as any[], fade: false }
	const s = settings()
	const d = dmData(id)
	const recipient = recipientOf(c)
	const u = user(recipient)
	const lead: any[] = []
	const info: any[] = []

	if (on('colors') && d.color) lead.push(<View key="dot" style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: d.color, marginRight: 4 }} />)
	if (on('emoji') && d.emoji) lead.push(<Muted key="emoji" text={d.emoji} />)
	if (on('labels') && d.label) lead.push(<Tag key="label" text={d.label} color={on('colors') ? d.color : undefined} />)
	if (on('groupLook') && c.type === GROUP_DM)
		lead.push(<Tag key="group" text={`👥 ${(c.recipients?.length ?? 0) + 1}`} />)
	if (on('botLook') && u?.bot) lead.push(<Tag key="bot" text="🤖 bot" />)
	else if (on('friendMarker') && c.type !== GROUP_DM && recipient && !isFriend(recipient)) lead.push(<Tag key="nf" text="not a friend" />)
	if (on('unread')) {
		const mentions = mentionCount(id)
		if (mentions) lead.push(<Tag key="unread" text={String(mentions)} color={s.unreadColor} filled />)
		else if (isUnread(id)) lead.push(<View key="unread" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.unreadColor, marginRight: 4 }} />)
	}

	const active = lastActive(c)
	if (on('lastActive') && active) info.push(<Muted key="ago" text={ago(active)} />)
	if (on('mutuals') && c.type !== GROUP_DM) {
		const n = mutualServers(recipient)
		if (n) info.push(<Muted key="mutual" text={`${n} mutual`} />)
	}
	if (on('notes') && recipient) {
		const note = noteOf(recipient)
		if (note) info.push(<Muted key="note" text={`📝 ${note.slice(0, 40)}`} />)
	}

	const days = s.fadeAfterDays
	const fade =
		(on('lastActive') && days > 0 && active > 0 && Date.now() - active > days * 864e5) ||
		(on('botLook') && !!u?.bot)
	return { lead, info, fade }
}

function decorate(output: any, id: string | undefined) {
	if (!id) return output
	const { lead, info, fade } = pieces(id)
	if (!lead.length && !info.length && !fade) return output
	const body = <View style={{ flex: 1, minWidth: 0, opacity: fade ? 0.55 : 1 }}>{output}</View>
	if (settings().extraLine)
		return (
			<View style={{ flex: 1, minWidth: 0 }}>
				{body}
				{lead.length || info.length ? (
					<View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, flexWrap: 'nowrap', overflow: 'hidden' }}>
						{lead}
						{info}
					</View>
				) : null}
			</View>
		)
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
			{lead}
			{body}
			{info.length ? <View style={{ flexDirection: 'row', marginLeft: 4 }}>{info}</View> : null}
		</View>
	)
}

export function installPreview(): () => void {
	const undo: Array<() => void> = []
	undo.push(
		findModule(PREVIEW, ['ChannelRowPreview'], (mod: any) => {
			for (const key of ['ChannelRowPreview', 'default']) {
				const target = mod?.[key]
				const host =
					typeof target === 'function'
						? { o: mod, k: key }
						: typeof target?.type === 'function'
							? { o: target, k: 'type' }
							: null
				if (!host) continue
				undo.push(
					instead(host.o, host.k, function (this: unknown, args: any[], orig: (...a: any[]) => any) {
						const out = orig.apply(this, args)
						try {
							const p = args[0]
							const id = p?.channel?.id ?? p?.message?.channel_id ?? p?.channelId
							const c = typeof id === 'string' ? channel(id) : undefined
							return c && (c.type === 1 || c.type === 3) ? decorate(out, id) : out
						} catch {
							return out
						}
					}),
				)
				break
			}
		}),
	)
	return () => {
		for (const u of undo.splice(0))
			try {
				u()
			} catch {}
	}
}
