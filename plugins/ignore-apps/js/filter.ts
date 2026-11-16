import { Stores } from '@valenced/discord/flux'

export interface Settings {
	/** IDs of ignored apps (any user ID works). */
	ignored: { id: string; label: string; addedAt: number }[]
	/** Hide messages from every bot / app, not just the listed ones. */
	hideAllApps: boolean
	/** Keep app replies to slash commands you ran yourself. */
	keepMyCommandReplies: boolean
}

export const DEFAULT_SETTINGS: Settings = {
	ignored: [],
	hideAllApps: false,
	keepMyCommandReplies: true,
}

/** Raw message objects as they arrive from Discord's API and gateway. */
interface RawMessage {
	author?: { id?: string; bot?: boolean }
	interaction_metadata?: { user?: { id?: string } }
	interaction?: { user?: { id?: string } }
}

interface User {
	id: string
	username: string
	globalName?: string | null
	bot?: boolean
}

interface UserStore {
	getUser(userId: string): User | undefined
	getCurrentUser(): User | undefined
}

const SNOWFLAKE = /^\d{17,20}$/

function userStore() {
	return Stores.UserStore as unknown as UserStore | undefined
}

/** Trims input and strips a `<@id>` / `<@!id>` mention. */
export function parseUserId(input: string): string | null {
	const id = input.trim().replace(/^<@!?(\d+)>$/, '$1')
	return SNOWFLAKE.test(id) ? id : null
}

export function describeUser(userId: string): string {
	const user = userStore()?.getUser?.(userId)
	if (!user) return userId
	return user.globalName
		? `${user.globalName} (@${user.username})`
		: `@${user.username}`
}

/** `true` if Discord knows this ID and it is a person, not an app. */
export function isKnownHuman(userId: string): boolean {
	return userStore()?.getUser?.(userId)?.bot === false
}

/** Settings in the shape the per-message check needs, rebuilt only when settings change. */
export interface FilterSnapshot {
	/** False when nothing can be hidden: every message passes without further checks. */
	active: boolean
	ids: Set<string>
	hideAllApps: boolean
	keepMyCommandReplies: boolean
}

export function snapshotOf(settings: Settings | undefined): FilterSnapshot {
	const ids = new Set((settings?.ignored ?? []).map(e => e.id))
	const hideAllApps = !!settings?.hideAllApps
	return {
		active: ids.size > 0 || hideAllApps,
		ids,
		hideAllApps,
		keepMyCommandReplies: settings?.keepMyCommandReplies ?? true,
	}
}

/**
 * The per-message check. Runs for every message Discord receives, so it does as little as
 * possible: a set lookup, and the store is resolved once here rather than on first use.
 */
export function createMessageFilter(getSnapshot: () => FilterSnapshot) {
	const users = userStore()
	return (message: RawMessage | undefined): boolean => {
		const snap = getSnapshot()
		if (!snap.active) return false
		const author = message?.author
		if (!author?.id) return false

		const hidden =
			snap.ids.has(author.id) || (snap.hideAllApps && author.bot === true)
		if (!hidden) return false

		if (snap.keepMyCommandReplies) {
			const invoker =
				message?.interaction_metadata?.user?.id ??
				message?.interaction?.user?.id
			if (invoker && invoker === (users ?? userStore())?.getCurrentUser?.()?.id)
				return false
		}
		return true
	}
}
