import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { ScrollView } from 'react-native'
import { AD_SCRIPT } from './script'

/**
 * Discord draws activities (Watch Together among them) in its own react-native-webview, the module
 * that also exports getWebViewProxy. Its WebView passes extra props on to Android, so activity web
 * views (the ones with a webViewKey and keyed messaging, as BaseEmbeddedAppWebView makes them) get
 * AD_SCRIPT as a document-start script for every frame, which reaches YouTube's player frame.
 */

const status = { webView: false }
const seen = new Set<string>()

function patchWebView(mod: any): (() => void) | undefined {
	const target = mod?.WebView ?? mod?.default
	if (!target || typeof target.render !== 'function') return undefined
	status.webView = true
	return instead(
		target,
		'render',
		function (this: unknown, args: any[], orig: (...a: any[]) => any) {
			try {
				const p = args[0]
				if (p?.webViewKey && p.messagingWithWebViewKeyEnabled) {
					seen.add(String(p.webViewKey))
					args[0] = {
						...p,
						injectedJavaScriptBeforeContentLoaded: `${AD_SCRIPT}\n${p.injectedJavaScriptBeforeContentLoaded ?? ''}`,
						injectedJavaScriptBeforeContentLoadedForMainFrameOnly: false,
					}
				}
			} catch {}
			return orig.apply(this, args)
		},
	)
}

export default plugin({
	start({ cleanup }) {
		let undo: (() => void) | undefined
		cleanup(
			getModules((withProps as any)('getWebViewProxy'), (mod: any) => {
				if (!undo)
					undo = patchWebView(mod?.default?.getWebViewProxy ? mod.default : mod)
			}) as any,
			() => undo?.(),
		)
	},
	SettingsComponent: () => {
		const { TableRowGroup, TableRow } = Design as any
		return (
			<ScrollView contentContainerStyle={{ padding: 16 }}>
				<TableRowGroup title="Status">
					<TableRow
						label="Discord's activity web view"
						subLabel={
							status.webView
								? 'Hooked'
								: 'Not loaded yet (it loads when you open an activity)'
						}
					/>
					<TableRow
						label="Activities with ad blocking"
						subLabel={`${seen.size} opened since Discord started`}
					/>
				</TableRowGroup>
			</ScrollView>
		)
	},
})
