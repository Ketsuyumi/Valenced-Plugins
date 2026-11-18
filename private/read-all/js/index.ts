/*
 * Read All Servers+ — a fork of "Read All Servers" by sapphire
 * (https://github.com/aeongdesu/slimplugins, plugins/read-all, commit f57bdfe),
 * licensed under the GNU General Public License v3.0. This fork is also GPL-3.0.
 *
 * Changes in this fork (Satou):
 * - The original hooked jsx/jsxs for every element Discord creates (~240k calls in a few
 *   minutes) to find the Messages icon. This fork patches GuildsBarAnimatedItemWrapper itself,
 *   so the check only runs when that component renders.
 */
import { ToastActionCreators } from '@valenced/discord/actions'
import { Stores, withStoreName } from '@valenced/discord/flux'
import { getModules, lookupModule } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	FilterScopes,
	withDependencies,
	withName,
} from '@valenced/modules/finders/filters'
import { before } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'

// thanks datamine wumpus
type MarkGuildsAsRead = (
	guildIds: string[],
	context?: string,
	onFinished?: () => void,
) => void

// blame @valenced/types
interface GuildStore {
	getGuildIds(): string[]
}

interface GuildReadStateStore {
	getGuildHasUnreadIgnoreMuted(guildId: string): boolean
}

export default plugin({
	init({ cleanup, plugin: self }) {
		if (self.startedLate) self.requireReload()
		let markGuildsAsRead: MarkGuildsAsRead | undefined

		// pain but okay
		const getMarkGuildsAsRead = () => {
			if (markGuildsAsRead) return markGuildsAsRead

			const anchorIds = [
				'ChannelStore',
				'GuildChannelStore',
				'ReadStateStore',
			].map(name => lookupModule(withStoreName(name))[1])
			if (anchorIds.includes(undefined)) return

			const { atLeast, unordered } = withDependencies
			const [exports, id] = lookupModule(
				withName<MarkGuildsAsRead>('markGuildsAsRead').and(
					withDependencies(atLeast(3, unordered(anchorIds as number[]))),
				),
			)
			if (id !== undefined) markGuildsAsRead = exports

			return markGuildsAsRead
		}

		const onMessagesLongPress = () => {
			const { GuildStore, GuildReadStateStore } = Stores as unknown as {
				GuildStore: GuildStore
				GuildReadStateStore: GuildReadStateStore
			}

			const unreadGuildIds = GuildStore.getGuildIds().filter(id =>
				GuildReadStateStore.getGuildHasUnreadIgnoreMuted(id),
			)
			if (!unreadGuildIds.length) return

			const markAsRead = getMarkGuildsAsRead()
			if (!markAsRead) return

			// why undefined? it just for client-sided analytics context
			markAsRead(unreadGuildIds, undefined, () => {
				ToastActionCreators.open('read-all-done', {
					text: `Read ${unreadGuildIds.length} servers!`,
					// why: its in init patch, this icon might dont exist when loads
					icon: lookupGeneratedIconComponent('ChatCheckIcon'),
				})
			})
		}

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
			([name]) => `dev.ketsuyumi.read-all.componentName(${name})`,
			FilterScopes.Initialized,
		)

		/** Adds the long press to the props of the Messages row's wrapper. */
		const addLongPress = (args: any[]) => {
			const props = args[0]
			if (nameOf(props?.expandedChildren?.type) !== 'HomeDrawerDMsRowWrapper')
				return args
			args[0] = {
				...props,
				config: { ...props.config, onLongPress: onMessagesLongPress },
			}
			return args
		}

		// Patch the component itself: runs only when it renders, not for every element.
		const patched = new WeakSet<object>()
		cleanup(
			getModules(
				withComponentName('GuildsBarAnimatedItemWrapper'),
				namespace => {
					const ns = namespace as any
					if (!ns || typeof ns !== 'object') return
					for (const key of Object.keys(ns)) {
						const value = ns[key]
						if (nameOf(value) !== 'GuildsBarAnimatedItemWrapper') continue
						// The render function: plain, memo (type) or forwardRef (render).
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
							cleanup(before(target, prop as never, addLongPress as never))
							patched.add(target[prop as string])
						} catch {
							// Read-only re-export; the source module is patched instead.
						}
					}
				},
				{ returnNamespace: true, max: 5 },
			),
		)
	},
	stop({ plugin }) {
		plugin.requireReload()
	},
})
