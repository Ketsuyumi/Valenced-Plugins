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

function listGuilds(store: any): Guild[] {
	const array = store.getGuildsArray?.()
	if (Array.isArray(array)) return array
	const map = store.getGuilds?.()
	return map && typeof map === 'object' ? Object.values(map) : []
}

/** Original banners of the records cleared in place, to put back on stop. */
const originals = new WeakMap<object, string>()

/** Clears a guild record's banner in place. False if the record can't be changed (frozen). */
function clearInPlace(guild: Guild): boolean {
	if (!guild || typeof guild !== 'object' || !guild.banner) return true
	const original = guild.banner
	try {
		guild.banner = null // throws in strict mode if the record is frozen
	} catch {
		return false
	}
	if (guild.banner !== null) return false
	originals.set(guild, original)
	return true
}

function restoreInPlace(store: any) {
	for (const guild of listGuilds(store)) {
		const original = originals.get(guild)
		if (original && guild.banner == null) {
			try {
				guild.banner = original
			} catch {}
		}
	}
}

export default plugin({
	start({ cleanup, logger }) {
		const store = Stores.GuildStore as any
		if (!store) {
			logger.warn("Couldn't find GuildStore; banners stay visible")
			return
		}

		// Preferred: clear the banner on the records themselves, once, and again only when
		// servers change. Nothing runs when Discord reads a server, so no cost while drawing.
		const stripAllInPlace = () => {
			let ok = true
			for (const guild of listGuilds(store)) ok = clearInPlace(guild) && ok
			return ok
		}
		if (stripAllInPlace() && typeof store.addChangeListener === 'function') {
			const onChange = () => {
				stripAllInPlace()
			}
			store.addChangeListener(onChange)
			cleanup(() => {
				store.removeChangeListener?.(onChange)
				restoreInPlace(store)
				store.emitChange?.()
			})
			logger.log('Hiding banners in place (no store hooks)')
			store.emitChange?.()
			return
		}

		// Fallback, if records are frozen: hand out banner-less copies. The copies are made
		// now, so reading a server while drawing is only a lookup.
		restoreInPlace(store)
		for (const guild of listGuilds(store)) stripBanner(guild)
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
		logger.log(
			`Hiding banners via GuildStore.${patched.join(', ')} (records are frozen)`,
		)

		// Redraw now, and again after unpatching on stop (cleanups run in reverse).
		cleanup(() => store.emitChange?.())
		store.emitChange?.()
	},
})
