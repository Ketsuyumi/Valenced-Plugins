import { Stores } from '@valenced/discord/flux'
import { after } from '@valenced/patcher'

type Guild = Record<string, any> & { banner?: string | null }

/** Banner-less copy of each guild record, reused so Discord sees a stable object. */
const stripped = new WeakMap<object, Guild>()
const strippedMaps = new WeakMap<object, Record<string, Guild>>()

function stripBanner<T>(guild: T): T {
	const g = guild as Guild
	if (!g || typeof g !== 'object' || !g.banner) return guild
	let copy = stripped.get(g)
	if (!copy) {
		// Guild records are immutable; `set` returns an updated copy.
		const viaSet =
			typeof g.set === 'function' ? g.set('banner', null) : undefined
		copy =
			viaSet && typeof viaSet === 'object' && !viaSet.banner
				? viaSet
				: Object.assign(Object.create(Object.getPrototypeOf(g)), g, {
						banner: null,
					})
		stripped.set(g, copy as Guild)
	}
	return copy as T
}

function stripAll(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stripBanner)
	if (!value || typeof value !== 'object') return value
	let copy = strippedMaps.get(value)
	if (!copy) {
		copy = {}
		for (const [id, guild] of Object.entries(value))
			copy[id] = stripBanner(guild)
		strippedMaps.set(value, copy)
	}
	return copy
}

/** GuildStore methods that hand out guilds: one guild, or a map / list of them. */
const SINGLE = ['getGuild']
const MANY = ['getGuilds', 'getGuildsArray']

export default plugin({
	start({ cleanup, logger }) {
		const store = Stores.GuildStore as any
		if (!store) {
			logger.warn("Couldn't find GuildStore; banners stay visible")
			return
		}

		const patched: string[] = []
		for (const method of [...SINGLE, ...MANY]) {
			if (typeof store[method] !== 'function') continue
			cleanup(
				after(store, method, (result: unknown) =>
					SINGLE.includes(method) ? stripBanner(result) : stripAll(result),
				),
			)
			patched.push(method)
		}
		logger.log(`Hiding banners via GuildStore.${patched.join(', ')}`)

		// Redraw now, and again after unpatching on stop (cleanups run in reverse).
		cleanup(() => store.emitChange?.())
		store.emitChange?.()
	},
})
