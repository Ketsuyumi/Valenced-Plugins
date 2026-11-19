import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, instead } from '@valenced/patcher'
import { useState } from 'react'
import { Linking, Pressable, ScrollView, View } from 'react-native'
import { workIdOf } from './ao3'
import { findModule } from './find'
import { external, openReader, ReaderHost } from './reader'
import {
	bindStorage,
	DEFAULTS,
	forget,
	type Settings,
	save,
	useSettings,
} from './store'

/**
 * AO3 links open in a reader inside Discord. Links are caught where Embed Playback catches
 * YouTube ones: the message link handler (`handleClick`) and React Native's `Linking.openURL`.
 * The reader is a Modal mounted beside Discord's toast container (over the whole app) and on this
 * plugin's page, so it opens from either.
 */

const status = { links: false, host: false }

function Library() {
	const {
		Stack,
		Text,
		TextInput,
		Button,
		TableRowGroup,
		TableRow,
		TableSwitchRow,
	} = Design as any
	const s = useSettings()
	const [link, setLink] = useState('')
	const id =
		workIdOf(link) ?? (/^\d{3,}$/.test(link.trim()) ? link.trim() : undefined)
	const works = Object.values(s.library).sort((a, b) => b.at - a.at)
	return (
		<ScrollView
			contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
			keyboardShouldPersistTaps="handled"
		>
			<Stack spacing={16}>
				<Text variant="text-md/normal">
					Tap an AO3 link in any chat to read it here, or paste one below. Tap
					the page to show or hide the bars; Aa changes the text, ☰ jumps
					between chapters. Your place is saved.
				</Text>
				<Stack spacing={8}>
					<TextInput
						placeholder="archiveofourown.org/works/…"
						value={link}
						onChange={setLink}
						isClearable
					/>
					<Button
						text={id ? 'Read' : 'Paste an AO3 work link'}
						disabled={!id}
						onPress={() => id && openReader(id)}
					/>
				</Stack>
				{works.length ? (
					<TableRowGroup title="Your library">
						{works.map(w => {
							const pct =
								w.total > 1 ? Math.round((w.index / (w.total - 1)) * 100) : 0
							return (
								<TableRow
									key={w.id}
									label={w.title}
									subLabel={`${w.author} · ${w.chapters > 1 ? `ch ${w.chapter + 1}/${w.chapters} · ` : ''}${pct}%`}
									onPress={() => openReader(w.id)}
									trailing={
										<Pressable
											hitSlop={10}
											onPress={() => forget(w.id)}
											accessibilityLabel={`Remove ${w.title}`}
										>
											<Text variant="text-md/bold" color="text-muted">
												✕
											</Text>
										</Pressable>
									}
								/>
							)
						})}
					</TableRowGroup>
				) : null}
				<TableRowGroup title="Options">
					<TableSwitchRow
						label="Open AO3 links in the reader"
						subLabel="Instead of the browser"
						value={s.links}
						onValueChange={(links: boolean) => save({ links })}
					/>
				</TableRowGroup>
				<TableRowGroup title="Status">
					<TableRow
						label="Link taps"
						subLabel={status.links ? 'Hooked' : 'Waiting for a chat to open'}
					/>
					<TableRow
						label="Reader"
						subLabel={
							status.host
								? 'Ready'
								: 'Ready here; restart Discord once for links'
						}
					/>
				</TableRowGroup>
			</Stack>
			<ReaderHost />
			<View />
		</ScrollView>
	)
}

/** True when [url] was an AO3 work and the reader took it. */
function take(url: unknown): boolean {
	if (external.skip || !useSettingsSafe().links) return false
	const id = workIdOf(url)
	return !!id && openReader(id)
}
const useSettingsSafe = (): Settings => {
	try {
		return { ...DEFAULTS, ...(storageRef?.cache ?? {}) }
	} catch {
		return DEFAULTS
	}
}
let storageRef: any

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }) {
		storageRef = jsonStorage
		bindStorage(jsonStorage)
		cleanup(
			findModule(
				'modules/toast/native/AppToastContainer.tsx',
				['AppToastContainer'],
				(mod: any) => {
					if (typeof mod?.default !== 'function') return
					status.host = true
					cleanup(
						after(mod, 'default', ((rendered: any) => (
							<>
								{rendered}
								<ReaderHost />
							</>
						)) as never),
					)
				},
			),
			getModules((withProps as any)('handleClick'), (mod: any) => {
				if (typeof mod?.handleClick !== 'function') return
				status.links = true
				cleanup(
					instead(
						mod,
						'handleClick',
						function (this: unknown, args: any[], orig: (...a: any[]) => any) {
							if (take(args[0]?.href)) return
							return orig.apply(this, args)
						},
					),
				)
			}) as any,
			instead(
				Linking,
				'openURL',
				function (args: any[], orig: (...a: any[]) => any) {
					if (take(args[0])) return Promise.resolve(true)
					return orig.apply(Linking, args)
				},
			),
			() => {
				bindStorage(undefined)
				storageRef = undefined
			},
		)
	},
	SettingsComponent: Library,
})
