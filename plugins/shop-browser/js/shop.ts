import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

/**
 * The Discord Shop's data, from the same endpoints the app uses (documented by Discord
 * Userdoccers, resources/collectibles):
 *
 *   GET /collectibles-categories/v2?include_bundles=true&variants_return_style=1
 *       → { categories: [{ sku_id, name, products: [product] }] }
 *   GET /users/@me/collectibles-purchases → [product] (what you own)
 *
 * Requests go through Discord's own REST helper, which adds the account's auth itself.
 */

export const TYPES = {
	0: 'Decoration',
	1: 'Effect',
	2: 'Nameplate',
	3: 'Frame',
	1000: 'Bundle',
} as const
export type TypeId = keyof typeof TYPES

export interface Price {
	amount: number
	currency: string
	exponent: number
}

export interface Product {
	sku: string
	name: string
	summary: string
	type: number
	category: string
	categoryId: string
	image?: string
	/** Normal price (money), if it has one. */
	money?: Price
	/** Price in Orbs, if it can be bought with Orbs. */
	orbs?: number
	/** Price with Nitro, if cheaper. */
	nitro?: Price
	order: number
}

interface Http {
	get(req: { url: string }): Promise<{ body?: any }>
}
function http(): Http {
	const [found] = lookupModule(
		(withProps as any)('getAPIBaseURL', 'get', 'put', 'del'),
	) as unknown as [Http | undefined]
	if (!found) throw new Error("Couldn't find Discord's request helper")
	return found
}

export function errorText(error: unknown): string {
	const e = error as { body?: any; status?: number; message?: string }
	return e?.body?.message ?? (e?.status ? `HTTP ${e.status}` : (e?.message ?? String(error)))
}

const httpUrl = (value: unknown) =>
	typeof value === 'string' && /^https?:\/\//.test(value) ? value : undefined

/** A still image for the grid. Effects and some items only have APNGs; Android shows their first frame. */
export function imageOf(product: any): string | undefined {
	const items: any[] = product?.items ?? []
	const item = items[0]
	const preview = product?.preview_assets
	const fromItem =
		httpUrl(item?.assets?.static_image_url) ??
		httpUrl(item?.staticFrameSrc) ??
		httpUrl(item?.thumbnailPreviewSrc) ??
		httpUrl(item?.reducedMotionSrc)
	if (fromItem) return fromItem
	if (item?.type === 0 && item?.asset)
		return `https://cdn.discordapp.com/avatar-decoration-presets/${item.asset}.png?size=160&passthrough=false`
	if (item?.type === 2 && item?.asset)
		return `https://cdn.discordapp.com/assets/collectibles/${item.asset}static.png`
	const fromPreview = httpUrl(preview?.fg_static) ?? httpUrl(preview?.bg_static)
	if (fromPreview) return fromPreview
	for (const inner of product?.bundled_products ?? []) {
		const img = imageOf(inner)
		if (img) return img
	}
	return undefined
}

function pricesOf(product: any, purchaseType: number): Price[] {
	const set = product?.prices?.[purchaseType] ?? product?.prices?.[String(purchaseType)]
	const list: any[] = set?.country_prices?.prices ?? []
	return list
		.filter(p => typeof p?.amount === 'number' && p?.currency)
		.map(p => ({
			amount: p.amount,
			currency: String(p.currency),
			exponent: p.exponent ?? p.currency_exponent ?? 0,
		}))
}

export function toProduct(raw: any, category: any, order: number): Product {
	const base = pricesOf(raw, 0)
	const nitroList = pricesOf(raw, 3)
	const money = base.find(p => p.currency !== 'discord_orb')
	const orbs = [...base, ...nitroList].find(p => p.currency === 'discord_orb')
	const nitro = nitroList.find(p => p.currency !== 'discord_orb')
	return {
		sku: String(raw.sku_id),
		name: String(raw.name ?? ''),
		summary: String(raw.summary ?? ''),
		type: Number(raw.type),
		category: String(category?.name ?? ''),
		categoryId: String(category?.sku_id ?? raw.category_sku_id ?? ''),
		image: imageOf(raw),
		money,
		orbs: orbs?.amount,
		nitro: nitro && money && nitro.amount < money.amount ? nitro : undefined,
		order,
	}
}

export interface Shop {
	products: Product[]
	categories: { id: string; name: string }[]
	owned: Set<string>
}

export async function loadShop(): Promise<Shop> {
	const { body } = await http().get({
		url: '/collectibles-categories/v2?include_bundles=true&variants_return_style=1',
	})
	const categories: any[] = Array.isArray(body) ? body : (body?.categories ?? [])
	const products: Product[] = []
	const seen = new Set<string>()
	let order = 0
	for (const category of categories)
		for (const raw of category?.products ?? []) {
			// Variant groups list their variants; show each one.
			const list = Number(raw?.type) === 2000 ? (raw.variants ?? []) : [raw]
			for (const item of list) {
				if (!item?.sku_id || seen.has(String(item.sku_id))) continue
				if (Number(item.type) === 3000) continue // Nitro credit and other non-collectibles
				seen.add(String(item.sku_id))
				products.push(toProduct(item, category, order++))
			}
		}
	let owned = new Set<string>()
	try {
		const res = await http().get({ url: '/users/@me/collectibles-purchases?variants_return_style=1' })
		const list: any[] = Array.isArray(res.body) ? res.body : []
		owned = new Set(list.map(p => String(p?.sku_id)))
	} catch {}
	return {
		products,
		categories: categories
			.filter(c => c?.sku_id && (c.products?.length ?? 0) > 0)
			.map(c => ({ id: String(c.sku_id), name: String(c.name ?? '') })),
		owned,
	}
}

export function formatPrice(price?: Price): string | undefined {
	if (!price) return undefined
	const value = price.amount / 10 ** price.exponent
	try {
		return new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: price.currency.toUpperCase(),
		}).format(value)
	} catch {
		return `${value.toFixed(price.exponent)} ${price.currency.toUpperCase()}`
	}
}

export interface Filters {
	query: string
	type: 'all' | TypeId
	owned: 'all' | 'owned' | 'not-owned'
	pay: 'all' | 'orbs' | 'money'
	category: string
	sort: 'shop' | 'cheap' | 'pricey' | 'name'
}

export const DEFAULT_FILTERS: Filters = {
	query: '',
	type: 'all',
	owned: 'all',
	pay: 'all',
	category: 'all',
	sort: 'shop',
}

/** Money as a comparable number (Orbs-only items sort by Orbs after paid ones). */
const cost = (p: Product) =>
	p.money ? p.money.amount / 10 ** p.money.exponent : p.orbs != null ? 1e6 + p.orbs : Infinity

export function applyFilters(shop: Shop, f: Filters): Product[] {
	const q = f.query.trim().toLowerCase()
	const list = shop.products.filter(p => {
		if (f.type !== 'all' && p.type !== Number(f.type)) return false
		if (f.owned === 'owned' && !shop.owned.has(p.sku)) return false
		if (f.owned === 'not-owned' && shop.owned.has(p.sku)) return false
		if (f.pay === 'orbs' && p.orbs == null) return false
		if (f.pay === 'money' && !p.money) return false
		if (f.category !== 'all' && p.categoryId !== f.category) return false
		if (q && !`${p.name} ${p.category}`.toLowerCase().includes(q)) return false
		return true
	})
	const sorted = [...list]
	if (f.sort === 'cheap') sorted.sort((a, b) => cost(a) - cost(b))
	else if (f.sort === 'pricey') sorted.sort((a, b) => cost(b) - cost(a))
	else if (f.sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
	else sorted.sort((a, b) => a.order - b.order)
	return sorted
}
