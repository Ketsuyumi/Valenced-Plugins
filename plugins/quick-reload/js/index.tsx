import { getAssetIdByName } from '@valenced/assets'
import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { RootNavigationRef } from '@valenced/discord/modules/main_tabs_v2'
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
import { cloneElement, createElement, Fragment, isValidElement } from 'react'
import { ScrollView } from 'react-native'
import type { PluginApi } from '@valenced/plugins/types'
import type { ReactElement } from 'react'

interface Settings {
	/** A reload button on the bar with your name, next to the bell. */
	barButton: boolean
	/** A "Reload Discord" row in Discord's settings. */
	settingsRow: boolean
	/** A button on the bar that opens the Performance Monitor plugin's page. */
	monitorButton: boolean
}

type Api = PluginApi<{ jsonStorage: Settings }>

const DEFAULTS: Settings = {
	barButton: true,
	settingsRow: true,
	monitorButton: false,
}

const reload = () => BundleUpdaterManager.reload()

/** dariussbezy's Performance Monitor. Valenced registers a plugin's settings page as a route named after its id. */
const MONITOR_ROUTE = 'dariuss.performance-monitor'

function openMonitor() {
	try {
		const navigation = RootNavigationRef.getRootNavigationRef() as any
		if (typeof navigation?.navigate !== 'function')
			throw new Error('no navigation')
		navigation.navigate('settings', { screen: MONITOR_ROUTE })
	} catch {
		try {
			ToastActionCreators.open('quick-reload-monitor', {
				text: "Couldn't open Performance Monitor. Is the plugin installed and on?",
			} as never)
		} catch {}
	}
}

/** One button on the bar: what it shows and does. */
interface BarButton {
	key: string
	label: string
	icons: string[]
	onPress: () => void
	enabled: (settings: Settings) => boolean
}

const BAR_BUTTONS: BarButton[] = [
	{
		key: 'quick-reload-monitor',
		label: 'Performance Monitor',
		icons: ['AnalyticsIcon', 'ChartIcon', 'StatsIcon', 'PollsIcon'],
		onPress: openMonitor,
		enabled: settings => settings.monitorButton,
	},
	{
		key: 'quick-reload',
		label: 'Reload Discord',
		icons: ['RefreshIcon', 'ArrowsCircularIcon', 'RetryIcon'],
		onPress: reload,
		enabled: settings => settings.barButton,
	},
]

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

/** Asset id of the first icon name that exists, looked up once per button. */
const iconIds = new Map<string, number | undefined>()
function iconId(button: BarButton) {
	if (!iconIds.has(button.key))
		iconIds.set(
			button.key,
			button.icons
				.map(name => getAssetIdByName(name))
				.find((id): id is number => typeof id === 'number'),
		)
	return iconIds.get(button.key)
}

/** Fallback when the bell's own button can't be copied: small, no outline. */
function FallbackButton({ button }: { button: BarButton }) {
	const { IconButton } = Design
	const icon = iconId(button)
	if (icon === undefined) return null
	return (
		<IconButton
			icon={icon}
			variant="tertiary"
			size="sm"
			accessibilityLabel={button.label}
			onPress={button.onPress}
		/>
	)
}

const MAX_DEPTH = 8

/** Path from `node` down to the first element with an onPress (the bell's pressable). */
function pathToPressable(node: unknown, depth = 0): ReactElement<any>[] | null {
	if (depth > MAX_DEPTH || !isValidElement<any>(node)) return null
	if (typeof node.props?.onPress === 'function') return [node]
	const children = node.props?.children
	for (const child of Array.isArray(children) ? children : [children]) {
		const path = pathToPressable(child, depth + 1)
		if (path) return [node, ...path]
	}
	return null
}

/**
 * A copy of the bell button Discord rendered, with the reload icon and action: same container,
 * size and style as the bar's other buttons. Siblings along the way (like the unread badge) are
 * dropped. Null if the bell doesn't have the expected shape.
 */
function copyOfBell(rendered: unknown, spec: BarButton): ReactElement | null {
	const path = pathToPressable(rendered)
	if (!path) return null
	const button = path[path.length - 1]
	const props = button.props as any
	const icon = iconId(spec)

	let swapped: Record<string, unknown> | null = null
	if (typeof props.icon === 'number' && icon !== undefined) swapped = { icon }
	else if (props.IconComponent) {
		const Icon = spec.icons
			.map(name => lookupGeneratedIconComponent(name as never))
			.find(Boolean)
		if (Icon) swapped = { IconComponent: Icon }
	} else if (props.source !== undefined && icon !== undefined)
		swapped = { source: icon }
	if (!swapped) return null

	let copy: ReactElement = cloneElement(button, {
		...swapped,
		onPress: spec.onPress,
		accessibilityLabel: spec.label,
		ref: null,
	} as any)
	// Rebuild the containers above it, keeping only the path to the button.
	for (let i = path.length - 2; i >= 0; i--)
		copy = cloneElement(path[i], { ref: null } as any, copy)
	return cloneElement(copy, { key: spec.key })
}

/** The bell with this plugin's enabled buttons in front of it. */
function withBarButtons(rendered: unknown, settings: Settings) {
	const buttons = BAR_BUTTONS.filter(button => button.enabled(settings))
	if (!buttons.length) return rendered
	return createElement(
		Fragment,
		null,
		...buttons.map(
			button =>
				copyOfBell(rendered, button) ??
				createElement(FallbackButton, { key: button.key, button }),
		),
		rendered as any,
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
						label="Performance Monitor button on your bar"
						subLabel="Opens the Performance Monitor plugin's page. Needs that plugin installed and on."
						value={settings.monitorButton}
						onValueChange={(monitorButton: boolean) => set({ monitorButton })}
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
					<TableRow
						label="Open Performance Monitor"
						arrow
						onPress={openMonitor}
					/>
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
										active
											? withBarButtons(rendered, settings())
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
