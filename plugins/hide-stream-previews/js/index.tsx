import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { Design } from '@valenced/discord/design'
import { instead } from '@valenced/patcher'
import { afterJSX } from '@valenced/react/jsx-runtime'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { createElement, Fragment } from 'react'
import { ScrollView } from 'react-native'
import { findModule } from './find'

/**
 * The floating tile over the chat during a call or stream is
 * `modules/voice_panel/native/pip/VoicePanelPIP.tsx` (found by Yumistra for Voice Overlay). Its
 * components still run every render (so React's hooks stay in order) and what they draw is
 * dropped while the option is on.
 *
 * The switch in the call's menu goes right after "Change Audio Output", the way Mute Bubble (il1ll,
 * GPL-3.0) adds "Enable Bubble": every TableRow / ActionSheetRow element is looked at as it's made.
 */

const PIP = 'modules/voice_panel/native/pip/VoicePanelPIP.tsx'

interface Settings {
	hide: boolean
}
const DEFAULTS: Settings = { hide: true }
let storage: any
const hidden = () => (storage?.cache?.hide ?? DEFAULTS.hide) as boolean
const status = { tile: 'Not found yet (join a call)' }

function icon() {
	for (const name of [
		'EyeSlashIcon',
		'ScreenSlashIcon',
		'VideoSlashIcon',
		'VideoIcon',
	])
		if (lookupGeneratedIconComponent(name as never))
			return <TableRowAssetIcon name={name as never} />
	return undefined
}

function HideRow({ Row }: { Row: any }) {
	const value = storage?.use?.()?.hide ?? hidden()
	return (
		<Row
			label="Hide Stream Previews"
			subLabel="No floating call or stream tile over the chat"
			icon={icon()}
			value={value}
			onValueChange={(hide: boolean) => void storage?.set?.({ hide })}
		/>
	)
}

const isAudioOutputRow = (element: any) =>
	typeof element?.props?.label === 'string' &&
	element.props.label.trim().toLowerCase() === 'change audio output'

function SettingsPage() {
	const { TableRowGroup, TableRow, TableSwitchRow, Stack, Text } = Design as any
	return (
		<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
			<Stack spacing={16}>
				<Text variant="text-md/normal">
					Hides the small floating video tile that stays over the chat during a
					call or stream. The same switch is in the call's menu, under Change
					Audio Output.
				</Text>
				<TableRowGroup>
					<HideRow Row={TableSwitchRow} />
				</TableRowGroup>
				<TableRowGroup title="Status">
					<TableRow label="Floating tile" subLabel={status.tile} />
				</TableRowGroup>
			</Stack>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }) {
		storage = jsonStorage
		cleanup(
			findModule(PIP, [], (mod: any) => {
				// Components only: `default` and capitalised exports (memo / forwardRef included).
				const targets: Array<[any, string]> = []
				for (const key of Object.keys(mod ?? {})) {
					const v = mod[key]
					if (
						key !== 'default' &&
						!/^[A-Z]/.test(key) &&
						!/^[A-Z]/.test(v?.name ?? '')
					)
						continue
					if (typeof v === 'function') targets.push([mod, key])
					else if (v && typeof v === 'object') {
						if (typeof v.type === 'function') targets.push([v, 'type'])
						else if (typeof v.render === 'function') targets.push([v, 'render'])
					}
				}
				for (const [host, key] of targets)
					cleanup(
						instead(
							host,
							key,
							function (
								this: unknown,
								args: any[],
								orig: (...a: any[]) => any,
							) {
								// A hook, called every render so it is always in the same place: it redraws
								// the tile when the switch changes.
								let hide = hidden()
								try {
									hide = storage?.use?.()?.hide ?? hide
								} catch {}
								const out = orig.apply(this, args)
								return hide ? null : out
							},
						),
					)
				status.tile = targets.length
					? `Hooked (${targets.length})`
					: 'Found, but nothing to hook'
			}),
		)
		const SwitchRow = (Design as any).TableSwitchRow
		for (const Row of new Set(
			[(Design as any).TableRow, (Design as any).ActionSheetRow].filter(
				Boolean,
			),
		))
			cleanup(
				afterJSX(Row, (element: any) => {
					if (!isAudioOutputRow(element)) return element
					return createElement(
						Fragment,
						{ key: element?.key ?? 'hide-stream-previews' },
						element,
						createElement(HideRow, {
							key: 'hide-stream-previews-row',
							Row: SwitchRow,
						}),
					)
				}) as any,
			)
		cleanup(() => (storage = undefined))
	},
	SettingsComponent: SettingsPage,
})
