import { getAssetIdByName } from '@valenced/assets'
import { Design } from '@valenced/discord/design'
import {
	onSettingsModulesLoaded,
	registerSettingsItem,
	registerSettingsSection,
} from '@valenced/discord/modules/settings'
import { BundleUpdaterManager } from '@valenced/discord/native'
import { getModules } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	FilterScopes,
} from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { createElement, Fragment } from 'react'
import { ScrollView } from 'react-native'
import type { PluginApi } from '@valenced/plugins/types'

interface Settings {
	/** A reload button on the bar with your name, next to the bell. */
	barButton: boolean
	/** A "Reload Discord" row in Discord's settings. */
	settingsRow: boolean
}

type Api = PluginApi<{ jsonStorage: Settings }>

const DEFAULTS: Settings = { barButton: true, settingsRow: true }

const reload = () => BundleUpdaterManager.reload()

/** Name of a component: plain, memo, forwardRef, or memo(forwardRef(...)). */
const nameOf = (value: unknown, depth = 0): string => {
	const v = value as any
	if (!v || depth > 3) return ''
	if (typeof v === 'function') return v.displayName || v.name || ''
	if (typeof v !== 'object') return ''
	return (
		v.displayName ||
		nameOf(v.type, depth + 1) ||
		nameOf(v.render, depth + 1) ||
		''
	)
}

/** Modules exporting a component with this name (default or named export). */
const withComponentName = createFilterGenerator<[name: string]>(
	([name], _id, exports) => {
		if (
			!exports ||
			(typeof exports !== 'object' && typeof exports !== 'function')
		)
			return false
		if (nameOf(exports) === name) return true
		if (typeof exports !== 'object') return false
		for (const key of Object.keys(exports)) {
			try {
				if (nameOf((exports as any)[key]) === name) return true
			} catch {}
		}
		return false
	},
	([name]) => `dev.ketsuyumi.quick-reload.componentName(${name})`,
	FilterScopes.Initialized,
)

let refreshIcon: number | undefined | null = null
function iconId() {
	if (refreshIcon === null)
		refreshIcon = ['RefreshIcon', 'ArrowsCircularIcon', 'RetryIcon']
			.map(name => getAssetIdByName(name))
			.find((id): id is number => typeof id === 'number')
	return refreshIcon
}

function ReloadButton() {
	const { IconButton } = Design
	const icon = iconId()
	if (icon === undefined) return null
	return (
		<IconButton
			icon={icon}
			variant="secondary"
			size="md"
			accessibilityLabel="Reload Discord"
			onPress={reload}
		/>
	)
}

function SettingsPage({ api }: { api: Api }) {
	const { Stack, Text, TableRowGroup, TableSwitchRow, TableRow } = Design
	const settings = { ...DEFAULTS, ...api.jsonStorage.use() }
	const set = (patch: Partial<Settings>) =>
		api.jsonStorage.set({ ...settings, ...patch }, true)

	return (
		<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
			<Stack spacing={24}>
				<TableRowGroup title="Where to show it">
					<TableSwitchRow
						label="Button on your bar"
						subLabel="Next to the bell, on the bar with your name"
						value={settings.barButton}
						onValueChange={(barButton: boolean) => set({ barButton })}
					/>
					<TableSwitchRow
						label="Row in Discord's settings"
						subLabel='"Reload Discord", at the top of Settings'
						value={settings.settingsRow}
						onValueChange={(settingsRow: boolean) => set({ settingsRow })}
					/>
				</TableRowGroup>
				<TableRowGroup>
					<TableRow label="Reload Discord now" arrow onPress={reload} />
				</TableRowGroup>
				<Text variant="text-sm/medium" color="text-muted">
					Reloading restarts Discord's JavaScript, like the reload in older
					clients. Plugin updates that are waiting also take effect.
				</Text>
			</Stack>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage, logger }) {
		const settings = () => ({ ...DEFAULTS, ...jsonStorage.cache })

		// 1. A row in Discord's settings (documented API).
		cleanup(
			onSettingsModulesLoaded(() => {
				cleanup(
					registerSettingsSection('QUICK_RELOAD', {
						label: 'Quick Reload',
						settings: ['QUICK_RELOAD_RELOAD'],
						index: 0,
					}),
					registerSettingsItem('QUICK_RELOAD_RELOAD', {
						type: 'pressable',
						parent: null,
						useTitle: () => 'Reload Discord',
						IconComponent:
							lookupGeneratedIconComponent('RefreshIcon') ?? undefined,
						usePredicate: () => settings().settingsRow,
						onPress: reload,
					}),
				)
			}),
		)

		// 2. A button next to the YouBar's bell: patches YouBarNotificationsButton, which
		//    only runs when that button renders.
		let active = true
		cleanup(() => {
			active = false
		})
		const patched = new WeakSet<object>()
		cleanup(
			getModules(
				withComponentName('YouBarNotificationsButton'),
				namespace => {
					const ns = namespace as any
					if (!ns || typeof ns !== 'object') return
					for (const key of Object.keys(ns)) {
						const value = ns[key]
						if (nameOf(value) !== 'YouBarNotificationsButton') continue
						const [target, prop] =
							typeof value === 'function'
								? [ns, key]
								: typeof value?.type === 'function'
									? [value, 'type']
									: typeof value?.render === 'function'
										? [value, 'render']
										: [null, null]
						if (!target || patched.has(target[prop as string])) continue
						try {
							cleanup(
								after(
									target,
									prop as never,
									((rendered: unknown) =>
										active && settings().barButton
											? createElement(
													Fragment,
													null,
													createElement(ReloadButton),
													rendered as any,
												)
											: rendered) as never,
								),
							)
							patched.add(target[prop as string])
							logger.log(
								`Reload button added next to YouBarNotificationsButton (${key})`,
							)
						} catch {
							// Read-only re-export; the source module is patched instead.
						}
					}
				},
				{ returnNamespace: true, max: 5 },
			),
		)
	},
	SettingsComponent: SettingsPage,
})
