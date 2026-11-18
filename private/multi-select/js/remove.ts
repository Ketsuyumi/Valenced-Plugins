import { Stores } from '@valenced/discord/flux'
import { findModule } from './find'
import type { Picked } from './selection'

const MANAGE_MESSAGES = 1n << 13n

let actions: any

export function watchActions(): () => void {
	return findModule(
		'actions/MessageActionCreators.tsx',
		['deleteMessage', 'editMessage', 'startEditMessage'],
		(mod: any) => {
			const host = typeof mod?.deleteMessage === 'function' ? mod : mod?.default
			if (typeof host?.deleteMessage === 'function') actions = host
		},
	)
}

export const canDeleteAtAll = () => !!actions

const me = () => (Stores as any).UserStore?.getCurrentUser?.()?.id

/**
 * Whether you may delete [item]: your own message, or anyone's in a server where you have Manage
 * Messages. Uses the author kept when it was selected, so it works for channels you have left.
 */
export function canDelete(item: Picked): boolean {
	try {
		let authorId = item.authorId
		if (!authorId)
			authorId = (Stores as any).MessageStore?.getMessage?.(
				item.channelId,
				item.messageId,
			)?.author?.id
		if (authorId && authorId === me()) return true
		const channel = (Stores as any).ChannelStore?.getChannel?.(item.channelId)
		if (!channel?.guild_id) return false
		return !!(Stores as any).PermissionStore?.can?.(MANAGE_MESSAGES, channel)
	} catch {
		return false
	}
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Gap between deletes: a random 3 to 5 seconds, the pacing Discrub uses, so it never looks scripted. */
export const MIN_GAP = 3000
export const MAX_GAP = 5000
const gap = () => MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP)

let stopRequested = false
export let deleting = false
/** Stops a running delete after the message being deleted now. */
export function stopDeleting() {
	if (deleting) stopRequested = true
}

/**
 * Deletes [items] one after another, in any channels, through Discord's own action (so each chat
 * updates the usual way), waiting 3 to 5 seconds between them. Items not reached because of
 * [stopDeleting] are returned in `skipped`.
 */
export async function deleteAll(
	items: Picked[],
	onProgress?: (done: number, total: number) => void,
): Promise<{ deleted: Picked[]; failed: Picked[]; skipped: Picked[] }> {
	const deleted: Picked[] = []
	const failed: Picked[] = []
	deleting = true
	stopRequested = false
	let index = 0
	try {
		for (; index < items.length; index++) {
			if (stopRequested) break
			if (index > 0) await wait(gap())
			if (stopRequested) break
			const item = items[index]
			onProgress?.(index + 1, items.length)
			try {
				await actions.deleteMessage(item.channelId, item.messageId)
				deleted.push(item)
			} catch {
				failed.push(item)
			}
		}
	} finally {
		deleting = false
		stopRequested = false
	}
	return { deleted, failed, skipped: items.slice(index) }
}
