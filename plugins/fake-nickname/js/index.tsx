/*
 * Fake Nickname+ — a fork of "Fake Nickname" by coder.gg
 * (https://github.com/il1ll/ValencedPlugins, plugins/fakenickname, commit 9f11232),
 * licensed under the GNU General Public License v3.0. This fork is also GPL-3.0.
 *
 * Changes in this fork (ketsuyumi):
 * - Saved nicknames are turned into a Map once when they change; the name hooks do a single
 *   lookup instead of reading storage and trimming on every call.
 * - The hooks are plain functions created once (no closure per call), and getMember only
 *   copies a member when that user actually has a fake nickname.
 * - The name hooks are only installed while at least one fake nickname is saved.
 * - Fast mode (direct.ts, on by default): GuildMemberStore.getMember is no longer hooked;
 *   nicknames are written into the member records of the server being viewed instead.
 */
import { patchMenu } from './menu'
import { patchNames } from './names'
import { SettingsPage } from './settings'
import { bindStorage, defaults, refreshNames, syncLookup } from './state'
import type { FakeNicknameSettings } from './state'

export default plugin<{ jsonStorage: FakeNicknameSettings }>({
	jsonStorage: {
		load: true,
		default: defaults,
	},
	async start(api) {
		const { cleanup, jsonStorage } = api
		await jsonStorage.get()
		bindStorage(jsonStorage)
		cleanup(jsonStorage.subscribe(syncLookup))
		patchNames(cleanup)
		patchMenu(cleanup)
		refreshNames()
		cleanup(() => {
			bindStorage(undefined)
			refreshNames()
		})
	},
	SettingsComponent: SettingsPage,
})
