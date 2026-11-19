import { Stores } from '@valenced/discord/flux'

/**
 * A server (custom) emoji for a DM's badge. The badge is only drawn on your screen, so any emoji
 * works, Nitro or not, animated or not: it is just the emoji's picture from Discord's CDN.
 */
export interface CustomEmoji {
	id: string
	name: string
	animated?: boolean
}

const S = () => Stores as any

/** The picture: GIF for animated emoji (it plays), WebP otherwise. */
export const emojiUrl = (e: CustomEmoji, size = 48) =>
	`https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'webp'}?size=${size}&quality=lossless`

/** `<:name:id>`, `<a:name:id>` (what "Copy text" or \:emoji: gives) or an emoji link. */
export function parseEmoji(text: string): CustomEmoji | undefined {
	const tag = /<(a?):([\w~]{1,32}):(\d{15,25})>/.exec(text)
	if (tag) return { id: tag[3], name: tag[2], animated: tag[1] === 'a' }
	const link =
		/cdn\.discordapp\.com\/emojis\/(\d{15,25})\.(gif|png|webp|jpe?g)(?:\?[^\s]*)?/i.exec(
			text,
		)
	if (link)
		return {
			id: link[1],
			name: 'emoji',
			animated:
				link[2].toLowerCase() === 'gif' || /animated=true/i.test(link[0]),
		}
	return undefined
}

/** Emoji of every server you're in, as Discord's EmojiStore has them. */
function serverEmoji(): CustomEmoji[] {
	const out: CustomEmoji[] = []
	const seen = new Set<string>()
	const add = (e: any) => {
		const id = e?.id
		if (typeof id !== 'string' || seen.has(id) || !e.name) return
		seen.add(id)
		out.push({ id, name: String(e.name), animated: !!e.animated })
	}
	const store = S().EmojiStore
	let guildIds: string[] = []
	try {
		guildIds = Object.keys(S().GuildStore?.getGuilds?.() ?? {})
	} catch {}
	for (const g of guildIds) {
		try {
			const list = store?.getGuildEmoji?.(g)
			if (Array.isArray(list)) {
				list.forEach(add)
				continue
			}
		} catch {}
		try {
			const entry = store?.getGuilds?.()?.[g]
			for (const e of entry?.emojis ?? entry?._emojis ?? []) add(e)
		} catch {}
	}
	return out
}

let cache: { at: number; list: CustomEmoji[] } | undefined

/** Server emoji whose name contains [query], best matches first. */
export function searchEmoji(query: string, limit = 60): CustomEmoji[] {
	const q = query.trim().toLowerCase().replace(/^:|:$/g, '')
	if (!q) return []
	if (!cache || Date.now() - cache.at > 60_000)
		cache = { at: Date.now(), list: serverEmoji() }
	const hits = cache.list.filter(e => e.name.toLowerCase().includes(q))
	hits.sort((a, b) => {
		const an = a.name.toLowerCase()
		const bn = b.name.toLowerCase()
		return (
			(bn === q ? 1 : 0) - (an === q ? 1 : 0) ||
			(bn.startsWith(q) ? 1 : 0) - (an.startsWith(q) ? 1 : 0)
		)
	})
	return hits.slice(0, limit)
}
