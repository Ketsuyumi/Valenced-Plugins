import { ClientInfoModule } from '@valenced/discord/native'
import { getJsonStorage } from '@valenced/json-storage'
import { lookupModule } from '@valenced/modules/finders'
import { createFilterGenerator, FilterScopes } from '@valenced/modules/finders/filters'
import { getInitializedModuleExports, isModuleExportBad, isModuleInitialized, onModuleInitialized } from '@valenced/modules/metro'
import { before, instead } from '@valenced/patcher'
import { pluginStorageDirFor } from '@valenced/plugins/constants'
import { React, ReactJSXRuntime } from '@valenced/react'

/**
 * Finding the status line (member list and DM header), without watching every element forever.
 *
 * The status line is a different component in each place and has no name to find it by, so the
 * original plugin hooks `jsx`, `jsxs` and `createElement` and checks every element Discord makes
 * (~180 a second) for its props. This fork does that only to *learn*:
 *
 * 1. When a status element turns up, its component is patched once at the source: an object
 *    component (memo / forwardRef) in place, a function component through the module that exports
 *    it (found once, and remembered per Discord version, so the next start patches it right away).
 * 2. Once every status component seen is patched at the source and nothing new has turned up for a
 *    while, the three per-element hooks are removed.
 *
 * If a status element ever arrives with its original, unpatched component (a caller that kept its
 * own reference), that one keeps being wrapped per element and the hooks stay. "Always watch" in
 * settings keeps the original behaviour.
 */

export interface StatusProps {
	userId?: string
	textStyle?: unknown
}

export const isStatusProps = (props: unknown): props is StatusProps =>
	typeof props === 'object' &&
	props !== null &&
	'textStyle' in props &&
	'userId' in props &&
	!!(props as StatusProps).textStyle &&
	!!(props as StatusProps).userId

type Render = (...args: any[]) => any

interface Saved {
	build: string
	modules: { id: number; key: string }[]
}

/** How long after the last new status component the per-element hooks stay on. */
const LEARN_MS = 60_000

export const statusInfo = {
	found: 0,
	patchedAtSource: 0,
	watching: true,
	remembered: 0,
}

export function installStatus(options: {
	/** Draws the label into what the status component rendered. */
	decorate: (props: StatusProps, rendered: any) => any
	/** Components to leave alone (the plugin's own wrappers). */
	isOurs: (type: unknown) => boolean
	/** Wraps one element's component (the per-element fallback). */
	wrap: (type: any) => any
	alwaysWatch: () => boolean
	/** True while rendering something the label must stay out of (DM rows). */
	skip: () => boolean
	reportError: (error: unknown) => void
	pluginId: string
}): () => void {
	const undo: Array<() => void> = []
	/** Components found, by the original. */
	const seen = new Set<object>()
	/** Originals patched at the source, and the wrappers that now stand in for them. */
	const atSource = new Set<object>()
	const standIns = new WeakSet<object>()
	/** Originals that still turn up unpatched: they need the per-element hooks. */
	const needsHooks = new Set<object>()
	let lastNew = Date.now()
	let filterCount = 0

	const build = (() => {
		try {
			return String((ClientInfoModule as any).getConstants?.()?.Version ?? '')
		} catch {
			return ''
		}
	})()
	const store = getJsonStorage<Saved>(`${pluginStorageDirFor(options.pluginId)}/status-modules.json`)
	let saved: Saved = { build, modules: [] }

	const remember = (id: number, key: string) => {
		if (saved.modules.some(m => m.id === id && m.key === key)) return
		saved = { build, modules: [...saved.modules, { id, key }] }
		statusInfo.remembered = saved.modules.length
		void store.set(saved, true).catch(options.reportError)
	}

	/** Puts the label into [host][key]'s output, for every caller at once. */
	const patchAt = (host: any, key: string): boolean => {
		const target = host?.[key]
		if (typeof target !== 'function' || options.isOurs(target)) return false
		undo.push(
			instead(host, key, function (this: unknown, args: any[], orig: Render) {
				const rendered = Reflect.apply(orig, this, args)
				try {
					return isStatusProps(args[0]) && !options.skip() ? options.decorate(args[0], rendered) : rendered
				} catch (error) {
					options.reportError(error)
					return rendered
				}
			}),
		)
		standIns.add(host[key])
		return true
	}

	/** host/key for a dotted key like "default.type" on [exports]. */
	const resolve = (exports: any, key: string): [any, string] | undefined => {
		const parts = key.split('.')
		let host = exports
		for (const p of parts.slice(0, -1)) host = host?.[p]
		return host ? [host, parts[parts.length - 1]] : undefined
	}

	/** Where [type] sits on [exports], as a dotted key. */
	const keyOf = (exports: any, type: object): string | undefined => {
		if (!exports || typeof exports !== 'object') return undefined
		for (const k of Object.keys(exports)) {
			const v = exports[k]
			if (v === type) return k
			if (v && typeof v === 'object' && v.type === type) return `${k}.type`
		}
		return undefined
	}

	const sourcePatch = (type: object): boolean => {
		// memo / forwardRef objects: patch their render function in place.
		if (typeof type === 'object') {
			const t = type as any
			if (typeof t.type === 'function') return patchAt(t, 'type')
			if (typeof t.render === 'function') return patchAt(t, 'render')
			return false
		}
		// A function component: find the module exporting it, once.
		try {
			const filter = createFilterGenerator<[target: object, n: number]>(
				([target], _id, exports) => !isModuleExportBad(exports) && keyOf(exports, target) !== undefined,
				([, n]) => `last-online-plus.status(${n})`,
				FilterScopes.Initialized,
			)
			const [exports, id] = lookupModule(filter(type, filterCount++)) as unknown as [any, number | undefined]
			const key = keyOf(exports, type)
			if (exports && id !== undefined && key) {
				const at = resolve(exports, key)
				if (at && patchAt(at[0], at[1])) {
					remember(id, key)
					return true
				}
			}
		} catch (error) {
			options.reportError(error)
		}
		return false
	}

	/** Records a status component. True the first time it is seen. */
	const onStatusType = (type: object): boolean => {
		if (seen.has(type)) {
			// Seen before and patched at the source, yet here it is unpatched: this caller kept
			// its own reference, so it needs the per-element hooks.
			if (atSource.has(type)) needsHooks.add(type)
			return false
		}
		seen.add(type)
		statusInfo.found = seen.size
		lastNew = Date.now()
		if (sourcePatch(type)) {
			atSource.add(type)
			statusInfo.patchedAtSource = atSource.size
		} else needsHooks.add(type)
		return true
	}

	// The per-element hooks (the original plugin's approach), used to learn.
	let hooks: Array<() => void> = []
	const hook = (args: any[]) => {
		const [type, props] = args
		if ((typeof type === 'function' || (typeof type === 'object' && type)) && isStatusProps(props)) {
			if (standIns.has(type) || options.isOurs(type) || options.skip()) return args
			const first = onStatusType(type)
			// This element was made before the source patch: wrap it too.
			if (first || !atSource.has(type) || needsHooks.has(type)) args[0] = options.wrap(type)
		}
		return args
	}
	const startHooks = () => {
		if (hooks.length) return
		hooks = [
			before(ReactJSXRuntime, 'jsx', hook as never),
			before(ReactJSXRuntime, 'jsxs', hook as never),
			before(React, 'createElement', hook as never),
		]
		statusInfo.watching = true
	}
	const stopHooks = () => {
		for (const h of hooks.splice(0)) h()
		statusInfo.watching = false
	}
	startHooks()

	// Status components remembered from an earlier start on this Discord version: patch them now.
	void store
		.get()
		.then(value => {
			if (!value || value.build !== build || !Array.isArray(value.modules)) return
			saved = value
			statusInfo.remembered = value.modules.length
			for (const { id, key } of value.modules) {
				const apply = (exports: any) => {
					const at = resolve(exports, key)
					const target = at?.[0]?.[at[1]]
					if (!target || seen.has(target)) return
					seen.add(target)
					if (at && patchAt(at[0], at[1])) atSource.add(target)
					statusInfo.found = seen.size
					statusInfo.patchedAtSource = atSource.size
				}
				if (isModuleInitialized(id)) apply(getInitializedModuleExports(id))
				else undo.push(onModuleInitialized(id, () => apply(getInitializedModuleExports(id))))
			}
		})
		.catch(options.reportError)

	// Stop watching every element once learning has settled.
	const timer = setInterval(() => {
		if (options.alwaysWatch()) return startHooks()
		const settled = Date.now() - lastNew > LEARN_MS
		if (settled && seen.size > 0 && needsHooks.size === 0) stopHooks()
	}, 10_000)

	return () => {
		clearInterval(timer)
		stopHooks()
		for (const u of undo.splice(0))
			try {
				u()
			} catch {}
	}
}
