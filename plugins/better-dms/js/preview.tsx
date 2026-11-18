import { instead } from '@valenced/patcher'
import { cloneElement } from 'react'
import { Text } from 'react-native'
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

/** One coloured piece of hint text. */
interface Piece {
	text: string
	color?: string
	bold?: boolean
}

/** The hint pieces for one DM: identity and status before the preview, info after it. */
function pieces(id: string): { lead: Piece[]; info: Piece[]; fade: boolean } {
	const c = channel(id)
	if (!c) return { lead: [], info: [], fade: false }
	const s = settings()
	const d = dmData(id)
	const recipient = recipientOf(c)
	const u = user(recipient)
	const lead: Piece[] = []
	const info: Piece[] = []

	if (on('colors') && d.color) lead.push({ text: '● ', color: d.color })
	if (on('emoji') && d.emoji) lead.push({ text: `${d.emoji} ` })
	if (on('labels') && d.label) lead.push({ text: `${d.label} · `, color: on('colors') ? d.color : undefined, bold: true })
	if (on('groupLook') && c.type === GROUP_DM) lead.push({ text: `👥${(c.recipients?.length ?? 0) + 1} · ` })
	if (on('botLook') && u?.bot) lead.push({ text: '🤖 bot · ' })
	else if (on('friendMarker') && c.type !== GROUP_DM && recipient && !isFriend(recipient))
		lead.push({ text: 'not a friend · ' })
	if (on('unread')) {
		const mentions = mentionCount(id)
		if (mentions) lead.push({ text: `(${mentions}) `, color: s.unreadColor, bold: true })
		else if (isUnread(id)) lead.push({ text: '● ', color: s.unreadColor })
	}

	if (on('mutuals') && c.type !== GROUP_DM) {
		const n = mutualServers(recipient)
		if (n) info.push({ text: ` · ${n} mutual` })
	}
	if (on('notes') && recipient) {
		const note = noteOf(recipient)
		if (note) info.push({ text: ` · 📝 ${note.slice(0, 40)}` })
	}
	// Discord already shows the time on the row; this only adds it on the second line.
	const active = lastActive(c)
	if (on('lastActive') && active && s.extraLine) info.push({ text: ` · ${ago(active)}` })

	const days = s.fadeAfterDays
	const fade =
		(on('lastActive') && days > 0 && active > 0 && Date.now() - active > days * 864e5) ||
		(on('botLook') && !!u?.bot)
	return { lead, info, fade }
}

/** How the last preview was decorated, for Settings → Status. */
export let previewStatus = 'No DM row drawn yet'

const textOf = (p: Piece, key: string) => (
	<Text key={key} style={{ color: p.color, fontWeight: p.bold ? '700' : undefined }}>
		{p.text}
	</Text>
)

/**
 * The element holding the preview's text: the first one with a string among its children. Hints
 * go inside it as nested text, so they take the preview's own line and font and change no layout.
 */
function addToText(node: any, lead: Piece[], info: Piece[], fade: boolean, depth = 0): any {
	if (!node || typeof node !== 'object' || depth > 10) return undefined
	if (Array.isArray(node)) {
		for (let i = 0; i < node.length; i++) {
			const next = addToText(node[i], lead, info, fade, depth + 1)
			if (next !== undefined) {
				const copy = [...node]
				copy[i] = next
				return copy
			}
		}
		return undefined
	}
	const kids = node.props?.children
	if (kids == null) return undefined
	const list = Array.isArray(kids) ? kids : [kids]
	if (list.some(k => typeof k === 'string' || typeof k === 'number')) {
		const style = fade ? [node.props.style, { opacity: 0.55 }] : node.props.style
		return cloneElement(
			node,
			{ style },
			...lead.map((p, i) => textOf(p, `bdl${i}`)),
			...list,
			...info.map((p, i) => textOf(p, `bdi${i}`)),
		)
	}
	const next = addToText(kids, lead, info, fade, depth + 1)
	return next === undefined ? undefined : cloneElement(node, undefined, ...(Array.isArray(next) ? next : [next]))
}

function decorate(output: any, id: string | undefined) {
	if (!id) return output
	const { lead, info, fade } = pieces(id)
	if (!lead.length && !info.length && !fade) return output
	if (settings().extraLine) {
		previewStatus = 'Hints on their own line'
		return (
			<>
				{output}
				<Text numberOfLines={1} style={{ fontSize: 11, opacity: 0.8 }}>
					{[...lead, ...info].map((p, i) => textOf(p, `bdx${i}`))}
				</Text>
			</>
		)
	}
	const inline = addToText(output, lead, info, fade)
	if (inline !== undefined) {
		previewStatus = 'Hints inside the preview text'
		return inline
	}
	// The preview isn't plain text on this version: leave it alone rather than move it.
	previewStatus = "Hints can't be shown here: the preview isn't plain text (try Hints on a second line)"
	return output
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
