/** Set just before the player itself opens YouTube, so the link hook lets that one through. */
export const external = { skip: false }

/** The video id and start time in a YouTube watch, short, live, embed or youtu.be URL. */
export function youtubeOf(
	url: unknown,
): { videoId: string; start?: number } | undefined {
	if (typeof url !== 'string') return undefined
	let match = url.match(
		/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|live\/|v\/|watch\?(?:.*&)?v=)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/,
	)
	if (!match) return undefined
	const videoId = match[1]
	match = url.match(/[?&#](?:t|start)=(?:(\d+)h)?(?:(\d+)m)?(\d+)s?/)
	const start = match
		? Number(match[1] ?? 0) * 3600 +
				Number(match[2] ?? 0) * 60 +
				Number(match[3]) || undefined
		: undefined
	return { videoId, start }
}

/** A YouTube thumbnail (i.ytimg.com / img.youtube.com), which carries the video id too. */
function thumbnailOf(url: string): { videoId: string } | undefined {
	const match = url.match(
		/(?:i\d?\.ytimg\.com|img\.youtube\.com)\/(?:vi|vi_webp)\/([A-Za-z0-9_-]{6,20})\//,
	)
	return match ? { videoId: match[1] } : undefined
}

/**
 * The YouTube video in a media viewer source. Every string in it is looked at (a few levels deep):
 * the video's own URL first, then a thumbnail, since some builds only hand the viewer the
 * thumbnail and keep the video URL elsewhere.
 */
export function youtubeInSource(
	source: any,
): { videoId: string; start?: number } | undefined {
	if (!source || typeof source !== 'object') return undefined
	const strings: string[] = []
	const walk = (value: any, depth: number) => {
		if (typeof value === 'string') strings.push(value)
		else if (value && typeof value === 'object' && depth < 4)
			for (const v of Array.isArray(value) ? value : Object.values(value))
				walk(v, depth + 1)
	}
	walk(source, 0)
	for (const s of strings) {
		const hit = youtubeOf(s)
		if (hit) return hit
	}
	for (const s of strings) {
		const hit = thumbnailOf(s)
		if (hit) return hit
	}
	return undefined
}

/** The keys of a source and its first string values, for Settings → Status. */
export function describeSource(source: any): string {
	if (!source || typeof source !== 'object') return String(source)
	return Object.entries(source)
		.slice(0, 12)
		.map(([k, v]) =>
			typeof v === 'string'
				? `${k}=${v.slice(0, 60)}`
				: `${k}:${Array.isArray(v) ? 'list' : typeof v}`,
		)
		.join(', ')
}

/**
 * How the player loads YouTube. YouTube refuses embeds whose page doesn't identify itself the way
 * it expects (errors 152 and 153), and which way works can differ by device, so there are three,
 * tried in turn with the player's ↻ button; the one that works is remembered.
 *
 * - `discord`: YouTube's embed in a small page served as https://discord.com, as Discord's own
 *   embeds are.
 * - `nocookie`: the same with youtube-nocookie.com (YouTube's privacy-enhanced player).
 * - `direct`: the embed page itself, with a Referer header.
 */
export type PlayerMode = 'discord' | 'nocookie' | 'direct'
export const MODES: PlayerMode[] = ['discord', 'nocookie', 'direct']
export const MODE_NAMES: Record<PlayerMode, string> = {
	discord: 'Discord-style embed',
	nocookie: 'Privacy-enhanced embed',
	direct: 'Direct embed page',
}

const ORIGIN = 'https://discord.com'

function embedUrl(host: string, videoId: string, start = 0): string {
	return `https://${host}/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&start=${start}&origin=${encodeURIComponent(ORIGIN)}&widget_referrer=${encodeURIComponent(ORIGIN)}`
}

function page(src: string): string {
	return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style>
</head><body><iframe id="yt" src="${src}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
<script>
// Keeps the video's current time in window.__ytTime (YouTube's iframe API sends it to the page that
// listens), so the native player can hand the video to the floating window at the same second.
window.__ytTime = 0;
var f = document.getElementById('yt');
function listen() { try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1 }), '*'); } catch (e) {} }
f.addEventListener('load', function () { listen(); setTimeout(listen, 1000); setTimeout(listen, 3000); });
window.addEventListener('message', function (e) {
	try { var d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; if (d && d.info && typeof d.info.currentTime === 'number') window.__ytTime = d.info.currentTime; } catch (x) {}
});
</script></body></html>`
}

/** The WebView `source` for [mode]. */
export function playerSource(
	mode: PlayerMode,
	videoId: string,
	start = 0,
): Record<string, unknown> {
	if (mode === 'direct')
		return {
			uri: embedUrl('www.youtube.com', videoId, start),
			headers: { Referer: `${ORIGIN}/` },
		}
	const host =
		mode === 'nocookie' ? 'www.youtube-nocookie.com' : 'www.youtube.com'
	return { html: page(embedUrl(host, videoId, start)), baseUrl: `${ORIGIN}/` }
}
