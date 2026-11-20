import {
	ActionSheetActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Stores } from '@valenced/discord/flux'
import { RootNavigationRef } from '@valenced/discord/modules/main_tabs_v2'
import * as discordFinders from '@valenced/discord/utils/modules/finders'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'

/**
 * Opening Discord's own item sheet (your profile with the item, Redeem / Buy) for an item picked
 * in the browser. How Discord opens it isn't known ahead of time, so it's learned: when you tap an
 * item in Discord's own Shop, the way Discord opens its sheet is noted (a bottom sheet with its
 * component and props, or a screen with its name and params), and Preview & Buy does the same
 * with the item swapped in. A screen's name and params are saved, so that one survives restarts;
 * a bottom sheet is learned again each time Discord starts (one tap).
 * Buying always happens in Discord's sheet; this never spends Orbs or money itself.
 */

const WANTED = /collectible|shop|product|sku/i

interface Learned {
	sheet?: { importer: unknown; key: string; props: any }
	route?: { name: string; params: any }
}
const learned: Learned = {}
export const previewStatus = {
	last: 'Not tried yet',
	learned: 'Nothing yet: tap any item in the Shop’s Featured page once',
}

let saveRoute: ((route: Learned['route']) => void) | undefined
/** The Shop screen's own route name (navigating to it isn't opening an item). */
let shopRoute: () => string = () => ''
export function setShopRoute(get: () => string) {
	shopRoute = get
}
const currentRoute = (): string => {
	try {
		return String(
			(RootNavigationRef.getRootNavigationRef() as any)?.getCurrentRoute?.()
				?.name ?? '',
		)
	} catch {
		return ''
	}
}
function forget(why: string) {
	learned.route = undefined
	learned.sheet = undefined
	saveRoute?.(undefined)
	previewStatus.learned = `Nothing yet (${why})`
}
export function setRouteStore(
	read: () => Learned['route'] | undefined,
	write: (route: Learned['route']) => void,
) {
	saveRoute = write
	const r = read()
	if (r?.name) {
		learned.route = r
		previewStatus.learned = `Screen “${r.name}” (saved)`
	}
}

/** Does [props] look like they're about a shop item? */
const aboutItem = (props: any): boolean => {
	try {
		const text =
			JSON.stringify(props, (_k, v) =>
				typeof v === 'function' ? undefined : v,
			)?.slice(0, 4000) ?? ''
		return /sku_?id|skuId|"product"|collectible/i.test(text)
	} catch {
		return false
	}
}

/** [template] with every sign of the learned item replaced by [p]. */
function swap(
	template: any,
	p: { sku: string; raw?: any; rawCategory?: any },
	depth = 0,
): any {
	if (depth > 5 || template == null) return template
	if (Array.isArray(template)) return template.map(x => swap(x, p, depth + 1))
	if (typeof template !== 'object') return template
	if (
		typeof template.sku_id === 'string' &&
		(template.items || template.prices || template.type != null)
	)
		return p.raw ?? template
	const out: any = {}
	for (const [k, v] of Object.entries(template)) {
		if (/^product$/i.test(k) && p.raw) out[k] = p.raw
		else if (/^category$/i.test(k) && p.rawCategory) out[k] = p.rawCategory
		else if (/sku_?id$/i.test(k) && typeof v === 'string') out[k] = p.sku
		else if (
			/^(product_?id|item_?id|itemSkuId)$/i.test(k) &&
			typeof v === 'string'
		)
			out[k] = p.sku
		else out[k] = typeof v === 'function' ? v : swap(v, p, depth + 1)
	}
	return out
}

export function installLearning(): () => void {
	const undo: Array<() => void> = []
	try {
		undo.push(
			instead(
				ActionSheetActionCreators as any,
				'openLazy',
				function (this: unknown, args: any[], orig: (...a: any[]) => any) {
					try {
						const [importer, key, props] = args
						if (
							typeof key === 'string' &&
							WANTED.test(key) &&
							aboutItem(props) &&
							!(props as any)?.__shopBrowser
						) {
							learned.sheet = { importer, key, props }
							previewStatus.learned = `Bottom sheet “${key}”`
						}
					} catch {}
					return orig.apply(this, args)
				},
			),
		)
	} catch {}
	// Screens: wrap the navigation's navigate once it exists.
	let wrapped: any
	const wrapNav = () => {
		try {
			const nav: any = RootNavigationRef.getRootNavigationRef()
			if (!nav || nav === wrapped || typeof nav.navigate !== 'function') return
			wrapped = nav
			undo.push(
				instead(
					nav,
					'navigate',
					function (this: unknown, args: any[], orig: (...a: any[]) => any) {
						try {
							const [name, params] = args
							const flat = typeof name === 'object' ? name : { name, params }
							if (
								typeof flat?.name === 'string' &&
								WANTED.test(flat.name) &&
								aboutItem(flat.params) &&
								!flat.params?.__shopBrowser &&
								// Opening the Shop itself (from a link or the menu) isn't opening an item.
								flat.name !== shopRoute() &&
								flat.name !== currentRoute()
							) {
								learned.route = {
									name: flat.name,
									params: JSON.parse(JSON.stringify(flat.params ?? {})),
								}
								previewStatus.learned = `Screen “${flat.name}”`
								saveRoute?.(learned.route)
							}
						} catch {}
						return orig.apply(this, args)
					},
				),
			)
		} catch {}
	}
	wrapNav()
	const t = setInterval(wrapNav, 3000)
	undo.push(() => clearInterval(t))
	return () => {
		for (const u of undo.splice(0))
			try {
				u()
			} catch {}
	}
}

function toast(text: string) {
	try {
		ToastActionCreators.open('shop-browser-preview', { text } as never)
	} catch {}
}

/**
 * Discord's own way (from its mobile code): `openProductDetailsActionSheet({ product,
 * initialVariantIndex, analyticsLocations })` in modules/collectibles/native/
 * openProductDetailsActionSheet.tsx, with `product` from CollectiblesCategoryStore.getProduct(sku)
 * (fetched with CollectiblesActionCreators.fetchCollectiblesProduct when not loaded yet). This is
 * what Discord's own shop cards call.
 */
function sheetOpener(): ((args: any, stack?: string) => unknown) | undefined {
	try {
		const found = (discordFinders as any).lookupModuleWithImportedPath?.(
			'modules/collectibles/native/openProductDetailsActionSheet.tsx',
		)
		const mod = Array.isArray(found) ? found[0] : found
		if (typeof mod?.openProductDetailsActionSheet === 'function')
			return mod.openProductDetailsActionSheet
	} catch {}
	try {
		const [mod] = lookupModule(
			(withProps as any)('openProductDetailsActionSheet'),
		) as any
		if (typeof mod?.openProductDetailsActionSheet === 'function')
			return mod.openProductDetailsActionSheet
	} catch {}
	return undefined
}

async function productRecord(sku: string): Promise<any> {
	const store = (Stores as any).CollectiblesCategoryStore
	let product = store?.getProduct?.(sku)
	if (product) return product
	try {
		const [actions] = lookupModule(
			(withProps as any)('fetchCollectiblesProduct'),
		) as any
		await actions?.fetchCollectiblesProduct?.(sku)
	} catch {}
	product = store?.getProduct?.(sku)
	return product
}

export async function openDiscordSheet(p: {
	sku: string
	groupSku?: string
	variantIndex?: number
}): Promise<boolean> {
	const open = sheetOpener()
	if (!open) return false
	const product =
		(p.groupSku && (await productRecord(p.groupSku))) ||
		(await productRecord(p.sku))
	if (!product) return false
	const fromGroup = !!p.groupSku && product?.skuId === p.groupSku
	try {
		open({
			product,
			initialVariantIndex: fromGroup ? (p.variantIndex ?? 0) : 0,
			analyticsLocations: [],
			shopAnalyticsContext: undefined,
		})
		previewStatus.last = "Discord's openProductDetailsActionSheet"
		return true
	} catch (e: any) {
		previewStatus.last = `openProductDetailsActionSheet failed: ${e?.message ?? e}`
		return false
	}
}

export function openItemSheet(p: {
	sku: string
	raw?: any
	rawCategory?: any
}): boolean {
	if (learned.sheet)
		try {
			;(ActionSheetActionCreators as any).openLazy(
				learned.sheet.importer,
				learned.sheet.key,
				{ ...swap(learned.sheet.props, p), __shopBrowser: true },
			)
			previewStatus.last = `Bottom sheet “${learned.sheet.key}”`
			return true
		} catch {}
	if (learned.route)
		try {
			const nav: any = RootNavigationRef.getRootNavigationRef()
			const before = currentRoute()
			nav.navigate(learned.route.name, {
				...swap(learned.route.params, p),
				__shopBrowser: true,
			})
			previewStatus.last = `Screen “${learned.route.name}”`
			// Landed on the Shop's front page (or nowhere new): what was learned is wrong.
			setTimeout(() => {
				const now = currentRoute()
				if (now === before || (shopRoute() && now === shopRoute())) {
					forget('the screen learned before only reopened the Shop')
					toast(
						'That reopened the Shop instead of the item. Tap any item in Featured once, then try again.',
					)
				}
			}, 900)
			return true
		} catch {}
	previewStatus.last = 'Not learned yet'
	toast(
		'Tap any item in the Shop’s Featured page once, then Preview & Buy works for every item.',
	)
	return false
}

/** Whether Discord's own item sheet (for buying) has been learned yet. */
export const canOpenSheet = () =>
	!!(sheetOpener() || learned.sheet || learned.route)
