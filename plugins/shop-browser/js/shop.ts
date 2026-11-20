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
	/** Colour families of its colours (Discord's `styles`), for the Colour filter. */
	swatches: Swatch[]
	/** Theme / tag words Discord sends with the item or its category, when it does. */
	tags: string[]
	/** Popularity, when Discord's data has one (higher is more popular). */
	popularity?: number
	/** Discord's own records, for its item sheet (preview on your profile). */
	raw?: any
	rawCategory?: any
}

/** The desktop Shop's colour filter. */
export const SWATCHES = {
	purple: '#b388ff',
	blue: '#36c5f0',
	green: '#4cd964',
	brown: '#c87533',
	yellow: '#ffd60a',
	orange: '#ff9f0a',
	red: '#ff5a36',
	pink: '#ff6b9a',
	white: '#f2f2f2',
	black: '#3a3a3a',
} as const
export type Swatch = keyof typeof SWATCHES

/** Which family a colour (0xRRGGBB) belongs to, by hue, saturation and lightness. */
export function swatchOf(rgb: number): Swatch {
	const r = ((rgb >> 16) & 255) / 255
	const g = ((rgb >> 8) & 255) / 255
	const b = (rgb & 255) / 255
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const l = (max + min) / 2
	const d = max - min
	const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
	if (l < 0.16 || (sat < 0.15 && l < 0.45)) return 'black'
	if (l > 0.86 || (sat < 0.15 && l >= 0.45)) return 'white'
	let h = 0
	if (d) {
		if (max === r) h = ((g - b) / d) % 6
		else if (max === g) h = (b - r) / d + 2
		else h = (r - g) / d + 4
		h *= 60
		if (h < 0) h += 360
	}
	if (h < 15 || h >= 345) return 'red'
	if (h < 40) return l < 0.45 ? 'brown' : 'orange'
	if (h < 65) return l < 0.35 ? 'brown' : 'yellow'
	if (h < 165) return 'green'
	if (h < 255) return 'blue'
	if (h < 290) return 'purple'
	return 'pink'
}

function colorsOf(raw: any): number[] {
	const st = raw?.styles ?? {}
	const list = [...(st.background_colors ?? []), ...(st.button_colors ?? [])]
	if (typeof raw?.variant_value === 'string') {
		const n = parseInt(raw.variant_value.replace('#', ''), 16)
		if (Number.isFinite(n)) list.unshift(n)
	}
	return list.filter(
		(n: unknown): n is number => typeof n === 'number' && Number.isFinite(n),
	)
}

/** String lists under keys that look like tags or themes, on the item and its category. */
function tagsOf(...objs: any[]): string[] {
	const out = new Set<string>()
	for (const o of objs) {
		if (!o || typeof o !== 'object') continue
		for (const [k, v] of Object.entries(o)) {
			if (!/tag|theme|genre|vibe|style_?categor/i.test(k)) continue
			const items = Array.isArray(v) ? v : typeof v === 'string' ? [v] : []
			for (const t of items) {
				const text =
					typeof t === 'string' ? t : ((t as any)?.name ?? (t as any)?.label)
				if (typeof text === 'string' && text.trim() && text.length < 30)
					out.add(text.trim())
			}
		}
	}
	return [...out]
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
	return (
		e?.body?.message ??
		(e?.status ? `HTTP ${e.status}` : (e?.message ?? String(error)))
	)
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
	// Current collectibles (frames among them) have a static picture by SKU on Discord's CDN
	// (media/v1/collectibles-shop/{sku}/static): the product's own, else the item's.
	const sku = product?.sku_id ?? item?.sku_id
	if (sku && (item?.type === 3 || product?.type === 3))
		return `https://cdn.discordapp.com/media/v1/collectibles-shop/${sku}/static`
	// Anything else keeping its picture elsewhere: any image link in the item, still ones first.
	const found = deepImage(product)
	if (found) return found
	if (item?.sku_id && item?.layers)
		return `https://cdn.discordapp.com/media/v1/collectibles-shop/${item.sku_id}/static`
	return undefined
}

function deepImage(obj: unknown): string | undefined {
	const found: Array<[string, string]> = []
	const walk = (v: unknown, key: string, depth: number) => {
		if (depth > 6 || v == null) return
		if (typeof v === 'string') {
			if (
				/^https?:\/\/\S+\.(png|webp|jpe?g|gif|apng)(\?|$)/i.test(v) &&
				!/banner|logo|hero/i.test(key + v)
			)
				found.push([key, v])
			return
		}
		if (Array.isArray(v)) return v.forEach(x => walk(x, key, depth + 1))
		if (typeof v === 'object')
			for (const [k, x] of Object.entries(v as object)) walk(x, k, depth + 1)
	}
	walk(obj, '', 0)
	const score = ([k, u]: [string, string]) =>
		(/static/i.test(k + u) ? 2 : 0) + (/frame/i.test(k + u) ? 1 : 0)
	found.sort((a, b) => score(b) - score(a))
	return found[0]?.[1]
}

/** A popularity number Discord might send with an item (none is documented). */
function popularityOf(raw: any): number | undefined {
	for (const k of [
		'popularity',
		'popularity_score',
		'popular_rank',
		'rank',
		'purchase_count',
		'times_purchased',
		'trending_score',
		'score',
	])
		if (typeof raw?.[k] === 'number')
			return k.includes('rank') ? -raw[k] : raw[k]
	return undefined
}

function pricesOf(product: any, purchaseType: number): Price[] {
	const set =
		product?.prices?.[purchaseType] ?? product?.prices?.[String(purchaseType)]
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
		swatches: [...new Set(colorsOf(raw).map(swatchOf))],
		tags: tagsOf(raw, category),
		popularity: popularityOf(raw),
		raw,
		rawCategory: category,
	}
}

export interface Category {
	id: string
	name: string
	/** Detected as a brand collab (copyright notice or collab wording). */
	collab: boolean
}

export interface Shop {
	products: Product[]
	categories: Category[]
	owned: Set<string>
}

/**
 * Discord doesn't flag collabs, but licensed categories nearly always carry a copyright notice
 * (©, ™, ®) or collab wording in their descriptions. Users can correct any category by hand.
 */
const COLLAB =
	/[©®™Ⓒ]|\(c\)\s*\d{4}|\bcollab(oration)?\b|\blicensed\b|\bin partnership\b|\bofficially licensed\b/i

export function isCollabCategory(category: any): boolean {
	const texts = [
		category?.name,
		category?.summary,
		category?.mobile_summary,
		category?.featured_block_body,
		category?.wide_banner_body,
		...(category?.products ?? []).flatMap((p: any) => [
			p?.summary,
			...(p?.variants ?? []).map((v: any) => v?.summary),
		]),
	]
	return texts.some(t => typeof t === 'string' && COLLAB.test(t))
}

export async function loadShop(): Promise<Shop> {
	const { body } = await http().get({
		url: '/collectibles-categories/v2?include_bundles=true&variants_return_style=1',
	})
	const categories: any[] = Array.isArray(body)
		? body
		: (body?.categories ?? [])
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
		const res = await http().get({
			url: '/users/@me/collectibles-purchases?variants_return_style=1',
		})
		const list: any[] = Array.isArray(res.body) ? res.body : []
		owned = new Set(list.map(p => String(p?.sku_id)))
	} catch {}
	return {
		products,
		categories: categories
			.filter(c => c?.sku_id && (c.products?.length ?? 0) > 0)
			.map(c => ({
				id: String(c.sku_id),
				name: String(c.name ?? ''),
				collab: isCollabCategory(c),
			})),
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
	/** Item types ticked (none = all), like the desktop Shop's Item Type boxes. */
	types: number[]
	owned: 'all' | 'owned' | 'not-owned'
	pay: 'all' | 'orbs' | 'money'
	category: string
	collab: 'all' | 'non-collab' | 'collab'
	/** Colour families ticked (none = any). */
	swatches: Swatch[]
	/** Themes ticked (none = any). */
	tags: string[]
	sort: 'shop' | 'popular' | 'newest' | 'oldest' | 'cheap' | 'pricey' | 'name'
}

export const DEFAULT_FILTERS: Filters = {
	query: '',
	types: [],
	owned: 'all',
	pay: 'all',
	category: 'all',
	collab: 'all',
	swatches: [],
	tags: [],
	sort: 'newest',
}

/** Every theme/tag the shop's items carry, most used first. */
export function allTags(shop: Shop): string[] {
	const n = new Map<string, number>()
	for (const p of shop.products)
		for (const t of p.tags) n.set(t, (n.get(t) ?? 0) + 1)
	return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
}

/** How many filters differ from the defaults (for the Filters button). */
export function activeCount(f: Filters): number {
	return (
		f.types.length +
		f.swatches.length +
		f.tags.length +
		(f.owned !== 'all' ? 1 : 0) +
		(f.pay !== 'all' ? 1 : 0) +
		(f.category !== 'all' ? 1 : 0) +
		(f.collab !== 'all' ? 1 : 0)
	)
}

/** Money as a comparable number (Orbs-only items sort by Orbs after paid ones). */
const cost = (p: Product) =>
	p.money
		? p.money.amount / 10 ** p.money.exponent
		: p.orbs != null
			? 1e6 + p.orbs
			: Infinity

/** Category IDs counted as collabs: detected ones, plus user marks (true) minus user unmarks (false). */
export function collabIds(
	shop: Shop,
	marks: Record<string, boolean> = {},
): Set<string> {
	const ids = new Set<string>()
	for (const c of shop.categories) if (marks[c.id] ?? c.collab) ids.add(c.id)
	return ids
}

export function applyFilters(
	shop: Shop,
	f: Filters,
	marks: Record<string, boolean> = {},
): Product[] {
	const q = f.query.trim().toLowerCase()
	// Discord's own theme tags, if this shop's data has any.
	const tagged = shop.products.some(p => p.tags.length)
	const collabs = f.collab === 'all' ? undefined : collabIds(shop, marks)
	const list = shop.products.filter(p => {
		if (f.types.length && !f.types.includes(p.type)) return false
		if (f.swatches.length && !p.swatches.some(s => f.swatches.includes(s)))
			return false
		if (f.tags.length && !f.tags.some(t => inTheme(p, t, tagged))) return false
		if (f.owned === 'owned' && !shop.owned.has(p.sku)) return false
		if (f.owned === 'not-owned' && shop.owned.has(p.sku)) return false
		if (f.pay === 'orbs' && p.orbs == null) return false
		if (f.pay === 'money' && !p.money) return false
		if (f.category !== 'all' && p.categoryId !== f.category) return false
		if (collabs && collabs.has(p.categoryId) !== (f.collab === 'collab'))
			return false
		if (q && !`${p.name} ${p.category}`.toLowerCase().includes(q)) return false
		return true
	})
	const sorted = [...list]
	// Items with no price go last either way.
	const byCost = (dir: 1 | -1) => (a: Product, b: Product) => {
		const x = cost(a)
		const y = cost(b)
		if (x === Infinity || y === Infinity)
			return (x === Infinity ? 1 : 0) - (y === Infinity ? 1 : 0)
		return (x - y) * dir
	}
	if (f.sort === 'cheap') sorted.sort(byCost(1))
	else if (f.sort === 'pricey') sorted.sort(byCost(-1))
	else if (f.sort === 'name')
		sorted.sort((a, b) => a.name.localeCompare(b.name))
	// An item's ID is a snowflake: it says when the item was made.
	// Popular: Discord's popularity numbers when its data has them, else its own (featured) order.
	else if (f.sort === 'popular')
		sorted.sort(
			(a, b) =>
				(b.popularity ?? -Infinity) - (a.popularity ?? -Infinity) ||
				a.order - b.order,
		)
	else if (f.sort === 'newest')
		sorted.sort((a, b) => snowflakeCmp(b.sku, a.sku))
	else if (f.sort === 'oldest')
		sorted.sort((a, b) => snowflakeCmp(a.sku, b.sku))
	else sorted.sort((a, b) => a.order - b.order)
	return sorted
}

/** Compares two snowflake IDs (numbers too big for JavaScript numbers) by when they were made. */
export function snowflakeCmp(a: string, b: string): number {
	return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)
}

/** How an item is shown: nameplates as long bars, effects and frames tall, the rest in the grid. */
export const shapeOf = (p: Product): 'wide' | 'tall' | 'grid' =>
	p.type === 2 ? 'wide' : p.type === 1 || p.type === 3 ? 'tall' : 'grid'

export interface Row {
	key: string
	shape: 'wide' | 'tall' | 'grid'
	items: Product[]
}

/** Rows for the list, keeping the order: a nameplate per row, two effects/frames, [cols] of the rest. */
export function toRows(items: Product[], cols: number): Row[] {
	const rows: Row[] = []
	let cur: Row | undefined
	for (const p of items) {
		const shape = shapeOf(p)
		const per = shape === 'wide' ? 1 : shape === 'tall' ? 2 : cols
		if (!cur || cur.shape !== shape || cur.items.length >= per) {
			cur = { key: p.sku, shape, items: [] }
			rows.push(cur)
		}
		cur.items.push(p)
	}
	return rows
}

/**
 * The desktop Shop's themes. When Discord's data tags items with them, those tags are used;
 * otherwise an item matches by words in its name, description and collection (a best guess).
 */
export const THEMES: Array<[name: string, icon: string, words: RegExp]> = [
	[
		'Anime',
		'✲',
		/anime|manga|zenless|jujutsu|naruto|one piece|kawaii|chibi|honkai|genshin|hoshimi|ellen joe/i,
	],
	[
		'Gaming',
		'🎮',
		/gam(e|ing)|controller|arcade|pixel|palworld|borderlands|valorant|fortnite|dead by daylight|zenless|league of|minecraft|tron/i,
	],
	[
		'Cute & Cosy',
		'☕',
		/cute|cos[yi]|cozy|kawaii|plush|sleepover|smol|hello kitty|cottage|snug|daydream/i,
	],
	[
		'Sci-Fi',
		'🪐',
		/sci-?fi|space|cyber|robot|tron|neon|cosmos|galax|alien|futur|mecha|star wars|mandalorian/i,
	],
	[
		'Food & Drinks',
		'🍔',
		/food|drink|snack|fruit|boba|coffee|\btea\b|cake|candy|sweet|pizza|sushi|ramen|bak(e|ery)/i,
	],
	[
		'Fantasy',
		'🔮',
		/fantas|magic|dragon|fair(y|ies)|wizard|enchant|myth|folklore|mermaid|starlight|tarot|zodiac|witch/i,
	],
	[
		'Animals & Pets',
		'🐾',
		/\bcats?\b|kitt(y|en)|\bdogs?\b|pupp|\bpets?\b|animal|bunn|bear|\bfox|bird|ears|critter|\bbugs?\b|woodland|paw|frog|fish/i,
	],
	[
		'Nature',
		'🍃',
		/nature|flower|floral|leaf|leaves|plant|forest|garden|bloom|forag|sunkiss|ocean|seas\b|autumn|\bfall\b|spring|blossom|solar/i,
	],
	[
		'Films & TV',
		'🎬',
		/film|movie|\btv\b|marvel|disney|star wars|mandalorian|spider-?man|venom|deadpool|wolverine|avatar|mickey|nightmare before christmas|showtime/i,
	],
	[
		'Dark & Moody',
		'🥀',
		/\bdark|goth|night|horror|spooky|skull|creep|underworld|shadow|terror|moody|halloween|calavera|vampire|muertos/i,
	],
]

/** Whether [p] belongs to theme [name]. */
export function inTheme(p: Product, name: string, tagged: boolean): boolean {
	if (tagged) return p.tags.some(t => t.toLowerCase() === name.toLowerCase())
	const words = THEMES.find(([n]) => n === name)?.[2]
	return !!words && words.test(`${p.name} ${p.summary} ${p.category}`)
}

/** Whether the shop's data carries popularity numbers (for the Popular sort's note). */
export const hasPopularity = (shop: Shop) =>
	shop.products.some(p => p.popularity != null)
