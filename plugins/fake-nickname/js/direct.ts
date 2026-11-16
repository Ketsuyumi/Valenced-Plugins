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
export function startDirect(failed: () => void): boolean {
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
		apply()
		announce()
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
	} catch {}
	restoreAll()
	try {
		members?.emitChange?.()
	} catch {}
}

export const directRunning = () => running
