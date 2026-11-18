/*
 * Pronouns+ -- a private fork of "Pronouns" by bleelblep
 * (https://github.com/bleelblep/bleel-bazinga-repo, plugins/pronouns, 1.0.9, commit cda7cb2),
 * licensed under the GNU General Public License v3.0. This fork is also GPL-3.0. The helpers in
 * ./shared are copied from the same repository's shared/ folder.
 *
 * Changes in this fork (Satou):
 * - lib/resolve.ts: answers are kept per person and server with the raw values they came from,
 *   and reused while those are unchanged; the "extra pronouns" setting is parsed once per change.
 * - patches/chat.ts: one lookup and one colour per chat row (the original did each twice).
 * - lib/color.ts: colours parsed once per input, tag colour fields built once per colour.
 * - New id, so storage and settings pages are separate; the changelog popup is left out.
 */

import { watchDiscord } from './lib/discord'
import { stop as stopPronounDB } from './lib/pronounDB'
import { watchChannelMessages } from './lib/redraw'
import { watchResolve } from './lib/resolve'
import { DEFAULTS, setStorage } from './lib/state'
import patchCalls from './patches/calls'
import patchChat from './patches/chat'
import patchMessageSheet from './patches/messageSheet'
import { setReporter } from './shared/report'
import Settings from './ui/pages/Settings'
import { registerPages } from './ui/routes'
import type { PronounsStorage } from './lib/state'

export default plugin<{ jsonStorage: PronounsStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	start(api) {
		const { cleanup, jsonStorage } = api

		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(api.plugin)
		cleanup(() => setReporter(undefined))

		setStorage(jsonStorage)
		cleanup(() => setStorage(undefined))

		// A late start (switched on from the plugin list) needs nothing special: every lookup
		// below answers at once for a module that is already loaded and waits otherwise.
		cleanup(
			registerPages(),
			watchResolve(),
			watchDiscord(),
			watchChannelMessages(),
		)
		patchChat(cleanup)
		patchCalls(cleanup)
		patchMessageSheet(cleanup)
	},

	// Rows already drawn keep their badge; unpatching can't redraw them.
	stop(api) {
		stopPronounDB()
		api.plugin.requireReload()
	},

	SettingsComponent: Settings,
})
