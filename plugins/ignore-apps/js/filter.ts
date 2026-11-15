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

/** Builds the check used on every incoming message from the current settings. */
export function createMessageFilter(getSettings: () => Settings | undefined) {
	return (message: RawMessage | undefined): boolean => {
		const settings = getSettings()
		const author = message?.author
		if (!settings || !author?.id) return false

		const listed = settings.ignored.some(e => e.id === author.id)
		const hidden = listed || (settings.hideAllApps && author.bot === true)
		if (!hidden) return false

		if (settings.keepMyCommandReplies) {
			const me = userStore()?.getCurrentUser?.()?.id
			const invoker =
				message?.interaction_metadata?.user?.id ??
				message?.interaction?.user?.id
			if (me && invoker === me) return false
		}

		return true
	}
}
