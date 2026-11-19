import { getModules, lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

/**
 * Muting goes through Discord's own UserGuildSettingsActionCreators, so the change shows at once
 * and syncs like muting from the channel's menu. "Forever" is Discord's own shape for it:
 * `mute_config: { selected_time_window: -1, end_time: null }`.
 *
 * Order of preference: the bulk action (one request for every channel), the single-channel
 * action (one per channel, spaced out), then the REST endpoint the app itself uses,
 * PATCH /users/@me/guilds/{guild}/settings with channel_overrides (one request).
 */

let creators: any
export function watchCreators(): () => void {
	return getModules(
		(withProps as any)('updateChannelOverrideSettings'),
		(mod: any) => {
			creators = mod?.default ?? mod
		},
	) as any
}
export const muteMethod = () =>
	typeof creators?.updateChannelOverrideSettingsBulk === 'function'
		? "Discord's bulk mute"
		: typeof creators?.updateChannelOverrideSettings === 'function'
			? "Discord's channel mute"
			: 'Direct request'

const FOREVER = {
	muted: true,
	mute_config: { selected_time_window: -1, end_time: null },
}
const UNMUTE = { muted: false, mute_config: null }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function http(): any {
	const [module] = lookupModule(
		(withProps as any)('getAPIBaseURL', 'get', 'patch'),
	) as any
	if (!module) throw new Error("Couldn't find Discord's HTTP module")
	return module
}

export async function setMuted(guildId: string, ids: string[], mute: boolean) {
	const value = mute ? FOREVER : UNMUTE
	const overrides: Record<string, any> = {}
	for (const id of ids) overrides[id] = value
	if (typeof creators?.updateChannelOverrideSettingsBulk === 'function') {
		await creators.updateChannelOverrideSettingsBulk(guildId, overrides)
		return
	}
	if (typeof creators?.updateChannelOverrideSettings === 'function') {
		for (const [i, id] of ids.entries()) {
			if (i) await sleep(350)
			await creators.updateChannelOverrideSettings(guildId, id, value)
		}
		return
	}
	await http().patch({
		url: `/users/@me/guilds/${guildId}/settings`,
		body: { channel_overrides: overrides },
	})
}
