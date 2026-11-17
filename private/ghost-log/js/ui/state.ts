/**
 * The JS-side mirror of the native log, and the storage-health state.
 *
 * The log lives in native storage, so it is not reactive like jsonStorage. We cache it here and
 * fan out to subscribers whenever a load/clear completes. Pages subscribe and refresh on mount.
 *
 * resetState() clears every module-scope structure here -- the old plugin's equivalents were only
 * cleared where someone remembered to, and requireReload() masked the rest.
 */

import * as react from '@valenced/react'
import { native } from '../lib/bridge'
import { scheduleBackup } from '../lib/capture'
import { loadRichContent, rehydrateEntries } from '../lib/richContent'
import { getSettings } from '../settings'
import { reportError } from '../shared/report'

// Edit history's clear/remove live with the rest of the edit machinery; re-exported so the pages
// have one import for "change the log". Same contract as the deleted-log ones below.
export { clearEdits, removeEditRecord, removeEditRecords } from '../lib/edits'

const DEBUG: boolean = false

const TAG = '[GhostLogNG:state]'

export interface DeletedMessage {
	id: string
	/** You deleted it yourself (only logged with "count own messages" on). */
	byYou?: boolean
	channelId: string
	guildId?: string
	authorId: string
	authorName: string
	channelName: string
	guildName?: string
	authorAvatar?: string
	guildIcon?: string
	content: string
	attachments?: any[]
	embeds?: any[]
	// Captured so a message rebuilt from the log is not a stripped-down copy of itself. A single
	// delete keeps its real record in the store (the delete event is blocked), but a BULK
	// delete does not -- those messages are genuinely removed and come back only through
	// render-restore, which builds from these fields. Without them a purged reply lost its reply
	// context and every mention rendered as raw markup.
	mentions?: any[]
	mentionRoles?: string[]
	mentionEveryone?: boolean
	editedAt?: number
	messageType?: number
	flags?: number
	pinned?: boolean
	tts?: boolean
	referencedMessage?: {
		id: string
		channelId: string
		author?: any
		content?: string
	}
	sentAt: number
	deletedAt: number
}

let cache: DeletedMessage[] = []
let loading = false
const listeners = new Set<() => void>()

// Bumped on every mutation of `cache`. The render-restore hook runs on MessageStore.getMessages
// -- i.e. several times per frame -- and needs an O(1) way to answer "has the log changed since
// the last time I built records for this channel?" without rescanning or rebuilding anything.
let version = 0

export function getLogVersion(): number {
	return version
}

/**
 * Ghost Log+: what changed, so the chat hook only redoes work for the channels it concerns.
 *
 * The original had one counter for everything: a deletion caught in any channel, a media file
 * landing, even a storage-status refresh after an auto-backup, all made the hook re-index the
 * whole log and throw away the merged result of the chat on screen. Now:
 *  - notify()            entries were added to or removed from the log (capture, remove, trim,
 *                        reload, clear). The hook regroups the log once and keeps every channel
 *                        whose entries are the same objects as before.
 *  - notify(channelIds)  entries of these channels were changed in place (saved media landing)
 *  - notifyUi()          nothing in the log changed; pages just need to re-render
 *
 * (An earlier version treated "the log was trimmed" as a whole-log reset. A log at its size limit
 * is trimmed on every capture, so that reset every channel on every caught deletion.)
 */
let structure = 0
const channelContent = new Map<string, number>()

/**
 * Ghost Log+ 1.0.6: what was added and removed since the chat hook last looked, so it can update
 * just those channels. 1.0.5 regrouped and sorted the whole log after every capture, which with a
 * large log was one long call (up to 144 ms in the Performance Monitor) per caught deletion.
 * `full` means "start over" (reload, clear, or more changes than are worth replaying).
 */
interface LogChanges {
	full: boolean
	added: DeletedMessage[]
	removed: DeletedMessage[]
}
let changes: LogChanges = { full: true, added: [], removed: [] }
const MAX_JOURNAL = 2000

function journal(added: DeletedMessage[], removed: DeletedMessage[]) {
	if (changes.full) return
	if (
		changes.added.length +
			changes.removed.length +
			added.length +
			removed.length >
		MAX_JOURNAL
	) {
		changes = { full: true, added: [], removed: [] }
		return
	}
	changes.added.push(...added)
	changes.removed.push(...removed)
}

/** Hands the changes since the last call to the chat hook and starts a new journal. */
export function takeLogChanges(): LogChanges {
	const taken = changes
	changes = { full: false, added: [], removed: [] }
	return taken
}

/**
 * Entries were added to or removed from the log. With [added]/[removed] the chat hook updates
 * just those channels; without them it regroups everything (reload, clear).
 */
function notifyStructure(added?: DeletedMessage[], removed?: DeletedMessage[]) {
	if (added === undefined && removed === undefined) {
		changes = { full: true, added: [], removed: [] }
		loggedIdsStale = true
	} else {
		journal(added ?? [], removed ?? [])
		// Removals first: an entry caught again is in both lists, the old copy and the new.
		if (!loggedIdsStale) {
			for (const entry of removed ?? []) loggedIds.delete(entry.id)
			for (const entry of added ?? []) loggedIds.add(entry.id)
		}
	}
	notify()
}

function notify(channelIds?: Iterable<string>) {
	version++
	if (channelIds === undefined) structure++
	else
		for (const id of channelIds)
			channelContent.set(id, (channelContent.get(id) ?? 0) + 1)
	for (const fn of listeners) fn()
}

function notifyUi() {
	for (const fn of listeners) fn()
}

/** Changes when entries were added to or removed from the log. */
export function getLogStructure(): number {
	return structure
}

/** Changes when [channelId]'s entries were changed in place. */
export function getChannelContentVersion(channelId: string): number {
	return channelContent.get(channelId) ?? 0
}

export function subscribeLog(fn: () => void): () => void {
	listeners.add(fn)
	return () => listeners.delete(fn)
}

// What changed while a refresh was reading native, so the snapshot it gets back can be merged
// rather than swallowed. A refresh used to assign its snapshot straight to the cache: anything
// caught between the read and the assign vanished from the chat and the guards until the next
// refresh, and a failed read set the cache to [] -- every restored message gone and the ghost
// action guards off for the rest of the session. Only recorded while a refresh is in flight.
const addedDuringLoad = new Set<string>()
const removedDuringLoad = new Set<string>()
let clearedDuringLoad = false
// Captures native has not answered yet (capture.ts settles them). A snapshot read before native
// wrote one cannot contain it, whenever the capture started. Bounded by captures in flight.
const unsettled = new Set<string>()

/** Native has answered a capture (or failed it): a refresh may stop carrying this id over. */
export function settleCapture(messageId: string) {
	unsettled.delete(messageId)
}

/**
 * Reload the cache from native, merged with what happened while it was reading. On a failed read
 * the cache is kept as it was and the error reported.
 */
export async function refreshLog(): Promise<DeletedMessage[]> {
	if (loading) return cache
	loading = true
	addedDuringLoad.clear()
	removedDuringLoad.clear()
	clearedDuringLoad = false
	try {
		const raw = await native.getLog()
		const entries = raw ? (JSON.parse(raw) as DeletedMessage[]) : []
		if (!Array.isArray(entries))
			throw new Error('getLog returned something other than a list')
		// Metadata only. Saved media is resolved lazily per channel by rehydrateChannel -- see
		// loadRichContent's note for why doing it all here was the out-of-memory kill.
		const rich = await loadRichContent(entries.map(entry => entry.id))
		// Captures still staged are folded in by their own flush; everything else is in `cache`.
		// A clear while reading: the snapshot is from before it, so none of it is current.
		const snapshot = clearedDuringLoad
			? []
			: entries
					.filter(entry => entry?.id && !removedDuringLoad.has(entry.id))
					.map(entry => ({ ...entry, ...(rich.get(entry.id) ?? {}) }))
		// Carried over from the current cache: catches native had not written when the read started,
		// and ones made during the read. Their in-session copy wins over the snapshot's, since it can
		// hold media native saved after the read. Newest first, like the log.
		const carried = cache.filter(
			entry =>
				(unsettled.has(entry.id) || addedDuringLoad.has(entry.id)) &&
				!removedDuringLoad.has(entry.id),
		)
		const carriedIds = new Set(carried.map(entry => entry.id))
		// Assign the cache ONCE, after rich content is merged. Assigning text-only entries first
		// exposed an intermediate state to the render-restore hook, which memoized MessageRecords
		// with empty attachments/embeds and never rebuilt them once the rich content landed.
		cache = [...carried, ...snapshot.filter(entry => !carriedIds.has(entry.id))]
		if (DEBUG) console.log(`${TAG} cache loaded ${cache.length} entries`)
		notifyStructure()
	} catch (error) {
		// Keep what we had: an empty cache here un-restores every message and turns the guards off.
		reportError(`${TAG} getLog failed; keeping the cached log:`, error)
	} finally {
		loading = false
		addedDuringLoad.clear()
		removedDuringLoad.clear()
		clearedDuringLoad = false
	}
	return cache
}

// Channels whose saved media has already been resolved (or is in flight). The render-restore hook
// runs several times per frame, so this has to be an O(1) "have I already asked?" check.
const rehydratedChannels = new Set<string>()
// Bounded retries per channel, so a permanently broken blob does not turn the render path into a
// retry loop while a transient native failure still gets another chance.
const rehydrateAttempts = new Map<string, number>()
const REHYDRATE_MAX_ATTEMPTS = 3

/**
 * Resolve saved media for one channel's entries, once. Called from the render path, which is why it
 * must never block: it fires the work and bumps the log version when it lands, so memoized records
 * rebuild on a later frame with the local URIs in place.
 */
export function rehydrateChannel(channelId: string): void {
	if (!channelId || rehydratedChannels.has(channelId)) return
	rehydratedChannels.add(channelId)
	const entries = cache.filter(entry => entry.channelId === channelId)
	if (!entries.length) {
		rehydratedChannels.delete(channelId)
		return
	}
	const attempt = (rehydrateAttempts.get(channelId) ?? 0) + 1
	rehydrateAttempts.set(channelId, attempt)

	void rehydrateEntries(entries)
		.then(({ changed, complete }) => {
			// Anything still unresolved gets another pass on a later frame, up to the attempt cap.
			if (!complete && attempt < REHYDRATE_MAX_ATTEMPTS)
				rehydratedChannels.delete(channelId)
			if (changed) notify([channelId])
		})
		.catch(error => {
			if (attempt < REHYDRATE_MAX_ATTEMPTS) rehydratedChannels.delete(channelId)
			reportError(`${TAG} media rehydrate failed:`, error)
		})
}

export interface StorageStatus {
	baseDir: string
	requestedDir: string
	usingFallback: boolean
	error?: string | null
	lastWriteError?: string | null
	entries: number
	edits?: number
	/** The folder was sealed by another install and waits for the recovery password. */
	locked?: boolean
	recoverySet?: boolean
	/** The recovery password covers the key new files are written with. */
	recoveryCurrent?: boolean
	/** 'keystore' when Android's Keystore protects the keys, 'file' when it was unavailable. */
	deviceKey?: 'keystore' | 'file'
	/** The log files exist but could not be read (native's reason, if any, in `unreadableReason`). */
	unreadable?: boolean
	unreadableReason?: string | null
	/** Anything else native reports is passed through untouched. */
	[key: string]: unknown
}

let storageStatus: StorageStatus | undefined

export function getStorageStatus(): StorageStatus | undefined {
	return storageStatus
}

export async function refreshStorageStatus(): Promise<
	StorageStatus | undefined
> {
	try {
		const raw = await native.getStorageStatus()
		storageStatus = raw ? (JSON.parse(raw) as StorageStatus) : undefined
		// No paths in the text (AS-08): the Backup page shows both.
		if (storageStatus?.usingFallback) {
			reportError(
				`${TAG} storage fallback: the chosen folder is unusable; writing to app storage instead`,
			)
		}
	} catch (error) {
		reportError(`${TAG} getStorageStatus failed:`, error)
	}
	// The log itself did not change: only the pages showing the status need to hear this.
	notifyUi()
	return storageStatus
}

/** React hook: the current native storage health, refreshed on mount. */
export function useStorageStatus(): StorageStatus | undefined {
	const { React } = react
	const [status, setStatus] = React.useState<StorageStatus | undefined>(
		getStorageStatus(),
	)

	React.useEffect(() => {
		const unsub = subscribeLog(() => setStatus(getStorageStatus()))
		void refreshStorageStatus()
		return unsub
	}, [])

	return status
}

/**
 * After a clear or remove that native confirmed: rewrite the backup too, or a later Restore brings
 * back what the user just removed "for good". Only when there is a backup to keep in step (auto
 * backup on, or one was made).
 */
function backupAfterRemoval() {
	try {
		const cfg = getSettings()
		if (cfg.autoBackupEnabled || cfg.lastBackupAt) scheduleBackup(cfg)
	} catch (error) {
		reportError(`${TAG} could not schedule the backup rewrite:`, error)
	}
}

/** Drop ids from the staged captures and the cache, and note them for a refresh in flight. */
function dropFromCache(ids: Set<string>) {
	for (let i = pendingAdds.length - 1; i >= 0; i--)
		if (ids.has(pendingAdds[i].id)) pendingAdds.splice(i, 1)
	for (const id of ids) {
		unsettled.delete(id)
		addedDuringLoad.delete(id)
		if (loading) removedDuringLoad.add(id)
	}
	const removed: DeletedMessage[] = []
	cache = cache.filter(entry => {
		if (!ids.has(entry.id)) return true
		removed.push(entry)
		return false
	})
	notifyStructure([], removed)
}

/**
 * Empties the deleted log. True only when native confirmed it (it refuses while the log is locked).
 * On false or an error the JS cache is left as native has it, and the failure reported.
 */
export async function clearNativeLog(): Promise<boolean> {
	let ok = false
	try {
		ok = (await native.clearLog()) === true
	} catch (error) {
		reportError(`${TAG} clearLog failed:`, error)
		void refreshLog()
		return false
	}
	if (!ok) {
		reportError(
			`${TAG} clearLog refused (the log is locked or could not be written)`,
		)
		void refreshLog()
		return false
	}
	cache = []
	pendingAdds.length = 0
	unsettled.clear()
	addedDuringLoad.clear()
	if (loading) clearedDuringLoad = true
	if (addTimer !== undefined) {
		clearTimeout(addTimer)
		addTimer = undefined
	}
	rehydratedChannels.clear()
	rehydrateAttempts.clear()
	notifyStructure()
	backupAfterRemoval()
	return true
}

// Captures arriving in a burst are staged here and folded into `cache` once, on a trailing timer.
//
// This used to rebuild the whole array and fan out to every listener PER CATCH:
// `cache = [entry, ...cache.filter(...)]` is O(entries), so a 500-message purge copied ~125k
// elements and fired 500 render-cache invalidations. That was the JS half of the same quadratic
// blow-up the native side had, and fixing only the native half left the stall in place.
const pendingAdds: DeletedMessage[] = []
let addTimer: ReturnType<typeof setTimeout> | undefined
const ADD_FLUSH_MS = 250

function flushAdds() {
	addTimer = undefined
	if (!pendingAdds.length) return
	// Newest first, matching the native log's own order.
	const batch = pendingAdds.splice(0, pendingAdds.length).reverse()
	const incoming = new Set(batch.map(entry => entry.id))
	const removed: DeletedMessage[] = []
	cache = [
		...batch,
		...cache.filter(e => {
			if (!incoming.has(e.id)) return true
			removed.push(e)
			return false
		}),
	]
	// The same cap native trims to on every catch. Without it a mass delete grew this copy (and the
	// ghosts drawn from it) until the Ghost Log page was next opened, and entries native had already
	// dropped still showed as deleted, with Remove failing on them.
	const { maxEntries, unlimitedEntries } = getSettings()
	if (!unlimitedEntries && maxEntries > 0 && cache.length > maxEntries) {
		removed.push(...cache.slice(maxEntries))
		cache = cache.slice(0, maxEntries)
	}
	notifyStructure(batch, removed)
}

/** Keep the JS cache in step with a freshly captured entry (native store is the source of truth). */
export function addToCache(entry: DeletedMessage) {
	pendingAdds.push(entry)
	unsettled.add(entry.id)
	removedDuringLoad.delete(entry.id)
	if (loading) addedDuringLoad.add(entry.id)
	// This channel has a new entry whose saved media has not been resolved, so let the render path
	// ask again rather than leaving the new message pointing at a CDN url that may already be dead.
	rehydratedChannels.delete(entry.channelId)
	rehydrateAttempts.delete(entry.channelId)
	if (addTimer === undefined) addTimer = setTimeout(flushAdds, ADD_FLUSH_MS)
}

/**
 * Swap a cached entry's media for what native actually saved (objects carrying `localFile`), then let
 * its channel resolve the saved copies. The entry may still be staged rather than in `cache`.
 */
export function updateCachedMedia(
	messageId: string,
	attachments?: any[],
	embeds?: any[],
) {
	const entry =
		pendingAdds.find(e => e.id === messageId) ??
		cache.find(e => e.id === messageId)
	if (!entry) return
	if (Array.isArray(attachments)) entry.attachments = attachments
	if (Array.isArray(embeds)) entry.embeds = embeds
	rehydratedChannels.delete(entry.channelId)
	rehydrateAttempts.delete(entry.channelId)
	// A staged entry is picked up by the flush, which notifies; one already in the cache needs it now.
	if (!pendingAdds.includes(entry)) notify([entry.channelId])
}

/**
 * Takes one deletion out of the log, here and in native. True only when native confirmed it had the
 * entry and removed it; otherwise the cache is reloaded from native and the failure reported.
 */
export async function removeFromLog(messageId: string): Promise<boolean> {
	let ok = false
	try {
		ok = (await native.removeEntry(messageId)) === true
	} catch (error) {
		reportError(`${TAG} removeEntry failed:`, error)
		void refreshLog()
		return false
	}
	if (!ok) {
		reportError(`${TAG} removeEntry: native did not have that entry`)
		void refreshLog()
		return false
	}
	dropFromCache(new Set([messageId]))
	backupAfterRemoval()
	return true
}

/**
 * Takes several deletions out of the log in one native write (Select mode, remove from chat). True
 * when native removed every one. When it removed fewer, the cache is reloaded from native (the truth
 * about which ones went) and the answer is false.
 */
export async function removeManyFromLog(
	messageIds: string[],
): Promise<boolean> {
	const unique = new Set(messageIds)
	if (!unique.size) return true
	let removed = -1
	try {
		const result = await native.removeEntries([...unique])
		removed = typeof result === 'number' ? result : -1
	} catch (error) {
		reportError(`${TAG} removeEntries failed:`, error)
		void refreshLog()
		return false
	}
	if (removed < unique.size) {
		reportError(
			`${TAG} removeEntries removed ${Math.max(removed, 0)} of ${unique.size}`,
		)
		if (removed > 0) backupAfterRemoval()
		void refreshLog()
		return false
	}
	dropFromCache(unique)
	backupAfterRemoval()
	return true
}

/** Fold any staged captures in now. Call before anything that reads the cache as authoritative. */
export function flushPendingAdds() {
	if (addTimer !== undefined) {
		clearTimeout(addTimer)
		addTimer = undefined
	}
	flushAdds()
}

export function getCachedLog(): DeletedMessage[] {
	return cache
}

let loggedIds = new Set<string>()
/** Ghost Log+ 1.0.6: rebuilt only after a reload or clear; captures and removals update it in place. */
let loggedIdsStale = true

/**
 * Whether a message id is in the deleted log, in O(1). Messages restored after a reload exist only in
 * what render-restore hands the chat, so `MessageStore.getMessage` cannot find them; this can.
 * Staged captures count too, so a message is known the moment it is caught.
 */
export function isLoggedId(messageId: string): boolean {
	if (loggedIdsStale) {
		loggedIdsStale = false
		loggedIds = new Set(cache.map(entry => entry.id))
	}
	if (loggedIds.has(messageId)) return true
	for (const entry of pendingAdds) if (entry.id === messageId) return true
	return false
}

/** React hook: subscribe to native log updates and trigger a load on first mount. */
export function useLog(): DeletedMessage[] {
	const { React } = react
	const [entries, setEntries] = React.useState<DeletedMessage[]>(getCachedLog())

	React.useEffect(() => {
		const unsub = subscribeLog(() => setEntries(getCachedLog()))
		void refreshLog()
		return unsub
	}, [])

	return entries
}

/** Clears every module-scope structure, for stop() (requireReload still runs, but the next start
 *  must not inherit a half-lived session's state). */
export function resetState() {
	loggedIdsStale = true
	changes = { full: true, added: [], removed: [] }
	cache = []
	loading = false
	addedDuringLoad.clear()
	removedDuringLoad.clear()
	clearedDuringLoad = false
	unsettled.clear()
	version = 0
	storageStatus = undefined
	pendingAdds.length = 0
	if (addTimer !== undefined) {
		clearTimeout(addTimer)
		addTimer = undefined
	}
	rehydratedChannels.clear()
	rehydrateAttempts.clear()
	loggedIds = new Set()
	loggedIdsStale = true
	listeners.clear()
}
