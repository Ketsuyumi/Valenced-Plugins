import { Stores } from '@valenced/discord/flux'
import { after } from '@valenced/patcher'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { findModule } from './find'
import { bump, currentTab, firstTab, onTab, refreshLists, setTab } from './list'
import { labels, on, onChange, settings } from './state'
import { Chip } from './ui'
import type { Tab } from './list'

/**
 * The tab bar under the Messages header (`MessagesHeader`, a memo; UI Tweaks documents it as the
 * only importer of the message-requests button). Tabs filter the DM list through list.ts.
 */

const HEADER = 'modules/main_tabs_v2/native/tabs/messages/MessagesHeader.tsx'

function TabBar() {
	const [, tick] = useState(0)
	useEffect(() => {
		const a = onTab(() => tick(n => n + 1))
		const b = onChange(() => tick(n => n + 1))
		return () => {
			a()
			b()
		}
	}, [])
	if (!on('tabs')) return null
	const first = firstTab()
	let active = currentTab()
	// Turning the Groups tab on or off changes what the first tab is.
	if ((active === 'all' || active === 'dms') && active !== first) active = first
	const pinnedAny = Object.values(settings().dms).some(d => d.pinned)
	const tabs: [Tab, string][] = [
		[first, first === 'dms' ? 'DMs' : 'All'],
		...(on('groupTab') ? ([['groups', 'Groups']] as [Tab, string][]) : []),
		['unread', 'Unread'],
		['friends', 'Friends'],
		...(on('pins') && pinnedAny
			? ([['pinned', '📌 Pinned']] as [Tab, string][])
			: []),
		...labels().map(l => [`label:${l}`, l] as [Tab, string]),
	]
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
	// Start on the right first tab, and keep the Unread tab current as messages are read.
	if (currentTab() === 'all' && firstTab() === 'dms') setTab('dms')
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
