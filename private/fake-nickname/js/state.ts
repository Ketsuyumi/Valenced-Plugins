import { Stores } from '@valenced/discord/flux'

export interface FakeNicknameSettings {
	nicknames: Record<string, string>
	/**
	 * Write nicknames into Discord's member data instead of hooking GuildMemberStore.getMember
	 * (see direct.ts). On unless switched off.
	 */
	fastMode?: boolean
}

export const defaults: FakeNicknameSettings = { nicknames: {}, fastMode: true }

export const MAX_LENGTH = 32

interface Storage {
	cache?: Partial<FakeNicknameSettings>
	set(value: FakeNicknameSettings, replace: true): Promise<void>
}

let storage: Storage | undefined

const EMPTY: Record<string, string> = {}

/**
 * id -> trimmed nickname, rebuilt only when the saved nicknames change. Name hooks run tens of
 * thousands of times, so they only do a single Map lookup instead of reading storage and
 * trimming on every call.
 */
let lookup = new Map<string, string>()
let lookupSource: unknown
const listeners = new Set<() => void>()

export const store = (name: string) => (Stores as any)[name] as any

export function bindStorage(next: Storage | undefined) {
	storage = next
	syncLookup()
}

let lastFastMode: boolean | undefined

export const fastMode = () => storage?.cache?.fastMode !== false

/** id -> nickname pairs, for code that needs to walk them. */
export const nicknameEntries = () => lookup.entries()

export async function setFastMode(value: boolean) {
	await storage?.set(
		{ ...defaults, ...(storage.cache ?? {}), fastMode: value },
		true,
	)
	syncLookup()
	refreshNames()
}

/** Rebuilds the lookup if the saved nicknames object changed. Cheap when it did not. */
export function syncLookup() {
	const source = storage?.cache?.nicknames
	const mode = fastMode()
	if (source === lookupSource) {
		// Only the mode changed: the listeners decide how names are applied.
		if (mode !== lastFastMode) {
			lastFastMode = mode
			for (const listener of listeners) listener()
		}
		return
	}
	lastFastMode = mode
	lookupSource = source
	const next = new Map<string, string>()
	if (source && typeof source === 'object')
		for (const [id, value] of Object.entries(source))
			if (typeof value === 'string' && value.trim()) next.set(id, value.trim())
	lookup = next
	for (const listener of listeners) listener()
}

/** Called after the lookup is rebuilt. */
export function onLookupChange(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

export const nicknameCount = () => lookup.size

/** Hot path: one Map lookup, no allocation. */
export const fastNickname = (id: unknown): string | undefined =>
	lookup.get(id as string)

export function nicknames(): Record<string, string> {
	const value = storage?.cache?.nicknames
	return value && typeof value === 'object' ? value : EMPTY
}

export function nicknameOf(id: unknown): string | undefined {
	return typeof id === 'string' ? lookup.get(id) : undefined
}

export function refreshNames() {
	for (const name of ['RelationshipStore', 'GuildMemberStore', 'UserStore'])
		try {
			store(name)?.emitChange?.()
		} catch {}
}

async function save(next: Record<string, string>) {
	await storage?.set(
		{ ...defaults, ...(storage.cache ?? {}), nicknames: next },
		true,
	)
}

export async function setNickname(id: string, value: string | undefined) {
	const next = { ...nicknames() }
	const name = value?.trim().slice(0, MAX_LENGTH)
	if (name) next[id] = name
	else delete next[id]
	await save(next)
	syncLookup()
	refreshNames()
}

export async function clearNicknames() {
	await save({})
	syncLookup()
	refreshNames()
}

export function realName(id: string): string {
	const user = store('UserStore')?.getUser?.(id)
	return user?.globalName || user?.global_name || user?.username || id
}

export function username(id: string): string | undefined {
	return store('UserStore')?.getUser?.(id)?.username
}

export function avatarUrl(id: string): string {
	const user = store('UserStore')?.getUser?.(id)
	try {
		const url = user?.getAvatarURL?.(undefined, 64, false)
		if (typeof url === 'string' && url) return url
	} catch {}
	if (user?.avatar)
		return `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.png?size=64`
	let index = 0
	try {
		index = Number((BigInt(id) >> 22n) % 6n)
	} catch {}
	return `https://cdn.discordapp.com/embed/avatars/${index}.png`
}
