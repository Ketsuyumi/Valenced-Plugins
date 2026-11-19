import { Stores } from '@valenced/discord/flux'

/**
 * Server folders, read and saved the way Discord's own drag-to-reorder does it.
 *
 * `SortedGuildStore.getCompatibleGuildFolders()` is the sidebar in order, in the shape Discord
 * saves: `{ folderId, folderName, folderColor, guildIds }`, with a server outside any folder as an
 * entry with no folderId and one guildId. `saveGuildFolders(list)`
 * (actions/UserSettingsActionCreators.tsx) is the one place every reorder and folder edit is saved
 * through (documented in bleelblep's Hide Servers Drawer). A move here is: take that list, move one
 * guild ID, save it.
 */

export interface Entry {
	folderId?: number | string | null
	folderName?: string | null
	folderColor?: number | null
	guildIds: string[]
}

export interface Folder {
	id: number | string
	name: string
	color?: string
	guildIds: string[]
}

let saver: ((folders: Entry[]) => unknown) | undefined
export const setSaver = (fn: typeof saver) => {
	saver = fn
}
export const canSave = () => !!saver

const S = () => Stores as any

/** The sidebar as Discord saves it, copied so it can be changed. */
export function layout(): Entry[] {
	const raw = S().SortedGuildStore?.getCompatibleGuildFolders?.() ?? []
	return (Array.isArray(raw) ? raw : []).map((e: any) => ({
		folderId: e.folderId ?? e.id ?? undefined,
		folderName: e.folderName ?? e.name ?? null,
		folderColor: e.folderColor ?? e.color ?? null,
		guildIds: [...(e.guildIds ?? [])].map(String),
	}))
}

const isFolder = (e: Entry) => e.folderId !== undefined && e.folderId !== null

export const colorHex = (n?: number | null) =>
	typeof n === 'number'
		? `#${(n & 0xffffff).toString(16).padStart(6, '0')}`
		: undefined

/** Whether [id] is a server Discord knows (not a user or message with a numeric key). */
export const isGuild = (id: string) => !!S().GuildStore?.getGuild?.(id)

export const guildName = (id: string) =>
	S().GuildStore?.getGuild?.(id)?.name ?? 'Server'

/** Folders in sidebar order, with a readable name for unnamed ones. */
export function folders(): Folder[] {
	return layout()
		.filter(isFolder)
		.map(e => ({
			id: e.folderId as number | string,
			name:
				e.folderName?.trim() ||
				e.guildIds.slice(0, 3).map(guildName).join(', ') +
					(e.guildIds.length > 3 ? '…' : ''),
			color: colorHex(e.folderColor),
			guildIds: e.guildIds,
		}))
}

/** The folder [guildId] is in, if any. */
export const folderOf = (guildId: string) =>
	folders().find(f => f.guildIds.includes(guildId))

/** [list] without [guildId], dropping folders it leaves empty. Returns where it was (entry index). */
function take(list: Entry[], guildId: string): { list: Entry[]; at: number } {
	let at = list.length
	const out: Entry[] = []
	for (const e of list) {
		if (!e.guildIds.includes(guildId)) {
			out.push(e)
			continue
		}
		at = out.length
		const rest = e.guildIds.filter(id => id !== guildId)
		if (rest.length) out.push({ ...e, guildIds: rest })
	}
	return { list: out, at }
}

async function save(list: Entry[]) {
	if (!saver) throw new Error("Couldn't find Discord's folder saving")
	await saver(list)
}

/** Moves [guildId] to the end of folder [folderId]. */
export async function moveToFolder(guildId: string, folderId: number | string) {
	const { list } = take(layout(), guildId)
	const target = list.find(
		e => isFolder(e) && String(e.folderId) === String(folderId),
	)
	if (!target) throw new Error('That folder is gone')
	target.guildIds = [...target.guildIds, guildId]
	await save(list)
}

/** Puts [guildId] in a new folder called [name], where the server was. */
export async function newFolder(guildId: string, name: string, color?: number) {
	const { list, at } = take(layout(), guildId)
	const used = new Set(list.map(e => String(e.folderId)))
	let id = 0
	do id = Math.floor(Math.random() * 0xfffffffe) + 1
	while (used.has(String(id)))
	list.splice(at, 0, {
		folderId: id,
		folderName: name.trim() || null,
		folderColor: color ?? null,
		guildIds: [guildId],
	})
	await save(list)
}

/** Takes [guildId] out of its folder, just after the folder. */
export async function removeFromFolder(guildId: string) {
	const before = layout()
	const index = before.findIndex(
		e => isFolder(e) && e.guildIds.includes(guildId),
	)
	if (index === -1) return
	const folderId = before[index].folderId
	const { list } = take(before, guildId)
	const still = list.findIndex(e => e.folderId === folderId)
	list.splice(still === -1 ? index : still + 1, 0, { guildIds: [guildId] })
	await save(list)
}
