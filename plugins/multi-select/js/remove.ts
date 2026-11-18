import { Stores } from '@valenced/discord/flux'
import { findModule } from './find'

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

/** Whether you may delete [messageId] in [channelId]: your own, or anyone's with Manage Messages. */
export function canDelete(channelId: string, messageId: string): boolean {
	try {
		const message = (Stores as any).MessageStore?.getMessage?.(
			channelId,
			messageId,
		)
		if (!message) return false
		if (message.author?.id && message.author.id === me()) return true
		const channel = (Stores as any).ChannelStore?.getChannel?.(channelId)
		if (!channel?.guild_id) return false
		return !!(Stores as any).PermissionStore?.can?.(MANAGE_MESSAGES, channel)
	} catch {
		return false
	}
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Deletes [ids] one after another, through Discord's own action (so the chat updates the usual
 * way). A short gap between them keeps well clear of Discord's rate limit.
 */
export async function deleteAll(
	channelId: string,
	ids: string[],
	progress: (done: number) => void,
): Promise<{ deleted: string[]; failed: string[] }> {
	const deleted: string[] = []
	const failed: string[] = []
	for (const id of ids) {
		try {
			await actions.deleteMessage(channelId, id)
			deleted.push(id)
		} catch {
			failed.push(id)
		}
		progress(deleted.length + failed.length)
		await wait(350)
	}
	return { deleted, failed }
}
