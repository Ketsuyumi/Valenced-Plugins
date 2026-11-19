import { Design } from '@valenced/discord/design'
import { afterJSX } from '@valenced/react/jsx-runtime'
import { createElement, Fragment } from 'react'
import { ScrollView } from 'react-native'
import { autoStatus, startAuto } from './auto'
import {
	bindStorage,
	DEFAULTS,
	type Settings,
	save,
	useSettings,
} from './state'
import { patchTiles, tileStatus } from './tiles'

type Key = keyof Settings
const ROWS: Array<[Key, string, string]> = [
	[
		'autoWatch',
		'Auto-watch streams',
		'Start watching when someone in the call goes live',
	],
	[
		'autoFocus',
		'Auto-focus streams',
		'Show the stream big right away (no tapping, also with Only Show Videos)',
	],
	[
		'autoNext',
		'Next stream when one ends',
		"Switch to someone else who's live",
	],
	['notify', '"Went live" toast', 'When someone in your call starts streaming'],
	[
		'ignoreOwn',
		'Ignore my own stream',
		'Never auto-watch or focus your own screen share',
	],
	[
		'showBar',
		'Stream bar',
		'On the focused stream: switch streams, mute, volume, clean view',
	],
	[
		'clean',
		'Clean view',
		'Only the stream: hides the parts chosen below (👁 on the stream toggles it)',
	],
	[
		'cleanHidesTiles',
		'Clean view hides other tiles',
		"Everyone else's cameras and avatars",
	],
	[
		'cleanHidesControls',
		'Clean view hides call controls',
		'The mute / camera / hang-up bar',
	],
]

function SwitchRow({ k, Row }: { k: Key; Row: any }) {
	const s = useSettings()
	const [, label, sub] = ROWS.find(r => r[0] === k)!
	return (
		<Row
			label={label}
			subLabel={sub}
			value={!!s[k]}
			onValueChange={(v: boolean) => save({ [k]: v })}
		/>
	)
}

/** In the call's menu: the switches you'd change mid-call. */
const MENU_KEYS: Key[] = ['autoWatch', 'autoFocus', 'clean']

function SettingsPage() {
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow } = Design as any
	return (
		<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
			<Stack spacing={16}>
				<Text variant="text-md/normal">
					More control when watching streams in a call. Auto-watch, auto-focus
					and clean view are also in the call's menu, under Only Show Videos.
				</Text>
				<TableRowGroup title="Watching">
					{(
						[
							'autoWatch',
							'autoFocus',
							'autoNext',
							'notify',
							'ignoreOwn',
						] as Key[]
					).map(k => (
						<SwitchRow key={k} k={k} Row={TableSwitchRow} />
					))}
				</TableRowGroup>
				<TableRowGroup title="On the call screen">
					{(
						[
							'showBar',
							'clean',
							'cleanHidesTiles',
							'cleanHidesControls',
						] as Key[]
					).map(k => (
						<SwitchRow key={k} k={k} Row={TableSwitchRow} />
					))}
				</TableRowGroup>
				<TableRowGroup title="Status">
					<TableRow
						label="Call tiles"
						subLabel={
							tileStatus.cards ? 'Hooked' : 'Not found yet (join a call)'
						}
					/>
					<TableRow
						label="Tile overlays"
						subLabel={
							tileStatus.overlays ? 'Hooked' : 'Not found yet (join a call)'
						}
					/>
					<TableRow
						label="Call controls"
						subLabel={
							tileStatus.controls.length
								? tileStatus.controls.join(', ')
								: "Not found yet. If clean view doesn't hide them, send a screenshot of this page."
						}
					/>
					<TableRow
						label="In this call"
						subLabel={`${autoStatus.streams} live, watching ${autoStatus.watching} · ${autoStatus.lastAction}`}
					/>
				</TableRowGroup>
			</Stack>
		</ScrollView>
	)
}

/** [element] is the row labelled [label], or a group another plugin made around it. */
function hasRow(element: any, label: string, depth = 0): boolean {
	if (!element || typeof element !== 'object' || depth > 3) return false
	const own = element.props?.label
	if (typeof own === 'string' && own.trim().toLowerCase() === label) return true
	const kids = element.props?.children
	if (element.type !== Fragment || kids == null) return false
	return (Array.isArray(kids) ? kids : [kids]).some((k: any) =>
		hasRow(k, label, depth + 1),
	)
}
const rowTypes = () =>
	new Set(
		['TableRow', 'ActionSheetRow', 'TableSwitchRow', 'ActionSheetSwitchRow']
			.map(n => (Design as any)[n])
			.filter(Boolean),
	)

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }) {
		bindStorage(jsonStorage)
		cleanup(startAuto(), patchTiles())
		const SwitchRowType = (Design as any).TableSwitchRow
		for (const Row of rowTypes())
			cleanup(
				afterJSX(Row, (element: any) => {
					if (
						!hasRow(element, 'only show videos') ||
						element?.props?.__streamTools
					)
						return element
					return createElement(
						Fragment,
						{ key: element?.key ?? 'stream-tools', __streamTools: true } as any,
						element,
						...MENU_KEYS.map(k =>
							createElement(SwitchRow, {
								key: `stream-tools-${k}`,
								k,
								Row: SwitchRowType,
							}),
						),
					)
				}) as any,
			)
		cleanup(() => bindStorage(undefined))
	},
	SettingsComponent: SettingsPage,
})
