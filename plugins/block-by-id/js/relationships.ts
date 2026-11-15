import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

/**
 * Discord's relationship type for a blocked user.
 * (0 = none, 1 = friend, 2 = blocked, 3 = incoming request, 4 = outgoing request)
 */
export const RELATIONSHIP_BLOCKED = 2

/** Discord IDs (snowflakes) are 17 to 20 digit numbers. */
const SNOWFLAKE = /^\d{17,20}$/

/** Analytics context Discord expects alongside relationship changes. */
const CONTEXT = { location: 'ContextMenu' }

interface RelationshipActionCreators {
	addRelationship(options: {
		userId: string
		context?: { location: string }
		type?: number
	}): Promise<unknown>
	removeRelationship(
		userId: string,
		context?: { location: string },
	): Promise<unknown>
}

interface HttpRequest {
	url: string
	body?: unknown
	oldFormErrors?: boolean
}

interface HttpModule {
	put(request: HttpRequest): Promise<unknown>
	del(request: HttpRequest): Promise<unknown>
}

interface RelationshipStore {
	isBlocked(userId: string): boolean
	getRelationshipType(userId: string): number
}

interface User {
	id: string
	username: string
	globalName?: string | null
}

interface UserStore {
	getUser(userId: string): User | undefined
	getCurrentUser(): User | undefined
}

/** Normalises user input: trims spaces and strips a `<@id>` / `<@!id>` mention. */
export function parseUserId(input: string): string | null {
	const id = input.trim().replace(/^<@!?(\d+)>$/, '$1')
	return SNOWFLAKE.test(id) ? id : null
}

function getRelationshipActions() {
	const [actions] = lookupModule(
		withProps<RelationshipActionCreators>(
			'addRelationship',
			'removeRelationship',
		),
	)
	return actions as RelationshipActionCreators | undefined
}

/**
 * Discord's REST helper. It adds the account's auth headers itself,
 * so this plugin never touches the token.
 */
function getHttp() {
	const [http] = lookupModule(
		withProps<HttpModule & { getAPIBaseURL(): string }>(
			'getAPIBaseURL',
			'put',
			'del',
		),
	)
	return http as HttpModule | undefined
}

const relationshipUrl = (userId: string) => `/users/@me/relationships/${userId}`

function relationshipStore() {
	return Stores.RelationshipStore as unknown as RelationshipStore | undefined
}

function userStore() {
	return Stores.UserStore as unknown as UserStore | undefined
}

export function isBlocked(userId: string): boolean {
	return relationshipStore()?.isBlocked?.(userId) ?? false
}

export function isCurrentUser(userId: string): boolean {
	return userStore()?.getCurrentUser?.()?.id === userId
}

/** A display name if Discord already has this user cached, else the ID. */
export function describeUser(userId: string): string {
	const user = userStore()?.getUser?.(userId)
	if (!user) return userId
	return user.globalName
		? `${user.globalName} (@${user.username})`
		: `@${user.username}`
}

export async function blockUser(userId: string): Promise<void> {
	const actions = getRelationshipActions()
	if (actions) {
		await actions.addRelationship({
			userId,
			context: CONTEXT,
			type: RELATIONSHIP_BLOCKED,
		})
		return
	}

	const http = getHttp()
	if (!http)
		throw new Error("Couldn't find Discord's relationship or HTTP module")

	await http.put({
		url: relationshipUrl(userId),
		body: { type: RELATIONSHIP_BLOCKED },
		oldFormErrors: true,
	})
}

export async function unblockUser(userId: string): Promise<void> {
	const actions = getRelationshipActions()
	if (actions) {
		await actions.removeRelationship(userId, CONTEXT)
		return
	}

	const http = getHttp()
	if (!http)
		throw new Error("Couldn't find Discord's relationship or HTTP module")

	await http.del({ url: relationshipUrl(userId), oldFormErrors: true })
}

/** Pulls a readable message out of Discord's HTTP errors. */
export function errorMessage(error: unknown): string {
	const e = error as {
		body?: { message?: string }
		status?: number
		message?: string
	}
	if (e?.body?.message) return e.body.message
	if (e?.status === 404) return 'No user exists with that ID'
	return e?.message ?? String(error)
}
