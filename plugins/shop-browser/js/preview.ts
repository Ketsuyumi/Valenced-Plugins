import {
	getModules,
	lookupModule,
	lookupModules,
} from '@valenced/modules/finders'
import {
	createFilterGenerator,
	FilterScopes,
	withProps,
} from '@valenced/modules/finders/filters'
import { Linking } from 'react-native'

/**
 * Opening Discord's own item sheet (your profile with the item, and Redeem / Buy), three ways in
 * turn. Buying always happens in Discord's sheet; this never spends Orbs or money itself.
 *
 * 1. A Discord function that opens a collectible's details: first the names it has had, then any
 *    loaded function whose name says so (open…Collectible/Shop/Product…Detail/Sheet/Modal/Preview).
 * 2. Discord's own link handler (`handleClick`, what tapping a link in chat runs) with the item's
 *    Shop link, so Discord opens it the way it opens a shared Shop link.
 * 3. The system, with the same link.
 */

export const previewStatus = {
	last: 'Not tried yet',
	candidates: [] as string[],
}

const KNOWN = [
	'openCollectiblesShopProductDetailsModal',
	'openCollectiblesShopProductDetails',
	'openCollectibleProductDetails',
	'openProductDetailsSheet',
	'openCollectiblesProductDetails',
]
const NAME =
	/^(open|show|present)\w*(collectible|shop|product)\w*(detail|sheet|modal|preview)/i

const withOpener = createFilterGenerator<[]>(
	(_args, _id, exports, initialized) => {
		if (
			!initialized ||
			!exports ||
			(typeof exports !== 'object' && typeof exports !== 'function')
		)
			return false
		try {
			return Object.keys(exports as object).some(
				k => NAME.test(k) && typeof (exports as any)[k] === 'function',
			)
		} catch {
			return false
		}
	},
	() => 'shop-browser.product-opener',
	FilterScopes.Initialized,
)

/** Discord functions that look like they open an item's details, known names first. */
function openers(): Array<[string, (...a: any[]) => unknown]> {
	const out: Array<[string, (...a: any[]) => unknown]> = []
	const seen = new Set<string>()
	for (const name of KNOWN)
		try {
			const [mod] = lookupModule((withProps as any)(name)) as any
			if (typeof mod?.[name] === 'function' && !seen.has(name)) {
				seen.add(name)
				out.push([name, mod[name].bind(mod)])
			}
		} catch {}
	try {
		let n = 0
		for (const [mod] of lookupModules((withOpener as any)()) as any) {
			for (const k of Object.keys(mod ?? {}))
				if (NAME.test(k) && typeof mod[k] === 'function' && !seen.has(k)) {
					seen.add(k)
					out.push([k, mod[k].bind(mod)])
				}
			if (++n > 30) break
		}
	} catch {}
	previewStatus.candidates = out.map(([k]) => k)
	return out
}

let linkHandler: ((e: any) => unknown) | undefined
export function watchLinkHandler(): () => void {
	return getModules((withProps as any)('handleClick'), (mod: any) => {
		if (typeof mod?.handleClick === 'function')
			linkHandler = mod.handleClick.bind(mod)
	}) as any
}

export function openItemSheet(product: {
	sku: string
	raw?: any
	rawCategory?: any
}): boolean {
	const args = {
		product: product.raw,
		category: product.rawCategory,
		skuId: product.sku,
		sku_id: product.sku,
		analyticsLocations: [],
		analyticsSource: 'shop-browser',
	}
	for (const [name, fn] of openers()) {
		try {
			fn(args)
			previewStatus.last = `Discord's ${name}`
			return true
		} catch {}
		try {
			fn(product.raw, product.rawCategory)
			previewStatus.last = `Discord's ${name} (product, category)`
			return true
		} catch {}
	}
	const href = `https://discord.com/shop#itemSkuId=${product.sku}`
	if (linkHandler)
		try {
			linkHandler({ href, preventDefault() {}, stopPropagation() {} })
			previewStatus.last = "Discord's link handler (Shop link)"
			return true
		} catch {}
	void Linking.openURL(href).catch(() => {})
	previewStatus.last = 'System link (Discord found no way to open it)'
	return false
}
