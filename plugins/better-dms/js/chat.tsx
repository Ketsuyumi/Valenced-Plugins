import { AlertActionCreators, ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, instead } from '@valenced/patcher'
import { cloneElement, isValidElement, useEffect, useState } from 'react'
import { View } from 'react-native'
import { findModule } from './find'
import { channel, dmData, isDmChannel, nameOf, on, onChange, recipientOf, settings } from './state'

const S = () => Stores as any
const selected = () => {
	const id = S().SelectedChannelStore?.getChannelId?.()
	return id ? channel(id) : undefined
}

// ---------------------------------------------------------------------------------------------
// Name banner above the message box, in the DM's colour.

function Banner() {
	const { Text } = Design as any
	const [, tick] = useState(0)
	useEffect(() => {
		const store = S().SelectedChannelStore
		const fn = () => tick(n => n + 1)
		store?.addChangeListener?.(fn)
		const off = onChange(fn)
		return () => {
			store?.removeChangeListener?.(fn)
			off()
		}
	}, [])
	if (!on('banner')) return null
	const c = selected()
	if (!isDmChannel(c)) return null
	const d = dmData(c.id)
	if (!d.color && !d.label && !d.emoji && !d.careful && !d.nickname) return null
	const color = (on('colors') && d.color) || '#4E5058'
	const parts = [
		on('emoji') && d.emoji,
		nameOf(c),
		on('labels') && d.label && `· ${d.label}`,
		on('guard') && d.careful && '· careful',
	].filter(Boolean)
	return (
		<View
			style={{
				marginHorizontal: 12,
				marginBottom: 4,
				paddingHorizontal: 10,
				paddingVertical: 4,
				borderRadius: 10,
				backgroundColor: `${color}33`,
				borderLeftWidth: 3,
				borderLeftColor: color,
			}}
		>
			<Text variant="text-xs/semibold" style={{ color }} numberOfLines={1}>
				To: {parts.join(' ')}
			</Text>
		</View>
	)
}

const banner = <Banner key="better-dms-banner" />

function isContainer(node: any) {
	const p = node?.props
	return !!p && p.collapsable === false && typeof p.onLayout === 'function' && Array.isArray(p.children)
}

function addBanner(tree: any, depth = 0): any {
	if (!tree || typeof tree !== 'object' || depth > 10) return tree
	if (isContainer(tree)) {
		if (tree.props.children.includes(banner)) return tree
		return cloneElement(tree, undefined, banner, ...tree.props.children)
	}
	const kids = tree.props?.children
	if (kids == null || typeof kids !== 'object') return tree
	if (Array.isArray(kids)) {
		for (let i = 0; i < kids.length; i++) {
			const next = addBanner(kids[i], depth + 1)
			if (next !== kids[i]) {
				const copy = [...kids]
				copy[i] = next
				return cloneElement(tree, undefined, ...copy)
			}
		}
		return tree
	}
	const next = addBanner(kids, depth + 1)
	return next === kids ? tree : cloneElement(tree, undefined, next)
}

export function installBanner(): () => void {
	const undo: Array<() => void> = []
	undo.push(
		findModule('modules/chat_input/native/ChatInput.tsx', [], (mod: any) => {
			const target = mod?.default
			const host = typeof target?.type === 'function' ? { o: target, k: 'type' } : typeof target === 'function' ? { o: mod, k: 'default' } : null
			if (!host) return
			undo.push(
				after(host.o, host.k, ((tree: any) => {
					try {
						if (!on('banner') || !isValidElement(tree)) return tree
						const placed = addBanner(tree)
						return placed !== tree ? placed : (
							<>
								{banner}
								{tree}
							</>
						)
					} catch {
						return tree
					}
				}) as never),
			)
		}),
	)
	return () => {
		for (const u of undo.splice(0))
			try {
				u()
			} catch {}
	}
}

// ---------------------------------------------------------------------------------------------
// "Send to …?" before sending in a DM marked careful.

export function installGuard(): () => void {
	const [mod] = lookupModule((withProps as any)('sendMessage', 'receiveMessage')) as unknown as [any]
	const host = typeof mod?.sendMessage === 'function' ? mod : mod?.default
	if (typeof host?.sendMessage !== 'function') return () => {}
	return instead(host, 'sendMessage', function (this: unknown, args: any[], orig: (...a: any[]) => any) {
		const channelId = args[0]
		const c = typeof channelId === 'string' ? channel(channelId) : undefined
		if (!on('guard') || !isDmChannel(c) || !dmData(c.id).careful) return orig.apply(this, args)
		const text = String(args[1]?.content ?? '')
		return new Promise(resolve => {
			const { AlertModal, AlertActionButton } = Design as any
			const key = `better-dms-guard-${Date.now()}`
			const close = () => (AlertActionCreators as any).dismissAlert(key)
			;(AlertActionCreators as any).openAlert(
				key,
				<AlertModal
					title={`Send to ${nameOf(c)}?`}
					content={text ? (text.length > 200 ? `${text.slice(0, 200)}…` : text) : 'This chat is marked careful.'}
					actions={
						<>
							<AlertActionButton
								text="Send"
								variant="primary"
								onPress={() => {
									close()
									resolve(orig.apply(this, args))
								}}
							/>
							<AlertActionButton
								text="Don't send"
								variant="secondary"
								onPress={() => {
									close()
									// Discord already cleared the box, so the text goes to the clipboard.
									if (text) void Clipboard.setString(text)
									try {
										ToastActionCreators.open('better-dms', { text: text ? 'Not sent · text copied' : 'Not sent' } as never)
									} catch {}
									resolve(undefined)
								}}
							/>
						</>
					}
				/>,
			)
		})
	})
}

// ---------------------------------------------------------------------------------------------
// Private nicknames: Discord's friend-nickname lookup returns yours for that person.

export function installNicknames(): () => void {
	const store = S().RelationshipStore
	if (typeof store?.getNickname !== 'function') return () => {}
	return instead(store, 'getNickname', function (this: unknown, args: any[], orig: (...a: any[]) => any) {
		try {
			const mine = typeof args[0] === 'string' ? nicknameFor(args[0]) : undefined
			if (mine) return mine
		} catch {}
		return orig.apply(this, args)
	})
}

export function nicknameFor(userId: string): string | undefined {
	if (!on('nicknames')) return undefined
	for (const [id, d] of Object.entries(settings().dms)) {
		if (!d.nickname) continue
		const c = channel(id)
		if (c?.type === 1 && recipientOf(c) === userId) return d.nickname
	}
	return undefined
}
