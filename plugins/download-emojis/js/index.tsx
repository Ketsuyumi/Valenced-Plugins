import {
	AlertActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { instead } from '@valenced/patcher'
import { TurboModuleRegistry } from 'react-native'
import {
	type Asset,
	emojiAssets,
	guildEmojis,
	guildStickers,
	stickerAssets,
} from './assets'
import { findModule } from './find'

/**
 * Download Emojis / Download Stickers in a server's long-press menu. Each one is saved with
 * Discord's own native downloader (the one behind Save image in the media viewer), so they land
 * where Discord saves pictures, with no extra permissions. Lottie stickers (Discord's own
 * animated stickers) are animation data, not pictures, so they're skipped.
 */

const CONTEXT_MENU =
	'design/components/ContextMenu/native/ContextMenuState.native.tsx'

const S = () => Stores as any
const toast = (text: string) =>
	(ToastActionCreators as any).open('download-emojis', { text })

function downloader():
	| ((url: string, type: number) => Promise<unknown>)
	| undefined {
	try {
		const m: any = (TurboModuleRegistry as any).get('NativeMediaManagerModule')
		if (typeof m?.downloadMediaAsset === 'function')
			return (url, type) => m.downloadMediaAsset(url, type)
	} catch {}
	return undefined
}

let running = false

async function saveAll(what: string, assets: Asset[], skipped: number) {
	const save = downloader()
	if (!save) return toast("Couldn't find Discord's downloader")
	running = true
	let done = 0
	let failed = 0
	toast(`Saving ${assets.length} ${what}…`)
	for (const a of assets) {
		if (!running) break
		try {
			await save(a.url, a.type)
			done++
		} catch {
			failed++
		}
		if ((done + failed) % 20 === 0 && done + failed < assets.length)
			toast(`Saved ${done} of ${assets.length} ${what}…`)
	}
	running = false
	const extra = [
		failed ? `${failed} failed` : '',
		skipped
			? `${skipped} Lottie sticker${skipped === 1 ? '' : 's'} skipped`
			: '',
	]
		.filter(Boolean)
		.join(', ')
	toast(`Saved ${done} ${what}${extra ? ` (${extra})` : ''}`)
}

function ask(guildId: string, kind: 'emojis' | 'stickers') {
	if (running) return toast('Still saving the last batch')
	const guild = S().GuildStore?.getGuild?.(guildId)
	const name = guild?.name ?? 'this server'
	const { assets, skipped } =
		kind === 'emojis'
			? {
					assets: emojiAssets(guildEmojis(S().EmojiStore, guildId)),
					skipped: 0,
				}
			: stickerAssets(guildStickers(S().StickersStore, guildId))
	if (!assets.length)
		return toast(
			skipped
				? `${name} only has Lottie stickers, which aren't pictures`
				: `${name} has no ${kind}`,
		)
	const { AlertModal, AlertActionButton } = Design as any
	;(AlertActionCreators as any).openAlert(
		'download-emojis',
		<AlertModal
			title={`Download ${kind}`}
			content={`Save ${assets.length} ${kind} from ${name} to your phone? They go where Discord saves pictures.`}
			actions={
				<>
					<AlertActionButton
						text={`Save ${assets.length}`}
						variant="primary"
						onPress={() => void saveAll(kind, assets, skipped)}
					/>
					<AlertActionButton text="Cancel" variant="secondary" />
				</>
			}
		/>,
	)
}

const isGuild = (id: string) => !!S().GuildStore?.getGuild?.(id)

export default plugin({
	start({ cleanup }) {
		cleanup(
			findModule(CONTEXT_MENU, ['showContextMenu'], (mod: any) => {
				if (typeof mod?.showContextMenu !== 'function') return
				cleanup(
					instead(
						mod,
						'showContextMenu',
						function (this: unknown, args: any[], orig: (...a: any[]) => any) {
							try {
								const menu = args[0]
								const id = menu?.key
								if (
									Array.isArray(menu?.items) &&
									typeof id === 'string' &&
									/^\d{5,}$/.test(id) &&
									isGuild(id) &&
									!menu.items.some((i: any) => i?.downloadEmojis)
								) {
									const icon = lookupGeneratedIconComponent(
										'DownloadIcon' as any,
									)
									const rows = [
										{
											downloadEmojis: true,
											IconComponent: icon,
											label: 'Download Emojis',
											action: () => setTimeout(() => ask(id, 'emojis'), 300),
										},
										{
											downloadEmojis: true,
											IconComponent: icon,
											label: 'Download Stickers',
											action: () => setTimeout(() => ask(id, 'stickers'), 300),
										},
									]
									// Right after Edit Per-server Profile / Privacy Settings when there, else at the end.
									const at = menu.items.findIndex((i: any) =>
										/per-server profile|server profile|privacy/i.test(
											String(i?.label ?? ''),
										),
									)
									if (at >= 0) menu.items.splice(at + 1, 0, ...rows)
									else menu.items.push(...rows)
								}
							} catch {}
							return orig.apply(this, args)
						},
					),
				)
			}),
			() => {
				running = false
			},
		)
	},
})
