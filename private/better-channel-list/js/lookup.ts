import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

/**
 * Better Channel List+: module lookups, remembered.
 *
 * The original called lookupModule(withProps(...)) every time it needed a module, including
 * several times per channel row while the list was being measured and drawn. A found module is
 * now kept for good; a miss is tried again at most every two seconds, since the module may
 * simply not be loaded yet.
 */
const found = new Map<string, any>()
const missedAt = new Map<string, number>()
const RETRY_MS = 2000

export function find(...props: string[]): any {
	const key = props.join('|')
	const hit = found.get(key)
	if (hit !== undefined) return hit
	const now = Date.now()
	const last = missedAt.get(key)
	if (last !== undefined && now - last < RETRY_MS) return undefined
	let module: any
	try {
		module = (lookupModule((withProps as any)(...props)) as any)?.[0]
	} catch {}
	if (module != null) {
		found.set(key, module)
		missedAt.delete(key)
	} else missedAt.set(key, now)
	return module
}

export function clearLookups() {
	found.clear()
	missedAt.clear()
}
