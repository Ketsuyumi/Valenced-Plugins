import { Stores } from '@valenced/discord/flux'
import { after } from '@valenced/patcher'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { findModule } from './find'
import {
	bump,
	currentTab,
	firstTab,
	onTab,
	refreshLists,
	setTab,
	shows,
} from './list'
import { isUnread, labels, on, onChange, settings } from './state'
import { Chip } from './ui'
import type { Tab } from './list'

/**
 * The tab bar under the Messages header (`MessagesHeader`, a memo; UI Tweaks documents it as the
 * only importer of the message-requests button). Tabs filter the DM list through list.ts.
 */

const HEADER = 'modules/main_tabs_v2/native/tabs/messages/MessagesHeader.tsx'

/** The tabs there are right now, with their names. */
export function tabList(): [Tab, string][] {
	const first = firstTab()
	const pinnedAny = Object.values(settings().dms).some(d => d.pinned)
	return [
		[first, first === 'dms' ? 'DMs' : 'All'],
		...(on('groupTab') ? ([['groups', 'Groups']] as [Tab, string][]) : []),
		['unread', 'Unread'],
		['friends', 'Friends'],
		...(on('pins') && pinnedAny
			? ([['pinned', '📌 Pinned']] as [Tab, string][])
			: []),
		...labels().map(l => [`label:${l}`, l] as [Tab, string]),
	]
}

/**
 * The tab the list filters by must be one that's shown. Turning the Groups tab off used to leave
 * the filter on "DMs only" (or "Groups") while the bar showed All, so group chats (or everything
 * else) seemed to vanish; a removed label left its tab's filter on too.
 */
export function fixTab() {
	const t = currentTab()
	if (!on('tabs')) {
		if (t !== 'all') setTab('all')
		return
	}
	if (!tabList().some(([x]) => x === t)) setTab(firstTab())
}

/** Every DM and group DM, from Discord's own (unfiltered) map. */
function allPrivateIds(): string[] {
	try {
		const map = (Stores as any).ChannelStore?.getMutablePrivateChannels?.()
		if (map && typeof map === 'object') return Object.keys(map)
	} catch {}
	return []
}

function TabBar() {
	const [, tick] = useState(0)
	useEffect(() => {
		const a = onTab(() => tick(n => n + 1))
		const b = onChange(() => tick(n => n + 1))
		// Unread counts follow read state (at most every half second).
		const reads = (Stores as any).ReadStateStore
		let t: any
		const c = () => {
			if (!t) t = setTimeout(() => ((t = undefined), tick(n => n + 1)), 500)
		}
		reads?.addChangeListener?.(c)
		return () => {
			a()
			b()
			reads?.removeChangeListener?.(c)
			clearTimeout(t)
		}
	}, [])
	if (!on('tabs')) return null
	const tabs = tabList()
	const active = currentTab()
	const unread = allPrivateIds().filter(isUnread)
	const count = (t: Tab) => unread.filter(id => shows(id, t)).length
	return (
		<View style={{ paddingVertical: 6 }}>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={{ paddingHorizontal: 12 }}
			>
				{tabs.map(([t, label]) => (
					<Chip
						key={t}
						label={label}
						on={active === t}
						badge={count(t)}
						onPress={() => setTab(t)}
					/>
				))}
			</ScrollView>
		</View>
	)
}

export function installTabs(): () => void {
	const undo: Array<() => void> = []
	undo.push(
		findModule(HEADER, [], (mod: any) => {
			const target = mod?.default
			const host =
				typeof target?.type === 'function'
					? { o: target, k: 'type' }
					: typeof target === 'function'
						? { o: mod, k: 'default' }
						: null
			if (!host) return
			undo.push(
				after(host.o, host.k, ((out: any) => (
					<>
						{out}
						<TabBar />
					</>
				)) as never),
			)
		}),
	)
	// Start on the right first tab, and keep it right when settings change.
	fixTab()
	undo.push(onChange(() => fixTab()))
	// Keep the Unread tab current as messages are read.
	const readStates = (Stores as any).ReadStateStore
	let queued = false
	const onRead = () => {
		if (currentTab() !== 'unread' || queued) return
		queued = true
		setTimeout(() => {
			queued = false
			bump()
			refreshLists()
		}, 400)
	}
	readStates?.addChangeListener?.(onRead)
	undo.push(() => readStates?.removeChangeListener?.(onRead))
	undo.push(() => setTab('all'))
	return () => {
		for (const u of undo.splice(0))
			try {
				u()
			} catch {}
	}
}
