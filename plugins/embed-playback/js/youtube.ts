/** Set just before the player itself opens YouTube, so the link hook lets that one through. */
export const external = { skip: false }

/** The video id and start time in a YouTube watch, short, live, embed or youtu.be URL. */
export function youtubeOf(url: unknown): { videoId: string; start?: number } | undefined {
	if (typeof url !== 'string') return undefined
	let match = url.match(
		/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|live\/|v\/|watch\?(?:.*&)?v=)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/,
	)
	if (!match) return undefined
	const videoId = match[1]
	match = url.match(/[?&#](?:t|start)=(?:(\d+)h)?(?:(\d+)m)?(\d+)s?/)
	const start = match ? (Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3])) || undefined : undefined
	return { videoId, start }
}

/** The YouTube URL in a media viewer source, trying every field Discord may use. */
export function youtubeInSource(source: any) {
	if (!source || typeof source !== 'object') return undefined
	for (const key of ['uri', 'url', 'sourceURI', 'originalURL', 'proxyURL', 'videoURI', 'embedURL']) {
		const hit = youtubeOf(source[key])
		if (hit) return hit
	}
	return undefined
}

/**
 * The page the player loads: YouTube's iframe player in a page whose origin is set, so YouTube
 * accepts the embed (a bare embed URL with no referrer can be refused).
 */
export function playerHtml(videoId: string, start = 0): string {
	const src = `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&start=${start}&origin=https://www.youtube.com`
	return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style>
</head><body><iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`
}
