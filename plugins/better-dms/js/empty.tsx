import { Design } from '@valenced/discord/design'
import { afterJSX } from '@valenced/react/jsx-runtime'
import { cloneElement } from 'react'
import { currentTab, firstTab } from './list'
import { on } from './state'
import { tabList } from './tabs'

/**
 * A tab with nothing in it showed Discord's empty DM list ("DMs with superpowers… Add Friends"),
 * which read as if your DMs were gone. While a tab other than the first is showing, that text
 * says what's going on instead, and the Add Friends button is left out. The texts are matched as
 * Discord writes them (English), the way Mute Bubble finds its menu row.
 */

const TITLE = /^DMs with superpowers$/i
const BODY = /^Invite your friends to play games/i
const BUTTON = /^Add Friends$/i

const filtering = () => on('tabs') && currentTab() !== firstTab()

function emptyText(): [string, string] {
	const t = currentTab()
	if (t === 'unread') return ['No unread messages', "You're all caught up ✨"]
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

const textOf = (children: unknown): string =>
	typeof children === 'string'
		? children
		: Array.isArray(children)
			? children.filter(c => typeof c === 'string').join('')
			: ''

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
