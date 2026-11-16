/**
 * The resizing itself, kept free of Discord and Valenced so it can be tested on its own.
 *
 * Discord's `createMessageContent` builds the data a chat row is drawn from. Media in it (uploads
 * under `attachments`, link previews and GIFs under `embeds`) carries a `width` and `height`, and
 * the row is laid out from those. Scaling both by the same factor makes the preview smaller and
 * keeps its shape; the URLs are untouched, so the full-size viewer and playback are as before.
 *
 * Nothing is edited in place: Discord may reuse or freeze these objects, so every object on the
 * way to a changed size is copied and everything else is returned as it was.
 */

export interface ResizeOptions {
	/** What is left of the size: 0.65 means 35% smaller. */
	scale: number
	uploads: boolean
	embeds: boolean
	/** The screen, in layout units. A size larger than it is the file's own size, not a display size. */
	screenWidth: number
	screenHeight: number
}

/** Counters and a few samples, for the settings page. */
export interface ResizeStats {
	messages: number
	resized: number
	samples: string[]
}

export const newStats = (): ResizeStats => ({
	messages: 0,
	resized: 0,
	samples: [],
})

const MAX_SAMPLES = 12
const MAX_DEPTH = 5
/** Never shrink something whose longer side is already this small (icons, tiny thumbnails). */
const MIN_SIDE = 96
/** Sections of the message content that hold media, and whether they count as uploads. */
const SECTIONS: Record<string, 'uploads' | 'embeds'> = {
	attachments: 'uploads',
	embeds: 'embeds',
}

const isPlain = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value)

/** The new size for [width] x [height], or undefined to leave it alone. */
export function scaled(
	width: number,
	height: number,
	options: ResizeOptions,
): { width: number; height: number } | undefined {
	if (!(width > 0) || !(height > 0)) return undefined
	if (Math.max(width, height) <= MIN_SIDE) return undefined
	let w = width
	let h = height
	// Larger than the screen: this is the file's own size, which Discord will fit to the chat
	// itself. Fit it to roughly what Discord allows first, so the scale shows afterwards.
	const boxW = options.screenWidth * 0.72
	const boxH = options.screenHeight * 0.45
	if (w > options.screenWidth || h > options.screenHeight) {
		const fit = Math.min(boxW / w, boxH / h, 1)
		w *= fit
		h *= fit
	}
	w = Math.round(w * options.scale)
	h = Math.round(h * options.scale)
	if (w < 1 || h < 1) return undefined
	return { width: w, height: h }
}

function resizeNode(
	node: unknown,
	options: ResizeOptions,
	stats: ResizeStats,
	path: string,
	depth: number,
): unknown {
	if (depth > MAX_DEPTH || node == null || typeof node !== 'object') return node
	if (Array.isArray(node)) {
		let copy: unknown[] | undefined
		for (let i = 0; i < node.length; i++) {
			const next = resizeNode(node[i], options, stats, `${path}[]`, depth + 1)
			if (next !== node[i]) {
				copy ??= node.slice()
				copy[i] = next
			}
		}
		return copy ?? node
	}
	if (!isPlain(node)) return node

	let copy: Record<string, unknown> | undefined
	const { width, height } = node
	if (typeof width === 'number' && typeof height === 'number') {
		const size = scaled(width, height, options)
		if (size) {
			copy = { ...node, ...size }
			stats.resized++
			if (stats.samples.length < MAX_SAMPLES)
				stats.samples.push(
					`${path}: ${width}x${height} -> ${size.width}x${size.height}`,
				)
		}
	}
	for (const key of Object.keys(node)) {
		const value = node[key]
		if (!value || typeof value !== 'object') continue
		const next = resizeNode(value, options, stats, `${path}.${key}`, depth + 1)
		if (next !== value) {
			copy ??= { ...node }
			copy[key] = next
		}
	}
	return copy ?? node
}

/** The message content with its media sizes scaled; the same object when nothing changed. */
export function resizeContent<T>(
	content: T,
	options: ResizeOptions,
	stats: ResizeStats,
): T {
	if (!isPlain(content) || !(options.scale > 0) || options.scale >= 1)
		return content
	stats.messages++
	let copy: Record<string, unknown> | undefined
	for (const [key, kind] of Object.entries(SECTIONS)) {
		if (!options[kind]) continue
		const section = content[key]
		if (!section || typeof section !== 'object') continue
		const next = resizeNode(section, options, stats, key, 0)
		if (next !== section) {
			copy ??= { ...content }
			copy[key] = next
		}
	}
	return (copy ?? content) as T
}
