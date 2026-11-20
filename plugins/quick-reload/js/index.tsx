/// <reference types="@valenced/types/hidden" />
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
import { getModules, lookupModule } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	FilterScopes,
	withProps,
} from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { isPluginEnabled, pList } from '@valenced/plugins/_'
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
	/** A button on the bar that opens Valenced's Plugins page. */
	pluginsButton: boolean
	/** A button on the bar that opens the Friends list. */
	friendsButton: boolean
	/** Take the Favorites (star) button that YouBar+ / Better You Bar adds off the bar. */
	hideFavorites: boolean
}

type Api = PluginApi<{ jsonStorage: Settings }>

const DEFAULTS: Settings = {
	barButton: true,
	settingsRow: true,
	monitorButton: false,
	pluginsButton: false,
	friendsButton: false,
	hideFavorites: false,
}

const reload = () => BundleUpdaterManager.reload()

/** dariussbezy's Performance Monitor. Valenced registers a plugin's settings page as a route named after its id. */
const MONITOR_ROUTE = 'dariuss.performance-monitor'

/** Opens a screen of Discord's settings from anywhere. Shows [failure] as a toast if it can't. */
function openSettingsScreen(route: string, failure: string) {
	try {
		const navigation = RootNavigationRef.getRootNavigationRef() as any
		if (typeof navigation?.navigate !== 'function')
			throw new Error('no navigation')
		navigation.navigate('settings', { screen: route })
	} catch {
		try {
			ToastActionCreators.open('quick-access-open', { text: failure } as never)
		} catch {}
	}
}

/**
 * Whether Performance Monitor's page exists. Opening a settings screen that isn't registered
 * crashes Discord ("Couldn't find a screen named …"), so the route is looked up first in Discord's
 * settings registry, where Valenced registers plugin pages. True / false when the registry could be
 * read; undefined when it couldn't (then the button is shown and opening is attempted as before).
 */
function monitorInstalled(): boolean | undefined {
	try {
		const config = settingsConfig()
		if (!config) return undefined
		return Object.entries(config).some(
			([key, item]: [string, any]) =>
				key === MONITOR_ROUTE || item?.screen?.route === MONITOR_ROUTE,
		)
	} catch {
		return undefined
	}
}

/**
 * Whether Performance Monitor is installed and switched on, from Valenced's own plugin list.
 * Its settings page stays registered while it's off, so the page alone can't tell.
 */
function monitorOn(): boolean | undefined {
	try {
		const p = pList.get(MONITOR_ROUTE)
		if (!p) return false
		return isPluginEnabled(p)
	} catch {
		return monitorInstalled()
	}
}

function openMonitor() {
	if (monitorInstalled() === false) {
		try {
			ToastActionCreators.open('quick-access-open', {
				text: "Performance Monitor isn't installed. It's dariussbezy's plugin (dariuss.performance-monitor): add it from the plugin list first.",
			} as never)
		} catch {}
		return
	}
	openSettingsScreen(
		MONITOR_ROUTE,
		"Couldn't open Performance Monitor. Is the plugin installed and on?",
	)
}

/** Valenced's own Plugins page: the settings item's key, and the route it has by Valenced's naming. */
const PLUGINS_SETTING = 'ValencedPlugins'
const PLUGINS_ROUTE_FALLBACK = 'Valenced Plugins'

/**
 * The route of Valenced's Plugins page, read from Discord's settings registry (where Valenced
 * registers its items) so a renamed route still works; the conventional name otherwise.
 */
/** Discord's settings registry (every settings screen, plugin pages included). */
function settingsConfig(): Record<string, any> | undefined {
	const found = lookupModule(
		withProps<{ SETTING_RENDERER_CONFIG: Record<string, any> }>(
			'SETTING_RENDERER_CONFIG',
		),
	)?.[0]
	return found?.SETTING_RENDERER_CONFIG
}

function pluginsRoute(): string {
	try {
		const config = settingsConfig()
		const route = config?.[PLUGINS_SETTING]?.screen?.route
		if (typeof route === 'string' && route) return route
	} catch {}
	return PLUGINS_ROUTE_FALLBACK
}

const openPlugins = () =>
	openSettingsScreen(pluginsRoute(), "Couldn't open the Plugins page.")

/**
 * The Friends screen of Discord's root navigator. Its name is read from the navigator's own
 * list of screens (so a rename is followed); `friends` is what it has been called.
 */
function friendsRoute(navigation: any): string {
	try {
		const names: unknown = navigation?.getRootState?.()?.routeNames
		if (Array.isArray(names)) {
			const all = names.filter((n): n is string => typeof n === 'string')
			const exact = all.find(n => /^friends?$/i.test(n))
			if (exact) return exact
			const close = all.find(
				n => /friend/i.test(n) && !/add|request|suggest/i.test(n),
			)
			if (close) return close
		}
	} catch {}
	return 'friends'
}

function openFriends() {
	try {
		const navigation = RootNavigationRef.getRootNavigationRef() as any
		if (typeof navigation?.navigate !== 'function')
			throw new Error('no navigation')
		navigation.navigate(friendsRoute(navigation))
	} catch {
		try {
			ToastActionCreators.open('quick-access-open', {
				text: "Couldn't open Friends.",
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

/** In bar order, left to right; the bell comes after the last one. */
const BAR_BUTTONS: BarButton[] = [
	{
		key: 'quick-reload-monitor',
		label: 'Performance Monitor',
		icons: ['AnalyticsIcon', 'ChartIcon', 'StatsIcon', 'PollsIcon'],
		onPress: openMonitor,
		// Not on the bar when Performance Monitor isn't installed or is switched off.
		enabled: settings => settings.monitorButton && monitorOn() !== false,
	},
	{
		key: 'quick-reload',
		label: 'Reload Discord',
		icons: ['RefreshIcon', 'ArrowsCircularIcon', 'RetryIcon'],
		onPress: reload,
		enabled: settings => settings.barButton,
	},
	{
		key: 'quick-access-friends',
		label: 'Friends',
		icons: ['FriendsIcon', 'GroupIcon', 'UserPlusIcon', 'UserIcon'],
		onPress: openFriends,
		enabled: settings => settings.friendsButton,
	},
	{
		key: 'quick-access-plugins',
		label: 'Plugins',
		icons: ['PuzzlePieceIcon', 'AppsIcon', 'WrenchIcon', 'SettingsIcon'],
		onPress: openPlugins,
		enabled: settings => settings.pluginsButton,
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

let starIcon: number | undefined | null = null

/** A Favorites button as other bar plugins add it: a pressable labelled Favorites or with the star icon. */
function isFavoritesButton(node: ReactElement<any>): boolean {
	const props = node.props
	if (typeof props?.onPress !== 'function') return false
	if (
		typeof props.accessibilityLabel === 'string' &&
		/^favou?rites?$/i.test(props.accessibilityLabel.trim())
	)
		return true
	if (starIcon === null) starIcon = getAssetIdByName('StarIcon')
	return (
		typeof starIcon === 'number' &&
		(props.icon === starIcon || props.source === starIcon)
	)
}

/**
 * What the bar plugins and Discord rendered, without the Favorites button. A container left
 * with nothing in it goes too, so no empty slot stays behind. Everything else is returned as it
 * was (the same objects when nothing matched).
 */
function withoutFavorites(node: unknown, depth = 0): unknown {
	if (depth > MAX_DEPTH || node == null || typeof node !== 'object') return node
	if (Array.isArray(node)) {
		let changed = false
		const out: unknown[] = []
		for (const child of node) {
			const next = withoutFavorites(child, depth + 1)
			if (next !== child) changed = true
			if (next != null) out.push(next)
		}
		return changed ? out : node
	}
	if (!isValidElement<any>(node)) return node
	if (isFavoritesButton(node)) return null
	const children = node.props?.children
	if (children == null || typeof children !== 'object') return node
	const next = withoutFavorites(children, depth + 1)
	if (next === children) return node
	// Its only content was the star: drop the wrapper as well.
	if (next == null || (Array.isArray(next) && next.length === 0)) return null
	return cloneElement(node, undefined, ...(Array.isArray(next) ? next : [next]))
}

/** The bell with this plugin's enabled buttons in front of it. */
function withBarButtons(input: unknown, settings: Settings) {
	// The buttons are copied from the bell as it was rendered, so this comes first.
	const rendered = settings.hideFavorites ? withoutFavorites(input) : input
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
				<TableRowGroup title="Buttons on your bar">
					<TableSwitchRow
						label="Reload button on your bar"
						subLabel="Next to the bell, on the bar with your name"
						value={settings.barButton}
						onValueChange={(barButton: boolean) => set({ barButton })}
					/>
					<TableSwitchRow
						label="Performance Monitor button on your bar"
						subLabel="Opens dariussbezy's Performance Monitor plugin (dariuss.performance-monitor). Only shows while that plugin is installed and on."
						value={settings.monitorButton}
						onValueChange={(monitorButton: boolean) => set({ monitorButton })}
					/>
					<TableSwitchRow
						label="Friends button on your bar"
						subLabel="Opens your Friends list"
						value={settings.friendsButton}
						onValueChange={(friendsButton: boolean) => set({ friendsButton })}
					/>
					<TableSwitchRow
						label="Plugins button on your bar"
						subLabel="Opens Valenced's Plugins page"
						value={settings.pluginsButton}
						onValueChange={(pluginsButton: boolean) => set({ pluginsButton })}
					/>
				</TableRowGroup>
				<TableRowGroup title="Other bar plugins">
					<TableSwitchRow
						label="Hide the Favorites button"
						subLabel="Takes the star that YouBar+ or Better You Bar adds off the bar, so Plugins sits in its place"
						value={settings.hideFavorites}
						onValueChange={(hideFavorites: boolean) => set({ hideFavorites })}
					/>
				</TableRowGroup>
				<TableRowGroup title="Discord's settings">
					<TableSwitchRow
						label="Row in Discord's settings"
						subLabel='"Reload Discord", at the top of Settings'
						value={settings.settingsRow}
						onValueChange={(settingsRow: boolean) => set({ settingsRow })}
					/>
				</TableRowGroup>
				<TableRowGroup>
					<TableRow label="Reload Discord now" arrow onPress={reload} />
					<TableRow label="Open Friends" arrow onPress={openFriends} />
					<TableRow label="Open Plugins" arrow onPress={openPlugins} />
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
						label: 'Quick Access',
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
