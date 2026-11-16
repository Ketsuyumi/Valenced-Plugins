/*
 * Staff Tags+ — a fork of "Staff Tags" by bleelblep (with Fiery and シグマ siguma)
 * (https://github.com/bleelblep/bleel-bazinga-repo, plugins/staff-tags, commit 8d67427),
 * licensed under the GNU General Public License v3.0. This fork is also GPL-3.0.
 * The helpers in ./shared are copied from the same repository's shared/ folder.
 *
 * Changes in this fork (ketsuyumi):
 * - Resolved tags are cached per server, channel and person, so chat no longer recomputes a
 *   member's permissions for every message row. The cache clears when members, roles, channels,
 *   permissions or settings change.
 * - Settings are merged once per change instead of on every lookup; row colours are converted
 *   once per tag; Discord's own tags skip the painter; member and profile rows check the cached
 *   tag before walking the rendered tree.
 * - New: compact mode, per-server switches, where-to-show switches, and your own tags by user ID.
 * - The original's changelog popup is left out (its notes describe the original's versions).
 */
import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { clearDiscordModules, setTagModule } from './lib/discord'
import { clearTagCache } from './lib/getTag'
import { watchPermissionHelper } from './lib/permissions'
import {
	DEFAULTS,
	onSettingsChange,
	setStorage,
	watchStorage,
} from './lib/state'
import patchChat from './patches/chat'
import patchDetails from './patches/details'
import patchName from './patches/name'
import patchTag from './patches/tag'
import { reportError, setReporter } from './shared/report'
import Settings from './ui/pages/Settings'
import { registerPages } from './ui/routes'
import type { TagModule } from './lib/discord'
import type { StaffTagsStorage } from './types'

export { DEFAULTS }
export type { StaffTagsStorage }

/** Stores whose changes can change someone's tag: roles, members, owners, channel overwrites. */
const WATCHED_STORES = [
	'GuildMemberStore',
	'GuildStore',
	'GuildRoleStore',
	'ChannelStore',
	'PermissionStore',
]

interface ChangeEmitter {
	addChangeListener?(listener: () => void): void
	removeChangeListener?(listener: () => void): void
}

export default plugin<{ jsonStorage: StaffTagsStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(plugin)
		setStorage(jsonStorage)
		cleanup(() => {
			setReporter(undefined)
			setStorage(undefined)
			clearDiscordModules()
			clearTagCache()
		})

		cleanup(watchStorage(), onSettingsChange(clearTagCache), registerPages())

		for (const name of WATCHED_STORES) {
			const store = (Stores as Record<string, ChangeEmitter | undefined>)[name]
			try {
				if (typeof store?.addChangeListener !== 'function') continue
				store.addChangeListener(clearTagCache)
				cleanup(() => store.removeChangeListener?.(clearTagCache))
			} catch {}
		}

		// Every lookup below also waits for its module, so this works the same at boot and when the
		// plugin is switched on later, and a module that loads after the first chat render still
		// arrives. The callbacks run as bare engine jobs for an already-loaded module, so each is
		// guarded.
		cleanup(
			// Discord's tag component and `getBotLabel`: one lookup shared by every surface.
			getModules(withProps<TagModule>('getBotLabel'), module => {
				try {
					if (typeof module?.default !== 'function') return
					setTagModule(module)
					cleanup(patchTag(module))
				} catch (error) {
					reportError('[StaffTags] could not patch the tag component:', error)
				}
			}),
		)
		watchPermissionHelper(cleanup)

		patchChat(cleanup)
		patchName(cleanup)
		patchDetails(cleanup)
	},
	// Unpatching cannot put back everything a hook changed once Discord has rendered with it.
	stop({ plugin }) {
		plugin.requireReload()
	},
	SettingsComponent: Settings,
})
