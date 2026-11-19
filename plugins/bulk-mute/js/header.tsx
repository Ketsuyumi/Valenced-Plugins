import * as discordFinders from '@valenced/discord/utils/modules/finders'
import { after } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { useEffect, useState } from 'react'
import { Pressable, Text } from 'react-native'
import { begin, currentGuild, end, onChange, selection } from './state'

/**
 * The bell beside the server's Search bar. No plugin has patched that header before, so it is
 * found at run time: modules whose source path looks like a server header or its search bar are
 * wrapped, and in what they draw the element that is the search bar (its component is named
 * …Search…, or it is labelled "Search") gets the bell put right after it. The search bar
 * stretches to fill the row, so it gets narrower to make room.
 */

export const headerStatus = {
	candidates: [] as string[],
	placedIn: '' as string,
}

const KEY = 'bulk-mute-bell'
const PATH =
	/(guild_header|guild_sidebar|channel_list|guild_channel|main_tabs_v2\/native\/(tabs\/guilds|sidebar)|guilds?_?home).*?(Header|Search|Toolbar|Actions)[^/]*\.tsx$|Guild[A-Za-z]*(Header|Search)[A-Za-z]*\.tsx$/
const SKIP = /action_sheet|ActionSheet|modules\/search\/|Settings|profile/i
/** Paths tried directly when the module path list isn't reachable. */
const GUESSES = [
	'modules/main_tabs_v2/native/tabs/guilds/GuildHeader.tsx',
	'modules/guild_sidebar/native/GuildHeader.tsx',
	'modules/guild_header/native/GuildHeader.tsx',
	'modules/channel_list_v2/native/ChannelListHeader.tsx',
	'modules/channel_list_v2/native/RedesignChannelListHeader.tsx',
	'modules/guild_sidebar/native/GuildSidebarHeader.tsx',
]

function Bell() {
	const [, tick] = useState(0)
	useEffect(() => onChange(() => tick(n => n + 1)), [])
	const Icon: any =
		lookupGeneratedIconComponent('BellIcon' as any) ??
		lookupGeneratedIconComponent('BellZIcon' as any)
	const guildId = currentGuild()
	const on = selection.active && selection.guildId === guildId
	return (
		<Pressable
			key={KEY}
			accessibilityRole="button"
			accessibilityLabel="Select channels to mute"
			onPress={() => (on ? end() : guildId && begin(guildId))}
			style={({ pressed }: { pressed: boolean }) => ({
				width: 44,
				height: 44,
				marginLeft: 8,
				borderRadius: 12,
				borderWidth: 1,
				borderColor: on ? '#5865F2' : 'rgba(255,255,255,0.14)',
				backgroundColor: on
					? 'rgba(88,101,242,0.25)'
					: pressed
						? 'rgba(255,255,255,0.1)'
						: 'transparent',
				alignItems: 'center',
				justifyContent: 'center',
			})}
		>
			{Icon ? (
				<Icon size="sm" color="#ffffff" />
			) : (
				<Text style={{ fontSize: 18 }}>🔔</Text>
			)}
		</Pressable>
	)
}

const isEl = (n: any) =>
	n && typeof n === 'object' && 'type' in n && 'props' in n
const nameOf = (t: any): string =>
	typeof t === 'function'
		? t.displayName || t.name || ''
		: t && typeof t === 'object'
			? t.displayName || nameOf(t.type) || nameOf(t.render) || ''
			: ''

function isSearch(el: any): boolean {
	if (!isEl(el)) return false
	if (/search/i.test(nameOf(el.type)) && !/result|icon/i.test(nameOf(el.type)))
		return true
	const p = el.props ?? {}
	for (const k of ['accessibilityLabel', 'placeholder', 'label', 'text'])
		if (typeof p[k] === 'string' && /^search\b/i.test(p[k])) return true
	return false
}

/** [node] with the bell placed right after the search bar, or the same node if there's none. */
export function place(node: any, depth: number): any {
	if (!isEl(node) || depth > 10) return node
	const kids = node.props?.children
	if (kids == null) return node
	const list = Array.isArray(kids) ? kids : [kids]
	if (list.some((k: any) => k?.key === KEY)) return node
	const at = list.findIndex(isSearch)
	if (at !== -1) {
		const next = [
			...list.slice(0, at + 1),
			<Bell key={KEY} />,
			...list.slice(at + 1),
		]
		return { ...node, props: { ...node.props, children: next } }
	}
	let changedAny = false
	const next = list.map((k: any) => {
		const r = place(k, depth + 1)
		if (r !== k) changedAny = true
		return r
	})
	if (!changedAny) return node
	return {
		...node,
		props: { ...node.props, children: Array.isArray(kids) ? next : next[0] },
	}
}

export function patchHeader(enabled: () => boolean): () => void {
	const unpatches: Array<() => void> = []
	const tried = new Set<string>()
	const wrap = (path: string, mod: any) => {
		if (!mod || tried.has(path)) return
		tried.add(path)
		headerStatus.candidates.push(path)
		const targets: Array<[any, string]> = []
		for (const key of Object.keys(mod)) {
			const v = mod[key]
			if (typeof v === 'function') targets.push([mod, key])
			else if (v && typeof v === 'object' && typeof v.type === 'function')
				targets.push([v, 'type'])
		}
		for (const [host, key] of targets)
			try {
				unpatches.push(
					after(host, key, ((out: any) => {
						if (!enabled() || !currentGuild()) return out
						try {
							const r = place(out, 0)
							if (r !== out && !headerStatus.placedIn)
								headerStatus.placedIn = `${path} (${key})`
							return r
						} catch {
							return out
						}
					}) as never),
				)
			} catch {}
	}
	const load = (path: string) => {
		try {
			const found = (discordFinders as any).lookupModuleWithImportedPath?.(path)
			const mod = Array.isArray(found) ? found[0] : found
			if (mod) wrap(path, mod)
			else
				unpatches.push(
					(discordFinders as any).getModuleWithImportedPath(path, (m: any) =>
						wrap(path, m?.['0'] ?? m),
					),
				)
		} catch {}
	}
	// The module path list, when Valenced exposes it at run time.
	const tracker = (globalThis as any).valenced?.discord?.common?.importTracker
	const paths: Map<string, unknown> | undefined = tracker?.mImportedPaths
	if (paths && typeof paths.keys === 'function') {
		for (const p of paths.keys()) if (PATH.test(p) && !SKIP.test(p)) load(p)
		const watch = (_id: unknown, p: string) => {
			if (typeof p === 'string' && PATH.test(p) && !SKIP.test(p)) load(p)
		}
		tracker.sImportedPath?.add?.(watch)
		unpatches.push(() => tracker.sImportedPath?.delete?.(watch))
	}
	for (const p of GUESSES) load(p)
	return () => {
		for (const u of unpatches.splice(0))
			try {
				u()
			} catch {}
		tried.clear()
		headerStatus.candidates = []
		headerStatus.placedIn = ''
	}
}
