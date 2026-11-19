import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { createElement, isValidElement } from 'react'
import { View } from 'react-native'
import { getLastSeenLabel, getSettings, isInVoice } from './presence'
import { installStatus, isStatusProps } from './status'
import type { StatusProps } from './status'
import type { DiscordModules } from '@valenced/discord/types'
import type { InsteadHook } from '@valenced/patcher/types'
import type {
	ElementType,
	JSXElementConstructor,
	ReactElement,
	ReactNode,
} from 'react'
import type { Api } from './presence'

const { Text } = Design

const RowNames = [
	'MessagesItemChannelFast',
	'MessagesItemChannelFlash',
	'MessagesItemChannelLegend',
] as const

type AnyElement = ReactElement<Record<string, any>>

// DISCORD

interface RowProps {
	channelId?: string
	channel?: { recipients?: string[] }
}

type RowRender = (props: RowProps) => ReactElement | null
type RowModule = Record<(typeof RowNames)[number], { type: RowRender }>

type ChannelStore = DiscordModules.Flux.Store<{
	getChannel(channelId: string): { recipients?: string[] } | undefined
}>

type Renderable =
	| ((props: object) => ReactNode)
	| { type?: Renderable; render?: (props: object, ref: null) => ReactNode }

/** Wrappers and the name row we add. Both are skipped when a cached tree gets decorated again. */
const ours = new WeakSet<object>()
const wrappers = new WeakMap<object, ElementType>()
/** What a name row held before the label went in, so a cached tree never stacks labels. */
const originalChildren = new WeakMap<object, ReactNode>()

let api: Api | undefined
let inDmRow = false
let reported = false

// UI

function LastSeenText({ children }: { children: string }) {
	return (
		<Text variant="text-xs/medium" color="text-muted">
			{children}
		</Text>
	)
}

function hasVisibleText(node: ReactNode): boolean {
	if (node == null || node === '') return false
	if (typeof node === 'string') return node.trim().length > 0
	if (Array.isArray(node)) return node.some(hasVisibleText)
	if (isValidElement<{ children?: ReactNode }>(node))
		return 'children' in node.props ? hasVisibleText(node.props.children) : true

	return false
}

/** Finds the first element in a rendered tree, walking `children` depth-first. */
function findElement(
	tree: ReactNode,
	match: (element: AnyElement) => boolean,
): AnyElement | undefined {
	if (Array.isArray(tree)) {
		for (const child of tree) {
			const found = findElement(child, match)
			if (found) return found
		}
		return
	}

	if (!isValidElement<Record<string, any>>(tree)) return
	return match(tree) ? tree : findElement(tree.props.children, match)
}

/** Finds every matching element, without looking inside the ones that match. */
function findElements(
	tree: ReactNode,
	match: (element: AnyElement) => boolean,
	found: AnyElement[] = [],
) {
	if (Array.isArray(tree)) {
		for (const child of tree) findElements(child, match, found)
	} else if (isValidElement<Record<string, any>>(tree)) {
		if (match(tree)) found.push(tree)
		else findElements(tree.props.children, match, found)
	}

	return found
}

function renderInner(type: Renderable, props: object): ReactNode {
	if (typeof type === 'function') {
		if (!type.prototype?.isReactComponent) return type(props)
	} else if (type.type) {
		return renderInner(type.type, props)
	} else if (type.render) {
		return type.render(props, null)
	}

	return createElement(type as ElementType, props)
}

// STATUS LINE

/** Shows the label in the status line of the member list and DM header. */
function overlayStatus({ userId }: StatusProps, rendered: ReactNode) {
	if (!userId || !getSettings().memberList) return rendered

	const label = getLastSeenLabel(userId)
	if (!label) return rendered
	if (!hasVisibleText(rendered)) return <LastSeenText>{label}</LastSeenText>

	// Anything else here is a profile's custom status bubble, which stays untouched.
	if (!isInVoice(userId)) return rendered

	return (
		<View
			style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}
		>
			{rendered}
			<LastSeenText>{` · ${label}`}</LastSeenText>
		</View>
	)
}

function wrapStatus(type: Renderable): ElementType {
	let wrapper = wrappers.get(type)
	if (!wrapper) {
		const status = (props: StatusProps) =>
			overlayStatus(props, renderInner(type, props))
		ours.add(status)
		wrappers.set(type, status)
		wrapper = status
	}

	return wrapper
}

// DM ROWS

const isPassthrough = (node: ReactNode): node is ReactElement<RowProps> =>
	isValidElement<RowProps & { children?: ReactNode }>(node) &&
	typeof node.type !== 'string' &&
	node.props.children == null

const isNameRow = (element: AnyElement) =>
	Array.isArray(element.props.children) &&
	element.props.children[0]?.props?.variant === 'text-md/medium'

function restoreName(element: AnyElement) {
	if (!originalChildren.has(element.props)) return

	element.props.children = originalChildren.get(element.props)
	originalChildren.delete(element.props)
}

/** Each DM row is a few components deep. Wrapping every layer lets us decorate the one that holds the name. */
function wrapLayer(type: string | JSXElementConstructor<any>): ElementType {
	if (typeof type === 'string' || ours.has(type)) return type as ElementType

	let wrapper = wrappers.get(type)
	if (!wrapper) {
		const layer = (props: RowProps) => {
			inDmRow = true
			try {
				return decorate(props, renderInner(type as Renderable, props))
			} finally {
				inDmRow = false
			}
		}
		ours.add(layer)
		wrappers.set(type, layer)
		wrapper = layer
	}

	return wrapper
}

function decorate(props: RowProps, rendered: ReactNode): ReactNode {
	if (!api) return rendered
	if (isPassthrough(rendered))
		return createElement(wrapLayer(rendered.type), rendered.props)

	try {
		if (!getSettings().dmList) return rendered

		const nameRow = findElement(
			rendered,
			element =>
				!ours.has(element) &&
				(originalChildren.has(element.props) || isNameRow(element)),
		)
		if (!nameRow) {
			for (const layer of findElements(rendered, e => !!e.props.channel))
				layer.type = wrapLayer(layer.type)
			return rendered
		}

		const channel =
			props.channel ??
			(props.channelId
				? (Stores.ChannelStore as ChannelStore | undefined)?.getChannel(
						props.channelId,
					)
				: undefined)
		const [recipient, ...others] = channel?.recipients ?? []
		const label = recipient && !others.length && getLastSeenLabel(recipient)
		if (!label) {
			restoreName(nameRow)
			return rendered
		}

		const original = originalChildren.has(nameRow.props)
			? originalChildren.get(nameRow.props)
			: nameRow.props.children
		originalChildren.set(nameRow.props, original)

		const names = (
			<View style={{ flexDirection: 'row', alignItems: 'center' }}>
				{original}
			</View>
		)
		ours.add(names)
		nameRow.props.children = (
			<View style={{ flexDirection: 'column' }}>
				{names}
				<LastSeenText>{label}</LastSeenText>
			</View>
		)
	} catch (error) {
		if (!reported) api.plugin.reportError(error)
		reported = true
	}

	return rendered
}

const rowHook: InsteadHook<RowRender> = (args, orig) => {
	const rendered = Reflect.apply(orig, undefined, args)
	return api && isValidElement(rendered) && typeof rendered.type !== 'string'
		? createElement(wrapLayer(rendered.type), rendered.props as object)
		: rendered
}

export function patchLastSeen(pluginApi: Api) {
	const { cleanup, plugin } = pluginApi
	api = pluginApi
	reported = false

	cleanup(
		getModules(
			withProps<RowModule>(...RowNames),
			rows => {
				try {
					for (const name of RowNames)
						cleanup(instead(rows[name], 'type', rowHook))
				} catch (error) {
					plugin.reportError(error)
				}
			},
			{ max: 1 },
		),
		installStatus({
			decorate: (props, rendered) => overlayStatus(props, rendered),
			isOurs: type => typeof type === 'object' || typeof type === 'function' ? ours.has(type as object) : false,
			wrap: type => wrapStatus(type as Renderable),
			alwaysWatch: () => !!getSettings().alwaysWatch,
			skip: () => inDmRow,
			reportError: error => plugin.reportError(error),
			pluginId: plugin.manifest.id,
		}),
		() => {
			api = undefined
		},
	)
}
