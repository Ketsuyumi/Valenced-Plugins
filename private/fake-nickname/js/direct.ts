import { fastNickname, nicknameEntries, store } from './state'

/**
 * Fast mode: nicknames written into Discord's member data.
 *
 * GuildMemberStore.getMember is one of the most-called functions in the app (340,000 calls in an
 * hour in the Performance Monitor). Hooking it costs a few microseconds per call however little
 * the hook does, which made this plugin the largest total on the list. Here nothing is hooked:
 * for the server being viewed, each renamed person's member record gets its `nick` replaced, and
 * that is done again whenever the member store changes (Discord swaps in a fresh record when a
 * member updates). The cost is one getMember per renamed person per store change.
 *
 * The real nick of every touched record is remembered and put back when the nickname is removed,
 * the mode is switched off or the plugin stops. If a record turns out to be read-only, fast mode
 * reports failure and names.ts goes back to the hook.
 */

interface Member {
	nick?: unknown
	userId?: unknown
}

/** Touched member record -> the nick Discord gave it. */
const originals = new Map<Member, unknown>()

/**
 * Display names, the same way (1.2.0): UserUtils' getName / getGlobalName / getFormattedName read
 * the user record's `globalName`, so writing the fake nickname there lets those three go unhooked.
 * Touched record -> its real globalName.
 */
interface UserRecord {
	id?: unknown
	globalName?: unknown
}
const userOriginals = new Map<UserRecord, unknown>()
let users: any
/** Whether display names are written into user records (else names.ts hooks UserUtils). */
let usersDirect = false
export const usersAreDirect = () => usersDirect

function setGlobalName(user: UserRecord, nick: string): boolean {
	if (user.globalName === nick) return false
	if (!userOriginals.has(user)) userOriginals.set(user, user.globalName)
	user.globalName = nick
	if (user.globalName !== nick) throw new Error('user record is read-only')
	return true
}

function restoreUser(user: UserRecord) {
	try {
		user.globalName = userOriginals.get(user)
	} catch {}
	userOriginals.delete(user)
}

function restoreUsers() {
	for (const user of [...userOriginals.keys()]) restoreUser(user)
}

/** Writes every fake nickname into its user record. True when something changed. */
function applyUsers(): boolean {
	if (!usersDirect) return false
	let changed = false
	for (const [id, nick] of nicknameEntries()) {
		const user: UserRecord | undefined = users?.getUser?.(id)
		if (user && typeof user === 'object' && setGlobalName(user, nick)) changed = true
	}
	if (userOriginals.size > MAX_TOUCHED) {
		restoreUsers()
		applyUsers()
	}
	return changed
}

function onUsersChange() {
	if (!running || !usersDirect) return
	try {
		if (applyUsers()) announceUsers()
	} catch {
		// Read-only records: put back what was written and let names.ts hook UserUtils instead.
		usersDirect = false
		restoreUsers()
		onUsersFailure?.()
	}
}

let usersTimer: ReturnType<typeof setTimeout> | undefined
function announceUsers() {
	if (usersTimer !== undefined) return
	usersTimer = setTimeout(() => {
		usersTimer = undefined
		try {
			users?.emitChange?.()
		} catch {}
	}, 0)
}

let onUsersFailure: (() => void) | undefined
const MAX_TOUCHED = 400

let members: any
let selectedGuild: any
let running = false
let emitTimer: ReturnType<typeof setTimeout> | undefined
let onFailure: (() => void) | undefined

function setNick(member: Member, nick: string): boolean {
	if (member.nick === nick) return false
	if (!originals.has(member)) originals.set(member, member.nick)
	member.nick = nick
	// A frozen record ignores the write outside strict mode; treat that like a throw.
	if (member.nick !== nick) throw new Error('member record is read-only')
	return true
}

function restore(member: Member) {
	try {
		member.nick = originals.get(member)
	} catch {}
	originals.delete(member)
}

function restoreAll() {
	for (const member of [...originals.keys()]) restore(member)
}

/** Applies every nickname to the viewed server's records. True when something changed. */
function apply(): boolean {
	const guildId = selectedGuild?.getGuildId?.()
	if (!guildId) return false
	let changed = false
	for (const [id, nick] of nicknameEntries()) {
		const member: Member | undefined = members.getMember(guildId, id)
		if (member && typeof member === 'object' && setNick(member, nick))
			changed = true
	}
	// Records Discord has since replaced are still in the map; start over when it grows.
	if (originals.size > MAX_TOUCHED) {
		restoreAll()
		apply()
	}
	return changed
}

/** Components that read the store before this ran still show the old name: announce once more. */
function announce() {
	if (emitTimer !== undefined) return
	emitTimer = setTimeout(() => {
		emitTimer = undefined
		try {
			members?.emitChange?.()
		} catch {}
	}, 0)
}

function fail() {
	const report = onFailure
	stopDirect()
	report?.()
}

function onChange() {
	if (!running) return
	try {
		if (apply()) announce()
	} catch {
		fail()
	}
}

/** Starts fast mode. False when it cannot be used here (the caller falls back to the hook). */
export function startDirect(failed: () => void, usersFailed?: () => void): boolean {
	if (running) return true
	members = store('GuildMemberStore')
	selectedGuild = store('SelectedGuildStore')
	if (
		typeof members?.getMember !== 'function' ||
		typeof members?.addChangeListener !== 'function' ||
		typeof selectedGuild?.getGuildId !== 'function'
	)
		return false
	running = true
	onFailure = failed
	try {
		apply()
	} catch {
		running = false
		onFailure = undefined
		restoreAll()
		return false
	}
	members.addChangeListener(onChange)
	selectedGuild.addChangeListener?.(onChange)
	announce()

	users = store('UserStore')
	usersDirect = typeof users?.getUser === 'function' && typeof users?.addChangeListener === 'function'
	onUsersFailure = usersFailed
	if (usersDirect) {
		try {
			applyUsers()
			users.addChangeListener(onUsersChange)
			announceUsers()
		} catch {
			usersDirect = false
			restoreUsers()
		}
	}
	return true
}

/** The saved nicknames changed: put back the ones that were removed, apply the rest. */
export function refreshDirect() {
	if (!running) return
	try {
		for (const member of [...originals.keys()]) {
			const want =
				typeof member.userId === 'string'
					? fastNickname(member.userId)
					: undefined
			if (want === undefined) restore(member)
		}
		for (const user of [...userOriginals.keys()]) {
			const want = typeof user.id === 'string' ? fastNickname(user.id) : undefined
			if (want === undefined) restoreUser(user)
		}
		apply()
		announce()
		if (usersDirect && applyUsers()) announceUsers()
		else if (usersDirect) announceUsers()
	} catch {
		fail()
	}
}

export function stopDirect() {
	if (!running) return
	running = false
	onFailure = undefined
	if (emitTimer !== undefined) {
		clearTimeout(emitTimer)
		emitTimer = undefined
	}
	try {
		members?.removeChangeListener?.(onChange)
		selectedGuild?.removeChangeListener?.(onChange)
		users?.removeChangeListener?.(onUsersChange)
	} catch {}
	if (usersTimer !== undefined) {
		clearTimeout(usersTimer)
		usersTimer = undefined
	}
	const hadUsers = userOriginals.size > 0
	restoreUsers()
	usersDirect = false
	onUsersFailure = undefined
	if (hadUsers)
		try {
			users?.emitChange?.()
		} catch {}
	restoreAll()
	try {
		members?.emitChange?.()
	} catch {}
}

export const directRunning = () => running
