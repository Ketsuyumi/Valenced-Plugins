import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { instead } from '@valenced/patcher'
import { findModule } from './find'

/**
 * Read channels outside any category. Discord can't collapse those, so their rows are drawn as
 * nothing with no height: renderChannelListItem / getChannelListItemSize from
 * channel_list_v2/native/renderRedesignChannelListItem (the hook Better Channel List+ uses).
 * Kept: anything with new messages, the channel you're in, and voice channels with people in them.
 */

const S = () => Stores as any
const CATEGORY = 4
const VOICE = new Set([2, 13])

export const looseStatus = { hooked: false, hidden: 0 }

function channelOf(args: any[]): any {
	const p = args[0]
	try {
		return p?.guildChannels?.getChannelFromSectionRow?.(p.section, p.row)
			?.channel?.record
	} catch {
		return undefined
	}
}

export function patchLoose(opts: {
	enabled: () => boolean
	hasNew: (guildId: string, channelId: string) => boolean
}): () => void {
	const shouldHide = (ch: any): boolean => {
		if (
			!opts.enabled() ||
			!ch?.id ||
			!ch.guild_id ||
			ch.parent_id ||
			ch.type === CATEGORY
		)
			return false
		if (ch.id === S().SelectedChannelStore?.getChannelId?.()) return false
		if (VOICE.has(ch.type)) {
			const states = S().VoiceStateStore?.getVoiceStatesForChannel?.(ch.id)
			if (states && Object.keys(states).length) return false
		}
		return !opts.hasNew(ch.guild_id, ch.id)
	}

	const unpatches: Array<() => void> = []
	const unfind = findModule(
		'modules/channel_list_v2/native/renderRedesignChannelListItem.tsx',
		['renderChannelListItem', 'getChannelListItemSize'],
		(mod: any) => {
			if (typeof mod?.renderChannelListItem !== 'function') return
			looseStatus.hooked = true
			unpatches.push(
				instead(
					mod,
					'renderChannelListItem',
					function (this: unknown, args: any[], orig: any) {
						try {
							if (shouldHide(channelOf(args))) return null
						} catch {}
						return orig.apply(this, args)
					},
				),
			)
			if (typeof mod.getChannelListItemSize === 'function')
				unpatches.push(
					instead(
						mod,
						'getChannelListItemSize',
						function (this: unknown, args: any[], orig: any) {
							try {
								if (shouldHide(channelOf(args))) {
									looseStatus.hidden++
									return 0
								}
							} catch {}
							return orig.apply(this, args)
						},
					),
				)
		},
	)

	// A hidden channel that gets a message (or the one you open) has to come back: ask the list to
	// measure its rows again, at most every 300 ms, and only for channels outside categories.
	let timer: any
	const redraw = () => {
		if (timer) return
		timer = setTimeout(() => {
			timer = undefined
			try {
				S().ChannelListStore?.emitChange?.()
			} catch {}
		}, 300)
	}
	const loose = (channelId: unknown) => {
		if (!opts.enabled() || typeof channelId !== 'string') return false
		const ch = S().ChannelStore?.getChannel?.(channelId)
		return (
			!!ch?.guild_id &&
			!ch.parent_id &&
			ch.guild_id === S().SelectedGuildStore?.getGuildId?.()
		)
	}
	const subs: Array<[string, (e: any) => void]> = [
		[
			'MESSAGE_CREATE',
			e => loose(e?.channelId ?? e?.message?.channel_id) && redraw(),
		],
		['MESSAGE_ACK', e => loose(e?.channelId) && redraw()],
		['CHANNEL_SELECT', e => loose(e?.channelId) && redraw()],
		['VOICE_STATE_UPDATES', () => opts.enabled() && redraw()],
	]
	for (const [type, fn] of subs) (Dispatcher as any).subscribe(type, fn)

	return () => {
		unfind()
		for (const u of unpatches.splice(0))
			try {
				u()
			} catch {}
		for (const [type, fn] of subs) (Dispatcher as any).unsubscribe(type, fn)
		clearTimeout(timer)
		looseStatus.hooked = false
	}
}
