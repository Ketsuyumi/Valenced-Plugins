import { Dispatcher } from '@valenced/discord/common/flux'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { useState } from 'react'
import { ScrollView } from 'react-native'

/**
 * When a server is opened, every category whose channels are all read is collapsed (and, if
 * wanted, every category with something new is expanded). It goes through Discord's own
 * collapse actions (CATEGORY_COLLAPSE / CATEGORY_EXPAND), so it is the same as tapping the
 * category headers yourself, and you can still open any of them by hand afterwards.
 */

const CATEGORY = 4

interface Settings {
	/** Open categories that have new messages. */
	expandUnread: boolean
	/** Muted channels count as read (Discord doesn't show them as unread either). Mentions still count. */
	mutedAsRead: boolean
	/** Only the first time each server is opened after the app starts. */
	oncePerLaunch: boolean
}
const DEFAULTS: Settings = {
	expandUnread: true,
	mutedAsRead: true,
	oncePerLaunch: false,
}
let storage: any
const settings = (): Settings => ({ ...DEFAULTS, ...(storage?.cache ?? {}) })

const S = () => Stores as any
const status = {
	runs: 0,
	collapsed: 0,
	expanded: 0,
	actions: 'Looking',
	lastError: '',
}

let actions: {
	collapse?: (id: string) => void
	expand?: (id: string) => void
} = {}

function collapse(id: string) {
	if (actions.collapse) actions.collapse(id)
	else (Dispatcher as any).dispatch({ type: 'CATEGORY_COLLAPSE', id })
}
function expand(id: string) {
	if (actions.expand) actions.expand(id)
	else (Dispatcher as any).dispatch({ type: 'CATEGORY_EXPAND', id })
}

function isCollapsed(id: string): boolean | undefined {
	try {
		const v = S().CategoryCollapseStore?.isCollapsed?.(id)
		return typeof v === 'boolean' ? v : undefined
	} catch {
		return undefined
	}
}

/** The server's channels: categories and the rest, from GuildChannelStore (what you can see). */
function channelsOf(guildId: string): { categories: any[]; others: any[] } {
	const categories: any[] = []
	const others: any[] = []
	const g = S().GuildChannelStore?.getChannels?.(guildId)
	if (g && typeof g === 'object') {
		for (const e of g[CATEGORY] ?? [])
			if (e?.channel) categories.push(e.channel)
		for (const key of ['SELECTABLE', 'VOCAL'])
			for (const e of g[key] ?? []) if (e?.channel) others.push(e.channel)
	} else {
		const all =
			S().ChannelStore?.getMutableGuildChannelsForGuild?.(guildId) ?? {}
		for (const c of Object.values<any>(all))
			(c?.type === CATEGORY ? categories : others).push(c)
	}
	return { categories, others }
}

function isMuted(guildId: string, channelId: string): boolean {
	const u = S().UserGuildSettingsStore
	try {
		if (typeof u?.isGuildOrCategoryOrChannelMuted === 'function')
			return !!u.isGuildOrCategoryOrChannelMuted(guildId, channelId)
		return !!u?.isChannelMuted?.(guildId, channelId)
	} catch {
		return false
	}
}

function hasNew(guildId: string, channelId: string, s: Settings): boolean {
	const r = S().ReadStateStore
	try {
		if ((r?.getMentionCount?.(channelId) ?? 0) > 0) return true
		if (!r?.hasUnread?.(channelId)) return false
		return !(s.mutedAsRead && isMuted(guildId, channelId))
	} catch {
		return false
	}
}

const seen = new Set<string>()

function tidy(guildId: string) {
	const s = settings()
	if (s.oncePerLaunch) {
		if (seen.has(guildId)) return
		seen.add(guildId)
	}
	try {
		const { categories, others } = channelsOf(guildId)
		if (!categories.length) return
		const fresh = new Set<string>()
		for (const c of others)
			if (c?.parent_id && hasNew(guildId, c.id, s))
				fresh.add(String(c.parent_id))
		for (const cat of categories) {
			const id = String(cat.id)
			const collapsed = isCollapsed(id)
			if (fresh.has(id)) {
				if (s.expandUnread && collapsed !== false) {
					expand(id)
					status.expanded++
				}
			} else if (collapsed !== true) {
				collapse(id)
				status.collapsed++
			}
		}
		status.runs++
	} catch (e: any) {
		status.lastError = String(e?.message ?? e)
	}
}

function SettingsPage() {
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow } = Design as any
	const [s, setS] = useState(settings)
	const set = (patch: Partial<Settings>) => {
		const next = { ...s, ...patch }
		storage?.set?.(next, true)
		setS(next)
	}
	return (
		<ScrollView contentContainerStyle={{ padding: 16 }}>
			<Stack spacing={16}>
				<Text variant="text-md/normal">
					When you open a server, categories where everything is read are
					collapsed. Channels with new messages still show under a collapsed
					category, as Discord always does.
				</Text>
				<TableRowGroup title="Options">
					<TableSwitchRow
						label="Open categories with new messages"
						subLabel="Expands a collapsed category when something in it is unread"
						value={s.expandUnread}
						onValueChange={(expandUnread: boolean) => set({ expandUnread })}
					/>
					<TableSwitchRow
						label="Muted channels count as read"
						subLabel="Mentions still count as new"
						value={s.mutedAsRead}
						onValueChange={(mutedAsRead: boolean) => set({ mutedAsRead })}
					/>
					<TableSwitchRow
						label="Only once per server"
						subLabel="Just the first time you open each server after starting Discord, instead of every time"
						value={s.oncePerLaunch}
						onValueChange={(oncePerLaunch: boolean) => set({ oncePerLaunch })}
					/>
				</TableRowGroup>
				<TableRowGroup title="Status">
					<TableRow label="Collapse actions" subLabel={status.actions} />
					<TableRow
						label="So far"
						subLabel={`${status.runs} servers tidied, ${status.collapsed} collapsed, ${status.expanded} opened`}
					/>
					{status.lastError ? (
						<TableRow label="Last error" subLabel={status.lastError} />
					) : null}
				</TableRowGroup>
			</Stack>
		</ScrollView>
	)
}

export default plugin({
	start({ cleanup, jsonStorage }) {
		storage = jsonStorage
		cleanup(
			getModules(
				(withProps as any)('categoryCollapse', 'categoryExpand'),
				(mod: any) => {
					const m = mod?.default ?? mod
					if (typeof m?.categoryCollapse !== 'function') return
					actions = {
						collapse: id => m.categoryCollapse(id),
						expand: id => m.categoryExpand(id),
					}
					status.actions = "Discord's own"
				},
			) as any,
		)
		if (!actions.collapse) status.actions = 'Direct actions'

		const store = S().SelectedGuildStore
		let last: string | undefined
		let timer: any
		const onChange = () => {
			const id = store?.getGuildId?.()
			if (!id || id === last) {
				last = id ?? undefined
				return
			}
			last = id
			// After Discord has finished switching, so the channel list it builds already sees it.
			clearTimeout(timer)
			timer = setTimeout(() => tidy(id), 50)
		}
		store?.addChangeListener?.(onChange)
		onChange()
		cleanup(
			() => store?.removeChangeListener?.(onChange),
			() => clearTimeout(timer),
			() => {
				actions = {}
				seen.clear()
				storage = undefined
			},
		)
	},
	SettingsComponent: SettingsPage,
})
