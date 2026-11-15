import {
	blockUser,
	currentUserId,
	errorMessage,
	isBlocked,
	isFriend,
	ownAccountIds,
} from './relationships'

/** Per account: IDs from the list that were already checked there. */
export type SyncedMap = Record<string, string[]>

export interface SyncResult {
	accountId: string
	blocked: string[]
	alreadyBlocked: number
	skippedFriends: string[]
	failed: { id: string; error: string }[]
	/** True if the account changed mid-run and the run stopped early. */
	interrupted: boolean
}

export interface SyncDeps {
	listIds(): Promise<string[]>
	getSynced(): Promise<SyncedMap>
	saveSynced(map: SyncedMap): Promise<void>
	isStopped(): boolean
	/** Below: defaults to Discord; replaced in tests. */
	currentUserId?: () => string | undefined
	ownAccountIds?: () => string[]
	isBlocked?: (id: string) => boolean
	isFriend?: (id: string) => boolean
	block?: (id: string) => Promise<void>
	sleep?: (ms: number) => Promise<void>
	/** Pause between blocks, to stay clear of Discord's rate limit. */
	delayMs?: number
}

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Seconds Discord asked us to wait, if this was a rate limit error. */
function retryAfter(error: unknown): number | undefined {
	const e = error as { status?: number; body?: { retry_after?: number } }
	if (e?.status === 429 || e?.body?.retry_after !== undefined)
		return Number(e?.body?.retry_after ?? 5)
	return undefined
}

/**
 * Blocks everyone on the list that this account hasn't blocked yet.
 * Each person is checked once per account, so a later manual unblock on
 * that account is respected. Friends are skipped (blocking unfriends).
 */
export async function syncAccount(deps: SyncDeps): Promise<SyncResult | null> {
	const me = deps.currentUserId ?? currentUserId
	const own = new Set((deps.ownAccountIds ?? ownAccountIds)())
	const blocked = deps.isBlocked ?? isBlocked
	const friend = deps.isFriend ?? isFriend
	const block = deps.block ?? blockUser
	const sleep = deps.sleep ?? defaultSleep
	const delay = deps.delayMs ?? 1500

	const accountId = me()
	if (!accountId) return null

	const result: SyncResult = {
		accountId,
		blocked: [],
		alreadyBlocked: 0,
		skippedFriends: [],
		failed: [],
		interrupted: false,
	}

	const synced = await deps.getSynced()
	const done = new Set(synced[accountId] ?? [])
	const save = () => deps.saveSynced({ ...synced, [accountId]: [...done] })
	const pending = (await deps.listIds()).filter(
		// Never block yourself or any account signed in on this device.
		id => !done.has(id) && id !== accountId && !own.has(id),
	)

	let blockedAny = false
	for (const id of pending) {
		if (deps.isStopped() || me() !== accountId) {
			result.interrupted = true
			break
		}
		if (blocked(id)) {
			result.alreadyBlocked++
			done.add(id)
			continue
		}
		if (friend(id)) {
			result.skippedFriends.push(id)
			done.add(id)
			continue
		}

		if (blockedAny) await sleep(delay)
		for (let attempt = 0; ; attempt++) {
			try {
				await block(id)
				result.blocked.push(id)
				done.add(id)
				blockedAny = true
				break
			} catch (e) {
				const wait = retryAfter(e)
				if (wait !== undefined && attempt === 0) {
					await sleep(wait * 1000 + 250)
					continue
				}
				// Not marked as done: tried again next time.
				result.failed.push({ id, error: errorMessage(e) })
				break
			}
		}
		await save()
	}

	await save()
	return result
}

/** One-line summary for a toast, or null if nothing happened. */
export function describeResult(r: SyncResult, manual: boolean): string | null {
	const parts: string[] = []
	if (r.blocked.length)
		parts.push(
			`Blocked ${r.blocked.length} user${r.blocked.length === 1 ? '' : 's'} from your list`,
		)
	if (r.skippedFriends.length)
		parts.push(
			`skipped ${r.skippedFriends.length} friend${r.skippedFriends.length === 1 ? '' : 's'}`,
		)
	if (r.failed.length) parts.push(`${r.failed.length} failed (will retry)`)
	if (parts.length) return `${parts.join(', ')} on this account`
	return manual
		? 'Everyone on your list is already handled on this account'
		: null
}
