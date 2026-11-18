import { callNativeMethod } from '@valenced/modules/native'

/**
 * The native in-message player (EmbedPlayback.kt): a real Android WebView placed over the embed's
 * thumbnail view and moved with it every frame, so it scrolls with the message.
 */

const call = callNativeMethod as unknown as (name: string, args?: unknown[]) => Promise<any>

export interface InlineState {
	active: boolean
	videoId?: string
	/** Why the last one stopped: "closed", "scrolled", "replaced", "screen". */
	stopped?: string
	/** Seconds into the video when it stopped. */
	time?: number
}

/** Starts it. Resolves "ok", or why not (e.g. "not found" when the thumbnail view isn't on screen). */
export async function startInline(
	videoId: string,
	source: Record<string, unknown>,
	/** Where the thumbnail is, in window coordinates (dp), as Discord passed it to its viewer. */
	rect: { x: number; y: number; width: number; height: number },
): Promise<string> {
	try {
		const result = await call('embedPlayback.inline', [
			videoId,
			JSON.stringify(source),
			rect.x,
			rect.y,
			rect.width,
			rect.height,
		])
		return typeof result === 'string' ? result : 'no answer'
	} catch (e: any) {
		return `native part missing (${e?.message ?? e})`
	}
}

export async function inlineState(): Promise<InlineState> {
	try {
		const raw = await call('embedPlayback.state', [])
		return typeof raw === 'string' ? JSON.parse(raw) : (raw ?? { active: false })
	} catch {
		return { active: false }
	}
}

export async function stopInline(): Promise<void> {
	try {
		await call('embedPlayback.stop', [])
	} catch {}
}
