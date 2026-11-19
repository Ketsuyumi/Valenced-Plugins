export type ThemeName = 'discord' | 'light' | 'sepia' | 'dark' | 'black'

export interface LibraryEntry {
	id: string
	title: string
	author: string
	chapters: number
	/** Item index in the reader's list where you stopped, and how many items there are. */
	index: number
	total: number
	chapter: number
	at: number
}

export interface Settings {
	links: boolean
	fontSize: number
	lineSpacing: number
	margin: number
	serif: boolean
	justify: boolean
	theme: ThemeName
	library: Record<string, LibraryEntry>
}
export const DEFAULTS: Settings = {
	links: true,
	fontSize: 17,
	lineSpacing: 1.55,
	margin: 18,
	serif: true,
	justify: false,
	theme: 'discord',
	library: {},
}

let storage: any
export const bindStorage = (s: any) => {
	storage = s
}
export const settings = (): Settings => ({
	...DEFAULTS,
	...(storage?.cache ?? {}),
})
export function save(patch: Partial<Settings>) {
	void storage?.set?.({ ...settings(), ...patch })
}
/** Settings as a hook (redraws when they change). */
export function useSettings(): Settings {
	try {
		storage?.use?.()
	} catch {}
	return settings()
}

let pending: LibraryEntry | undefined
let timer: any
/** Saves reading progress, at most every 1.5 s (scrolling reports it constantly). */
export function saveProgress(entry: LibraryEntry) {
	pending = entry
	if (timer) return
	timer = setTimeout(flushProgress, 1500)
}
export function flushProgress() {
	clearTimeout(timer)
	timer = undefined
	if (!pending) return
	const library = { ...settings().library, [pending.id]: pending }
	// Keep the 60 most recent.
	const keep = Object.values(library)
		.sort((a, b) => b.at - a.at)
		.slice(0, 60)
	save({ library: Object.fromEntries(keep.map(e => [e.id, e])) })
	pending = undefined
}
export function forget(id: string) {
	const library = { ...settings().library }
	delete library[id]
	save({ library })
}
