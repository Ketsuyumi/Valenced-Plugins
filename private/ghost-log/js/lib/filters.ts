/**
 * Ghost Log+ additions: the ignore list and keyword alerts.
 *
 * Both are read on every deletion and edit, so the settings are turned into Sets once per change
 * (subscribeSettings) and each check is a couple of Set lookups.
 */

import { getSettings, subscribeSettings } from '../settings'

let ignoredServers = new Set<string>()
let ignoredChannels = new Set<string>()
let ignoredUsers = new Set<string>()
let keywords: string[] = []
let anyIgnored = false

function rebuild() {
	const cfg = getSettings()
	const servers = new Set<string>()
	const channels = new Set<string>()
	const users = new Set<string>()
	for (const [id, entry] of Object.entries(cfg.ignored ?? {})) {
		if (!entry?.on) continue
		if (entry.kind === 'server') servers.add(id)
		else if (entry.kind === 'channel') channels.add(id)
		else if (entry.kind === 'user') users.add(id)
	}
	ignoredServers = servers
	ignoredChannels = channels
	ignoredUsers = users
	anyIgnored = servers.size + channels.size + users.size > 0
	keywords = cfg.keywordAlerts
		? Object.entries(cfg.keywords ?? {})
				.filter(([word, on]) => on && word.trim())
				.map(([word]) => word.trim().toLowerCase())
		: []
}

/** Call once from start(), after initSettings. Returns the teardown. */
export function watchFilters(): () => void {
	rebuild()
	return subscribeSettings(rebuild)
}

/** Whether a message by [authorId] in [channelId] / [guildId] is on the ignore list. */
export function isIgnored(
	authorId: unknown,
	channelId: unknown,
	guildId: unknown,
): boolean {
	if (!anyIgnored) return false
	return (
		(authorId != null && ignoredUsers.has(String(authorId))) ||
		(channelId != null && ignoredChannels.has(String(channelId))) ||
		(guildId != null && ignoredServers.has(String(guildId)))
	)
}

/** The first alert keyword [content] contains, or undefined. */
export function matchKeyword(content: unknown): string | undefined {
	if (!keywords.length || typeof content !== 'string' || !content) return
	const text = content.toLowerCase()
	for (const word of keywords) if (text.includes(word)) return word
	return undefined
}
