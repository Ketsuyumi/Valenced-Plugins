import { Design } from '@valenced/discord/design'
import { afterJSX } from '@valenced/react/jsx-runtime'
import { Stores } from '@valenced/discord/flux'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { cloneElement, createElement } from 'react'
import { Image, Text as RNText, View } from 'react-native'
import { currentTab, firstTab, shows } from './list'
import { on } from './state'
import { tabList } from './tabs'

/**
 * A tab with nothing in it showed Discord's empty DM list ("DMs with superpowers… Add Friends"),
 * which read as if your DMs were gone. While a tab other than the first is showing, that text
 * says what's going on instead, and the Add Friends button is left out. The texts are matched as
 * Discord writes them (English), the way Mute Bubble finds its menu row.
 */

const TITLE = /^DMs with superpowers$/i
const BODY = /Invite your friends to play|listen to music together/i
const BUTTON = /^Add Friends$/i

const filtering = () => on('tabs') && currentTab() !== firstTab()

function emptyText(): [string, string] {
	const t = currentTab()
	if (t === 'unread')
		return ['No unread messages', "Looks like you've read everything for now."]
	if (t === 'pinned')
		return ['No pinned DMs', 'Long-press a DM → DM options → Pin to top.']
	if (t === 'friends')
		return [
			'No DMs with friends',
			'DMs with people on your friends list show up here.',
		]
	if (t === 'groups') return ['No group chats', 'Your group DMs show up here.']
	const name = tabList().find(([x]) => x === t)?.[1] ?? 'this label'
	return [
		`Nothing labelled ${name}`,
		'Give a DM this label from its DM options.',
	]
}

/** All the text in [children], however it's built (strings, arrays, nested text elements). */
function textOf(children: unknown, depth = 0): string {
	if (depth > 4 || children == null || typeof children === 'boolean') return ''
	if (typeof children === 'string' || typeof children === 'number')
		return String(children)
	if (Array.isArray(children))
		return children.map(c => textOf(c, depth + 1)).join('')
	if (typeof children === 'object')
		return textOf((children as any).props?.children, depth + 1)
	return ''
}

/** The tab showing has no DMs at all (so Discord is drawing its empty screen). */
function tabEmpty(): boolean {
	try {
		const map = (Stores as any).ChannelStore?.getMutablePrivateChannels?.()
		if (!map) return false
		return !Object.keys(map).some(id => shows(id))
	} catch {
		return false
	}
}

const MARK = '__betterDmsArt'
/** In place of the empty screen's picture: a sleeping Clyde. */
function SleepyClyde() {
	const Icon: any = lookupGeneratedIconComponent('ClydeIcon' as any)
	return (
		<View
			style={{
				width: 120,
				height: 96,
				alignItems: 'center',
				justifyContent: 'center',
				marginBottom: 8,
			}}
		>
			{Icon ? (
				<Icon size="custom" width={72} height={72} color="#b5bac1" />
			) : (
				<RNText style={{ fontSize: 56 }}>😴</RNText>
			)}
			<RNText
				style={{
					position: 'absolute',
					right: 6,
					top: 4,
					color: '#b5bac1',
					fontSize: 15,
					fontWeight: '700',
				}}
			>
				z <RNText style={{ fontSize: 19 }}>z</RNText>{' '}
				<RNText style={{ fontSize: 24 }}>Z</RNText>
			</RNText>
		</View>
	)
}

/** A big picture from Discord's own files (the empty screen's art), not avatars or loaded images. */
function isArt(el: any): boolean {
	if (el?.props?.[MARK]) return false
	const src = el?.props?.source
	if (typeof src !== 'number') return false
	const st = [el.props.style]
		.flat(4)
		.reduce((a: any, b: any) => ({ ...a, ...(b ?? {}) }), {})
	const w = Number(st.width)
	const h = Number(st.height)
	// Sized big, or not sized at all (it then takes the picture's own size; icons are always sized).
	if (!st.width && !st.height) return true
	return (w >= 120 && h >= 70) || (!!st.aspectRatio && w >= 120)
}

export function installEmptyText(): () => void {
	const undo: Array<() => void> = []
	const T = (Design as any).Text
	if (T)
		undo.push(
			afterJSX(T, (el: any) => {
				if (!filtering()) return el
				const text = textOf(el?.props?.children)
				if (!text) return el
				if (TITLE.test(text)) return cloneElement(el, undefined, emptyText()[0])
				if (BODY.test(text)) return cloneElement(el, undefined, emptyText()[1])
				return el
			}) as any,
		)
	undo.push(
		afterJSX(Image as any, (el: any) =>
			filtering() && isArt(el) && tabEmpty()
				? createElement(SleepyClyde, { key: el?.key ?? 'bdms-art' })
				: el,
		) as any,
	)
	const B = (Design as any).Button
	if (B)
		undo.push(
			afterJSX(B, (el: any) =>
				filtering() &&
				BUTTON.test(String(el?.props?.text ?? textOf(el?.props?.children)))
					? null
					: el,
			) as any,
		)
	return () => {
		for (const u of undo.splice(0))
			try {
				u()
			} catch {}
	}
}
