import { Stores } from '@valenced/discord/flux'

/** Channel selection: on for one server at a time. */
export const selection = {
	active: false,
	guildId: undefined as string | undefined,
	ids: new Set<string>(),
}

const listeners = new Set<() => void>()
export function onChange(fn: () => void): () => void {
	listeners.add(fn)
	return () => listeners.delete(fn)
}
export function changed() {
	for (const fn of listeners)
		try {
			fn()
		} catch {}
}

export const S = () => Stores as any

export function begin(guildId: string) {
	selection.active = true
	selection.guildId = guildId
	selection.ids.clear()
	changed()
}

export function end() {
	selection.active = false
	selection.guildId = undefined
	selection.ids.clear()
	changed()
}

export function toggle(id: string) {
	if (selection.ids.has(id)) selection.ids.delete(id)
	else selection.ids.add(id)
	changed()
}

export const currentGuild = (): string | undefined =>
	S().SelectedGuildStore?.getGuildId?.() ?? undefined

/** Channels you can see in [guildId] (not categories), in list order. */
export function channelsOf(guildId: string): any[] {
	const out: any[] = []
	const g = S().GuildChannelStore?.getChannels?.(guildId)
	if (g && typeof g === 'object')
		for (const key of ['SELECTABLE', 'VOCAL'])
			for (const e of g[key] ?? []) if (e?.channel) out.push(e.channel)
	return out
}

export function isMuted(guildId: string, channelId: string): boolean {
	try {
		return !!S().UserGuildSettingsStore?.isChannelMuted?.(guildId, channelId)
	} catch {
		return false
	}
}
