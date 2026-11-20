/** A server's emojis and stickers, as files to save. */
export interface Asset {
	url: string
	/** Discord's MediaType: 0 image, 1 GIF. */
	type: 0 | 1
	name: string
	/** File extension in the zip. */
	ext: 'png' | 'gif'
}

const CDN = 'https://cdn.discordapp.com'

export function emojiAssets(list: any[]): Asset[] {
	return list
		.filter(e => e?.id)
		.map(e => ({
			url: `${CDN}/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=512&quality=lossless`,
			type: e.animated ? 1 : 0,
			ext: e.animated ? ('gif' as const) : ('png' as const),
			name: String(e.name ?? e.id),
		}))
}

/** Sticker formats: 1 PNG, 2 APNG (kept as .png), 3 Lottie (animation data, not a picture: skipped), 4 GIF. */
export function stickerAssets(list: any[]): {
	assets: Asset[]
	skipped: number
} {
	const assets: Asset[] = []
	let skipped = 0
	for (const s of list) {
		if (!s?.id) continue
		const f = Number(s.format_type ?? s.formatType)
		if (f === 3) {
			skipped++
			continue
		}
		assets.push({
			url:
				f === 4
					? `${CDN}/stickers/${s.id}.gif?size=1024`
					: `${CDN}/stickers/${s.id}.png?size=1024&passthrough=true`,
			type: f === 4 ? 1 : 0,
			ext: f === 4 ? ('gif' as const) : ('png' as const),
			name: String(s.name ?? s.id),
		})
	}
	return { assets, skipped }
}

export function guildEmojis(store: any, guildId: string): any[] {
	if (!store) return []
	for (const get of [
		() => store.getGuildEmoji?.(guildId),
		() => store.getGuilds?.()?.[guildId]?.emojis,
		() => store.getUsableGuildEmoji?.(guildId),
	]) {
		try {
			const v = get()
			if (Array.isArray(v) && v.length) return v
		} catch {}
	}
	return []
}

export function guildStickers(store: any, guildId: string): any[] {
	if (!store) return []
	for (const get of [
		() => store.getStickersByGuildId?.(guildId),
		() => store.getRawStickersByGuild?.()?.get?.(guildId),
		() => store.getAllGuildStickers?.()?.get?.(guildId),
	]) {
		try {
			const v = get()
			if (Array.isArray(v) && v.length) return v
		} catch {}
	}
	return []
}
