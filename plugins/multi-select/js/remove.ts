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

/**
 * Deletes [items] one after another, in any channels, through Discord's own action (so each chat
 * updates the usual way). A short gap between them keeps well clear of Discord's rate limit.
 */
export async function deleteAll(
	items: Picked[],
): Promise<{ deleted: Picked[]; failed: Picked[] }> {
	const deleted: Picked[] = []
	const failed: Picked[] = []
	for (const item of items) {
		try {
			await actions.deleteMessage(item.channelId, item.messageId)
			deleted.push(item)
		} catch {
			failed.push(item)
		}
		await wait(350)
	}
	return { deleted, failed }
}
