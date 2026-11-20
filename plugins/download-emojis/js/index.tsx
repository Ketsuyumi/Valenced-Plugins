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
import { base64, zip } from './zip'

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

const native = (name: string): any => {
	try {
		return (TurboModuleRegistry as any).get(name)
	} catch {
		return undefined
	}
}

/** The bytes at [url] (XMLHttpRequest, which React Native hands back as an ArrayBuffer). */
function bytes(url: string): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const x = new XMLHttpRequest()
		x.open('GET', url)
		x.responseType = 'arraybuffer'
		x.onload = () =>
			x.status === 200 && x.response
				? resolve(new Uint8Array(x.response))
				: reject(new Error(`HTTP ${x.status}`))
		x.onerror = () => reject(new Error('network'))
		x.send()
	})
}

const safe = (s: string) =>
	s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'file'

let running = false
export const lastResult = { text: 'Nothing saved yet' }

/**
 * Hands the finished zip (in Discord's cache) to you: Android's Save as screen, or Discord's
 * downloader (Save image's) if that screen isn't there.
 */
async function deliver(path: string, name: string): Promise<string> {
	const uri = `file://${encodeURI(path.replace(/^file:\/*/, '/'))}`
	// Android's "Save as" screen, as Discord's own file exports use (saveDocuments): you pick the
	// folder, and the zip is copied there.
	const picker = native('RNDocumentPicker')
	if (typeof picker?.saveDocument === 'function') {
		let picked: any
		try {
			picked = await picker.saveDocument({
				sourceUris: [uri],
				fileName: name,
				mimeType: 'application/zip',
				copy: true,
			})
		} catch (e: any) {
			if (/cancel/i.test(String(e?.code ?? e?.message ?? e)))
				throw new Error('cancelled')
			picked = undefined
		}
		if (picked) {
			const written = await picker.writeDocuments?.(picked)
			const list: any[] = Array.isArray(written) ? written : []
			const err = list.find(r => r?.error)?.error
			if (err) throw new Error(String(err))
			if (!list.length && Array.isArray(picked) && !picked.length)
				throw new Error('cancelled')
			return `Saved ${name}`
		}
	}
	const media = native('NativeMediaManagerModule')
	try {
		if (typeof media?.downloadMediaAssetWithContentType === 'function') {
			await media.downloadMediaAssetWithContentType(uri, 0, 'application/zip')
			return `Saved ${name} to your phone`
		}
	} catch {}
	throw new Error(`the zip is ready but couldn't be handed over (${path})`)
}

async function saveZip(
	guildName: string,
	what: string,
	assets: Asset[],
	skipped: number,
) {
	const files = native('NativeFileModule')
	if (typeof files?.writeFile !== 'function')
		return toast("Couldn't find Discord's file writer")
	running = true
	const got: { name: string; data: Uint8Array }[] = []
	const used = new Set<string>()
	let failed = 0
	toast(`Getting ${assets.length} ${what}…`)
	let next = 0
	const worker = async () => {
		while (running && next < assets.length) {
			const a = assets[next++]!
			try {
				const data = await bytes(a.url)
				let name = `${safe(a.name)}.${a.ext}`
				for (let i = 2; used.has(name.toLowerCase()); i++)
					name = `${safe(a.name)}_${i}.${a.ext}`
				used.add(name.toLowerCase())
				got.push({ name, data })
				if (got.length % 25 === 0)
					toast(`Got ${got.length} of ${assets.length} ${what}…`)
			} catch {
				failed++
			}
		}
	}
	try {
		await Promise.all(Array.from({ length: 6 }, worker))
		if (!running) return
		if (!got.length) throw new Error(`none of the ${what} could be downloaded`)
		const zipName = `${safe(guildName)}-${what}.zip`
		const path: string = await files.writeFile(
			'cache',
			zipName,
			base64(zip(got)),
			'base64',
		)
		const said = await deliver(String(path), zipName)
		const extra = [
			failed ? `${failed} failed` : '',
			skipped ? `${skipped} Lottie skipped` : '',
		]
			.filter(Boolean)
			.join(', ')
		lastResult.text = `${said}: ${got.length} ${what}${extra ? ` (${extra})` : ''}`
		toast(lastResult.text)
	} catch (e: any) {
		lastResult.text =
			e?.message === 'cancelled' ? 'Cancelled' : `Failed: ${e?.message ?? e}`
		toast(lastResult.text)
	} finally {
		running = false
	}
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
			content={`Save ${assets.length} ${kind} from ${name} as one zip file?`}
			actions={
				<>
					<AlertActionButton
						text="Save zip"
						variant="primary"
						onPress={() => void saveZip(name, kind, assets, skipped)}
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
									const labelAt = (re: RegExp) =>
										menu.items.findIndex((i: any) =>
											re.test(String(i?.label ?? '')),
										)
									let at = labelAt(/per-server profile|server profile/i)
									if (at < 0) at = labelAt(/privacy/i)
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
	SettingsComponent: () => {
		const { Text } = Design as any
		return (
			<Text variant="text-md/normal" style={{ padding: 16 }}>
				Long-press a server, then Download Emojis or Download Stickers.
				{'\n\n'}Last time: {lastResult.text}
			</Text>
		)
	},
})
