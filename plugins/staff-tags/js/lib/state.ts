import { reportError } from '../shared/report'
import type { JsonStorage } from '@valenced/json-storage'
import type { StaffTagsStorage, TagOverride, UserTag } from '../types'

export const TAG = '[StaffTags]'

/** Also the fallback for every read -- `load: true` does not await, so `cache` starts undefined. */
export const DEFAULTS: StaffTagsStorage = {
	useRoleColor: false,
	tags: {},
	compact: false,
	showInChat: true,
	showInMembers: true,
	showInProfiles: true,
	hiddenGuilds: {},
	userTags: {},
}

/** Default background for a tag you give someone yourself. */
export const USER_TAG_COLOR = '#EB459E'

type Storage = JsonStorage<StaffTagsStorage>

let storage: Storage | undefined

/**
 * The merged settings, built once per storage change instead of on every tag lookup (the
 * original spread a fresh copy for every message row).
 */
let snapshot: StaffTagsStorage | undefined
const listeners = new Set<() => void>()

function changed() {
	snapshot = undefined
	for (const listener of listeners) listener()
}

export function setStorage(value: Storage | undefined) {
	storage = value
	changed()
}

/** Call once from start(): rebuilds the snapshot when anything is saved. */
export function watchStorage(): () => void {
	return storage?.subscribe(changed) ?? (() => {})
}

/** Runs after any settings change. */
export function onSettingsChange(listener: () => void): () => void {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

/** Sub-pages are plain navigator routes with no plugin `api` prop, so they read through this. */
export function getStorage(): Storage | undefined {
	return storage
}

export function settings(): StaffTagsStorage {
	if (!snapshot) snapshot = { ...DEFAULTS, ...(storage?.cache ?? {}) }
	return snapshot
}

function save(patch: Partial<StaffTagsStorage>) {
	try {
		storage
			?.set(patch as never)
			.then(changed, error =>
				reportError(`${TAG} could not save settings:`, error),
			)
		changed()
	} catch (error) {
		reportError(`${TAG} could not save settings:`, error)
	}
}

/** One tag's changes, or an empty object when it has never been touched. */
export function overrideFor(id: string): TagOverride {
	return settings().tags?.[id] ?? {}
}

/** Merges into one tag's entry, leaving every other tag alone. */
export function setOverride(id: string, patch: Partial<TagOverride>) {
	save({ tags: { [id]: patch } } as Partial<StaffTagsStorage>)
}

/**
 * Puts one tag back to how it ships. Written as an explicit blank override rather than deleting
 * the key, because a merge cannot remove one.
 */
export function resetOverride(id: string) {
	setOverride(id, {
		enabled: true,
		text: '',
		icon: 'none',
		customSvg: '',
		iconOnly: false,
		useCustomColor: false,
		color: '',
		useGradient: false,
		gradientColor: '',
	})
}

export function setOption(
	key:
		| 'useRoleColor'
		| 'compact'
		| 'showInChat'
		| 'showInMembers'
		| 'showInProfiles',
	value: boolean,
) {
	save({ [key]: value })
}

export function isGuildHidden(guildId: string | undefined): boolean {
	return !!guildId && settings().hiddenGuilds?.[guildId] === true
}

export function setGuildHidden(guildId: string, hidden: boolean) {
	save({ hiddenGuilds: { [guildId]: hidden } } as Partial<StaffTagsStorage>)
}

export function userTagFor(userId: string | undefined): UserTag | undefined {
	if (!userId) return
	const tag = settings().userTags?.[userId]
	return tag?.text?.trim() ? tag : undefined
}

export function setUserTag(userId: string, tag: UserTag) {
	save({ userTags: { [userId]: tag } } as Partial<StaffTagsStorage>)
}

/** Deleting a key needs a full replace: a merge cannot remove one. */
export function removeUserTag(userId: string) {
	const current = settings()
	const userTags = { ...current.userTags }
	delete userTags[userId]
	try {
		storage
			?.set({ ...current, userTags }, true)
			.then(changed, error =>
				reportError(`${TAG} could not remove the tag:`, error),
			)
	} catch (error) {
		reportError(`${TAG} could not remove the tag:`, error)
	}
}
