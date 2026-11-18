import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { getStore } from '@valenced/discord/flux'
import { callNativeMethod } from '@valenced/modules/native'
import { useEffect, useState } from 'react'
import { Image, ScrollView } from 'react-native'
import { avatarOf, nameOf, readStreams, storeStatus } from './streams'
import type { PluginApi } from '@valenced/plugins/types'
import type { StreamInfo } from './streams'

interface Settings {
	/** A notice when someone starts or stops watching your stream. */
	joinNotices: boolean
	/** An Android notification with the count while you stream, seen outside Discord too. */
	notification: boolean
}
type Api = PluginApi<{ jsonStorage: Settings }>

const DEFAULTS: Settings = { joinNotices: true, notification: true }

const call = callNativeMethod as unknown as (
	method: string,
	args: unknown[],
) => Promise<any>

let streams: StreamInfo[] = []
let nativeStatus = 'Not used yet'
const listeners = new Set<() => void>()
const changed = () => {
	for (const listener of listeners) listener()
}

function toast(text: string) {
	try {
		ToastActionCreators.open('spectators', { text } as never)
	} catch {}
}

const list = (names: string[]) =>
	names.length <= 2
		? names.join(' and ')
		: `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

let shownTitle = ''
let shownText = ''

/** Keeps the notification in step with your stream. */
function syncNotification(mine: StreamInfo | undefined, settings: Settings) {
	if (!mine || !settings.notification) {
		if (shownTitle) {
			shownTitle = ''
			shownText = ''
			call('spectators.hide', []).catch(() => {})
		}
		return
	}
	const n = mine.viewers.length
	const title = n
		? `${n} watching your stream`
		: 'Nobody is watching your stream yet'
	const names = mine.viewers.map(id => nameOf(id, mine.guildId))
	const text = n
		? list(names.slice(0, 8)) + (n > 8 ? ` and ${n - 8} more` : '')
		: 'You are live'
	if (title === shownTitle && text === shownText) return
	shownTitle = title
	shownText = text
	call('spectators.show', [title, text])
		.then((ok: unknown) => {
			nativeStatus = ok
				? 'Showing'
				: "Couldn't post it: allow Discord's notifications in Android settings"
			changed()
		})
		.catch(() => {
			nativeStatus = 'Not available: fully restart Discord after installing'
			changed()
		})
}

function StreamGroup({ stream }: { stream: StreamInfo }) {
	const { TableRowGroup, TableRow } = Design as any
	const title = stream.mine
		? `Your stream · ${stream.viewers.length} watching`
		: `${nameOf(stream.ownerId, stream.guildId)}'s stream · ${stream.viewers.length} watching`
	return (
		<TableRowGroup title={title} hasIcons>
			{stream.viewers.length ? (
				stream.viewers.map(id => {
					const uri = avatarOf(id, stream.guildId)
					return (
						<TableRow
							key={id}
							label={nameOf(id, stream.guildId)}
							icon={
								uri ? (
									<Image
										source={{ uri }}
										style={{ width: 32, height: 32, borderRadius: 16 }}
									/>
								) : undefined
							}
						/>
					)
				})
			) : (
				<TableRow label="Nobody is watching" />
			)}
		</TableRowGroup>
	)
}

function SettingsPage({ api }: { api: Api }) {
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow } = Design as any
	const s = { ...DEFAULTS, ...api.jsonStorage.use() }
	const set = (patch: Partial<Settings>) =>
		api.jsonStorage.set({ ...s, ...patch }, true)
	const [, tick] = useState(0)
	useEffect(() => {
		const listener = () => tick(n => n + 1)
		listeners.add(listener)
		return () => {
			listeners.delete(listener)
		}
	}, [])
	return (
		<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
			<Stack spacing={24}>
				{streams.length ? (
					streams.map(stream => (
						<StreamGroup key={stream.key} stream={stream} />
					))
				) : (
					<TableRowGroup title="Streams">
						<TableRow
							label="No stream right now"
							subLabel="Go Live, or watch someone's stream, and the viewers show here"
						/>
					</TableRowGroup>
				)}
				<TableRowGroup title="Your stream">
					<TableSwitchRow
						label="Notices when people join or leave"
						subLabel="A short notice in Discord when someone starts or stops watching you"
						value={s.joinNotices}
						onValueChange={(joinNotices: boolean) => set({ joinNotices })}
					/>
					<TableSwitchRow
						label="Notification while you stream"
						subLabel="How many are watching and who, in Android's notifications, so you see it outside Discord too"
						value={s.notification}
						onValueChange={(notification: boolean) => set({ notification })}
					/>
				</TableRowGroup>
				<TableRowGroup title="Status">
					<TableRow label="Discord's stream data" subLabel={storeStatus()} />
					<TableRow label="Notification" subLabel={nativeStatus} />
				</TableRowGroup>
				<Text variant="text-sm/medium" color="text-muted">
					Discord only knows the viewers of streams you are streaming or
					watching, so those are the ones listed.
				</Text>
			</Stack>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }) {
		const settings = () => ({ ...DEFAULTS, ...jsonStorage.cache })
		let previous = new Set<string>()
		let wasStreaming = false

		const update = () => {
			try {
				streams = readStreams()
				const mine = streams.find(stream => stream.mine)
				const s = settings()
				if (mine) {
					const now = new Set(mine.viewers)
					if (wasStreaming && s.joinNotices) {
						const joined = mine.viewers.filter(id => !previous.has(id))
						const left = [...previous].filter(id => !now.has(id))
						if (joined.length)
							toast(
								`${list(joined.map(id => nameOf(id, mine.guildId)))} started watching`,
							)
						else if (left.length)
							toast(
								`${list(left.map(id => nameOf(id, mine.guildId)))} stopped watching`,
							)
					}
					previous = now
					wasStreaming = true
				} else {
					previous = new Set()
					wasStreaming = false
				}
				syncNotification(mine, s)
				changed()
			} catch {}
		}

		let unlisten: (() => void) | undefined
		cleanup(
			getStore('ApplicationStreamingStore', (s: any) => {
				if (unlisten) return
				try {
					s.addChangeListener(update)
					unlisten = () => s.removeChangeListener?.(update)
				} catch {}
				update()
			}) as any,
		)
		cleanup(jsonStorage.subscribe(update))
		cleanup(() => {
			unlisten?.()
			unlisten = undefined
			streams = []
			syncNotification(undefined, DEFAULTS)
		})
	},
	SettingsComponent: SettingsPage,
})
