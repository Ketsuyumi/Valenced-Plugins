/**
 * The list of places (servers, channels, DMs) and what it means, kept free of Discord so it can
 * be tested on its own.
 */

export type PlaceKind = 'server' | 'channel'

export interface Place {
	id: string
	kind: PlaceKind
	/** The name it had when it was added. */
	label: string
}

/** 'exclude': don't shrink in listed places. 'only': shrink nowhere else. */
export type ListMode = 'exclude' | 'only'

/** Whether media in this channel / server should be shrunk. */
export function shouldShrink(
	ids: Set<string>,
	mode: ListMode,
	channelId: unknown,
	guildId: unknown,
): boolean {
	// An empty list changes nothing: with "only" and no places yet, it would otherwise switch
	// the whole plugin off the moment the mode is picked.
	if (ids.size === 0) return true
	const listed =
		(typeof channelId === 'string' && ids.has(channelId)) ||
		(typeof guildId === 'string' && ids.has(guildId))
	return mode === 'only' ? listed : !listed
}

export const placeIds = (places: Place[] | undefined): Set<string> =>
	new Set((places ?? []).map(place => place.id))
