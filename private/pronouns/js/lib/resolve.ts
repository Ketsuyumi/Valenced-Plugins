/**
 * One lookup for a badge: your override first, then Discord's own pronouns and PronounDB in the
 * order the settings choose. Everything here answers synchronously; asynchronous sources (a
 * profile fetch, a PronounDB batch) are *primed* here and land through the listeners the patches
 * subscribe to.
 */

import { discordPronouns, fetchOnMiss, rawPronouns } from './discord'
import { cached, request } from './pronounDB'
import { settings } from './state'
import { cleanPronounDb, cleanPronouns, parseExtra, tidy } from './validate'
import type { PronounsStorage } from './state'

export interface Resolved {
	text: string
	source: 'override' | 'discord' | 'pronoundb'
}

export function overrideFor(userId: string): string | undefined {
	const value = settings().overrides?.[userId]
	// null is a cleared override's tombstone, not a value.
	return tidy(value)
}

// ---------------------------------------------------------------------------------------------
// Pronouns+: remembered answers.
//
// The original worked every answer out from scratch: for each chat row it re-parsed the "extra
// pronouns" setting and ran the clean-up rules over both the Discord and the PronounDB value, and
// it did so twice per row. Measured on a phone: 0.22 ms per row, 6.2 s in 73 minutes.
//
// An answer is now kept per person and server together with the raw values it was made from
// (the override, the guild and account profile fields, the PronounDB text) and the settings
// object (replaced on every change). Reading those raw values is a few lookups with no string work; while they are the
// same, the kept answer is returned. Nothing has to be cleared when a profile or PronounDB result
// lands: the next lookup sees a different raw value and works the answer out again.

interface Kept {
	value: Resolved | undefined
	settings: PronounsStorage
	override: unknown
	guild: unknown
	user: unknown
	db: unknown
}

const kept = new Map<string, Kept>()
const MAX_KEPT = 4000
let extraFor: { source: unknown; words: string[] } | undefined

/** Call from start(); the returned cleanup forgets every kept answer. */
export function watchResolve(): () => void {
	return () => {
		kept.clear()
		extraFor = undefined
	}
}

/** The "extra pronouns" setting as words, parsed once per settings change. */
function extraWords(): string[] {
	const source = settings().extraPronouns
	if (!extraFor || extraFor.source !== source)
		extraFor = { source, words: parseExtra(source) }
	return extraFor.words
}

/**
 * With "Only real pronouns" on, just the pronoun part of [text]; otherwise [text] with its blank
 * space tidied. Either way, text that's only spaces or invisible characters gives no badge.
 */
function filtered(
	raw: string | undefined,
	source: 'discord' | 'pronoundb',
): string | undefined {
	const text = tidy(raw)
	if (!text) return undefined
	const s = settings()
	if (!s.validOnly) return text
	const options = { anyAll: s.allowAnyAll, extra: extraWords() }
	// PronounDB answers with codes ("it", "he/it"), not free text, so no name or prose checks.
	return tidy(
		source === 'pronoundb'
			? cleanPronounDb(text, options)
			: cleanPronouns(text, options),
	)
}

/** The pronoun string the badge shows for this author, if any is known right now. */
export function resolve(
	userId: string,
	guildId?: string,
): Resolved | undefined {
	const s = settings()
	const override = s.overrides?.[userId]
	const [guild, user] = rawPronouns(userId, guildId)
	const db = s.pronounDbEnabled ? cached(userId) : undefined
	const key = guildId ? `${userId}|${guildId}` : userId
	const hit = kept.get(key)
	if (
		hit &&
		hit.settings === s &&
		hit.override === override &&
		hit.guild === guild &&
		hit.user === user &&
		hit.db === db
	)
		return hit.value
	const value = compute(userId, guildId)
	if (kept.size >= MAX_KEPT) kept.clear()
	kept.set(key, { value, settings: s, override, guild, user, db })
	return value
}

function compute(userId: string, guildId?: string): Resolved | undefined {
	try {
		const override = overrideFor(userId)
		if (override) return { text: override, source: 'override' }
		const s = settings()
		// Filtered before the order is applied: junk in one source falls through to the other.
		const discord = filtered(discordPronouns(userId, guildId), 'discord')
		const db = s.pronounDbEnabled
			? filtered(cached(userId), 'pronoundb')
			: undefined
		if (s.discordFirst || !s.pronounDbEnabled) {
			if (discord) return { text: discord, source: 'discord' }
			if (db) return { text: db, source: 'pronoundb' }
		} else {
			if (db) return { text: db, source: 'pronoundb' }
			if (discord) return { text: discord, source: 'discord' }
		}
		return undefined
	} catch {
		return undefined
	}
}

/**
 * Kicks off whatever is missing for this author: a Discord profile fetch when the store has
 * nothing, and a PronounDB lookup when it isn't cached and PronounDB is enabled. Deduped by both
 * clients.
 */
export function prime(userId: string, guildId?: string) {
	if (overrideFor(userId)) return
	// Even with the user's own pronouns known: a guild profile can carry its own, which win.
	fetchOnMiss(userId, guildId)
	if (settings().pronounDbEnabled && !cached(userId)) request(userId)
}
