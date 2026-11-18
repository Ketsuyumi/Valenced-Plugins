import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { instead } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { findModule } from './find'

/**
 * "Open as grid" at the top of a forum channel's long-press menu.
 *
 * Same approach as Yumistra's Better Channel List (GPL-3.0): Discord opens the sheet with
 * `ActionSheetActionCreators.openLazy(modulePromise, 'ChannelLongPress…', props)`, so the module is
 * patched as it arrives (and by path, if it's already loaded), and a row group is added in front of
 * the sheet's own groups. If the sheet's top component only returns an inner one, that inner
 * component is wrapped instead.
 */

const SHEET = 'modules/channel/native/ChannelLongPressActionSheet.tsx'
const KEY = 'forum-grid-row'

export const isForum = (channel: any) => channel?.type === 15 || channel?.type === 16

const nameOf = (t: any): string =>
	t?.name || t?.displayName || t?.type?.name || t?.type?.displayName || t?.render?.name || ''
const flat = (c: any): any[] => (Array.isArray(c) ? c.flatMap(flat) : [c])
function isGroup(n: any) {
	if (!n || typeof n !== 'object' || Array.isArray(n)) return false
	const G = (Design as any).ActionSheetRow?.Group
	return (G && n.type === G) || /ActionSheetRowGroup$/.test(nameOf(n.type))
}

function addRow(node: any, channel: any, open: () => void, depth = 0): any {
	if (!node || typeof node !== 'object' || depth > 10) return node
	if (Array.isArray(node)) {
		let changed = false
		const out = node.map(n => {
			const r = addRow(n, channel, open, depth + 1)
			if (r !== n) changed = true
			return r
		})
		return changed ? out : node
	}
	const props = node.props
	if (!props) return node
	if ((props.showGradient !== undefined && 'header' in props) || flat(props.children).some(isGroup)) {
		const { ActionSheetRow } = Design as any
		if (!ActionSheetRow?.Group) return node
		const kids = Array.isArray(props.children) ? props.children : [props.children]
		if (kids.some((k: any) => k?.key === KEY)) return node
		const Icon: any =
			lookupGeneratedIconComponent('GridSquareIcon' as any) ??
			lookupGeneratedIconComponent('ImageIcon' as any)
		const group = (
			<ActionSheetRow.Group key={KEY} hasIcons={!!Icon}>
				<ActionSheetRow
					label="Open as grid"
					icon={Icon ? <ActionSheetRow.Icon IconComponent={Icon} /> : undefined}
					onPress={open}
				/>
			</ActionSheetRow.Group>
		)
		return { ...node, props: { ...props, children: [group, ...kids] } }
	}
	if (props.children == null || typeof props.children !== 'object') return node
	const kids = addRow(props.children, channel, open, depth + 1)
	return kids === props.children ? node : { ...node, props: { ...props, children: kids } }
}

export function installSheet(options: {
	enabled: () => boolean
	open: (channel: any) => void
}): () => void {
	const undo: Array<() => void> = []
	const patched = new WeakSet<object>()
	const wrapped = new WeakMap<object, any>()

	const decorate = (out: any, props: any) => {
		const channel =
			props?.channel ??
			(props?.channelId ? (Stores as any).ChannelStore?.getChannel?.(props.channelId) : undefined)
		if (!options.enabled() || !isForum(channel)) return out
		const open = () => {
			try {
				if (typeof props?.onClose === 'function') props.onClose()
				else (ActionSheetActionCreators as any).hideActionSheet?.()
			} catch {}
			setTimeout(() => options.open(channel), 250)
		}
		const direct = addRow(out, channel, open)
		if (direct !== out) return direct
		const type = out?.type
		const render = type?.$$typeof === Symbol.for('react.memo') ? type.type : type
		if (typeof render !== 'function') return out
		let inner = wrapped.get(type)
		if (!inner) {
			inner = function ForumGridSheet(p: any) {
				const o = render(p)
				try {
					return options.enabled() ? addRow(o, channel, open) : o
				} catch {
					return o
				}
			}
			wrapped.set(type, inner)
		}
		return { ...out, type: inner }
	}

	const patchMod = (mod: any) => {
		if (!mod || typeof mod.default !== 'function' || patched.has(mod)) return mod
		try {
			undo.push(
				instead(mod, 'default', function (this: unknown, args: any[], orig: (...a: any[]) => any) {
					const out = orig.apply(this, args)
					try {
						return decorate(out, args[0])
					} catch {
						return out
					}
				}),
			)
			patched.add(mod)
		} catch {}
		return mod
	}

	try {
		undo.push(
			instead(ActionSheetActionCreators as any, 'openLazy', function (this: unknown, args: any[], orig: (...a: any[]) => any) {
				try {
					const [sheet, key] = args
					if (typeof key === 'string' && /ChannelLongPress/i.test(key) && typeof sheet?.then === 'function')
						args[0] = sheet.then((m: any) => patchMod(m))
				} catch {}
				return orig.apply(this, args)
			}),
		)
	} catch {}
	undo.push(findModule(SHEET, [], (mod: any) => void patchMod(mod)))
	return () => {
		for (const u of undo.splice(0))
			try {
				u()
			} catch {}
	}
}
