import { reportError } from '../shared/report'
import { isDarkColor } from './color'
import { getPermissionHelper, getTagModule, stores } from './discord'
import { iconById } from './icons'
import {
	isGuildHidden,
	overrideFor,
	settings,
	USER_TAG_COLOR,
	userTagFor,
} from './state'
import type {
	Channel,
	Guild,
	PermissionHelper,
	TagProps,
	User,
} from './discord'

/**
 * Ask Discord whether a tag type maps to a built-in label (BOT, SYSTEM, ...), instead of comparing
 * against a localised name list. Until the tag module has loaded, nothing counts as built in, and
 * no tag is drawn either, because the tag component comes from the same module.
 */
export function isBuiltInTag(type: unknown): boolean {
	if (typeof type !== 'number') return false
	try {
		const label = getTagModule()?.getBotLabel?.(type)
		return typeof label === 'string' && label.length > 0
	} catch {
		return false
	}
}

/**
 * Discord permission bits, hardcoded.
 *
 * `Constants.Permissions` does not exist on the external API (confirmed on device; coding rule 4).
 * These values are part of Discord's public API and can't change without breaking every bot, and
 * Fake Nitro hardcodes its bits the same way. Only the bits this plugin tests are listed.
 */
export const PERMISSION_BITS = {
	KICK_MEMBERS: 1n << 1n,
	BAN_MEMBERS: 1n << 2n,
	ADMINISTRATOR: 1n << 3n,
	MANAGE_CHANNELS: 1n << 4n,
	MANAGE_GUILD: 1n << 5n,
	MANAGE_MESSAGES: 1n << 13n,
	MUTE_MEMBERS: 1n << 22n,
	DEAFEN_MEMBERS: 1n << 23n,
	MOVE_MEMBERS: 1n << 24n,
	MANAGE_ROLES: 1n << 28n,
	MANAGE_WEBHOOKS: 1n << 29n,
	MODERATE_MEMBERS: 1n << 40n,
} as const

type Permission = keyof typeof PERMISSION_BITS

export interface TagDef {
	/** Stable key for this tag's own settings. Never change one: it is what storage is keyed by. */
	id: string
	text: string
	/** Compact mode's label when the tag has no icon. */
	short: string
	/** The colour this tag ships with, used unless the user picked their own. */
	defaultColor: string
	condition?: (
		guild: Guild | undefined,
		channel: Channel | undefined,
		user: User,
	) => boolean
	permissions?: Permission[]
}

/** First match wins, so the order is the order of importance. */
export const TAGS: TagDef[] = [
	{
		id: 'webhook',
		short: 'WH',
		text: 'WEBHOOK',
		defaultColor: '#99AAB5',
		condition: (_guild, _channel, user) => user.isNonUserBot?.() ?? false,
	},
	{
		id: 'owner',
		short: 'OWN',
		text: 'OWNER',
		defaultColor: '#F0B232',
		condition: (guild, _channel, user) => guild?.ownerId === user.id,
	},
	{
		id: 'admin',
		short: 'ADM',
		text: 'ADMIN',
		defaultColor: '#F23F42',
		permissions: ['ADMINISTRATOR'],
	},
	{
		id: 'staff',
		short: 'STF',
		text: 'STAFF',
		defaultColor: '#23A55A',
		permissions: [
			'MANAGE_GUILD',
			'MANAGE_CHANNELS',
			'MANAGE_ROLES',
			'MANAGE_WEBHOOKS',
		],
	},
	{
		id: 'mod',
		short: 'MOD',
		text: 'MOD',
		defaultColor: '#5865F2',
		permissions: ['MANAGE_MESSAGES', 'KICK_MEMBERS', 'BAN_MEMBERS'],
	},
	{
		id: 'vc_mod',
		short: 'VC',
		text: 'VC Mod',
		defaultColor: '#1ABC9C',
		permissions: ['MOVE_MEMBERS', 'MUTE_MEMBERS', 'DEAFEN_MEMBERS'],
	},
	{
		id: 'chat_mod',
		short: 'CM',
		text: 'Chat Mod',
		defaultColor: '#9B59B6',
		permissions: ['MODERATE_MEMBERS'],
	},
]

/** A tag ready to draw. */
export interface ResolvedTag {
	id: string
	text: string
	textColor: string
	backgroundColor: string
	gradientColor?: string
	icon?: string
	customSvg?: string
	iconOnly: boolean
	/** Message rows are drawn natively and take a string, so an icon shows there as its glyph. */
	iconGlyph?: string
	verified: boolean
}

/** The props that draw [tag] with Discord's tag component. `type: 0` is a plain tag. */
export function tagProps(tag: ResolvedTag): TagProps {
	return {
		type: 0,
		text: tag.text,
		textColor: tag.textColor,
		backgroundColor: tag.backgroundColor,
		gradientColor: tag.gradientColor,
		icon: tag.icon,
		customSvg: tag.customSvg,
		iconOnly: tag.iconOnly,
		verified: tag.verified,
		staffTag: true,
	}
}

// The permission helper's argument order isn't documented, so try the known call shapes once and
// remember whichever one answers. -1 means none of them work with this helper.
type CallShape = (
	helper: PermissionHelper,
	guild: Guild,
	channel: Channel | undefined,
	user: User,
) => unknown

const CALL_SHAPES: CallShape[] = [
	(helper, guild, channel, user) =>
		helper({ user, context: guild, overwrites: channel?.permissionOverwrites }),
	(helper, guild, channel, user) =>
		helper({
			user,
			context: guild,
			overwrites: channel?.permissionOverwrites,
			checkElevated: false,
		}),
	(helper, guild, channel, user) => helper(user, guild, channel),
	(helper, guild, channel, user) => helper(guild, channel, user),
]

let shapeFor: PermissionHelper | undefined
let workingShape: number | undefined
let warned = false

function computePermissions(
	guild: Guild,
	channel: Channel | undefined,
	user: User,
): bigint | undefined {
	const helper = getPermissionHelper()
	// Not loaded yet: skip permission tags for this render. It is looked up and waited for.
	if (!helper) return undefined
	if (helper !== shapeFor) {
		shapeFor = helper
		workingShape = undefined
	}
	if (workingShape === -1) return undefined

	const candidates =
		workingShape === undefined ? CALL_SHAPES.map((_, i) => i) : [workingShape]
	for (const index of candidates) {
		try {
			const result = CALL_SHAPES[index](helper, guild, channel, user)
			// A bitmask as a bigint, a number, or the decimal string Discord's API uses.
			const bits =
				typeof result === 'bigint' || typeof result === 'number'
					? BigInt(result)
					: typeof result === 'string' && /^\d+$/.test(result)
						? BigInt(result)
						: undefined
			if (bits !== undefined) {
				workingShape = index
				return bits
			}
		} catch {
			/* wrong shape, try the next one */
		}
	}

	workingShape = -1
	// The helper is there but answers to none of the shapes: the one way left for every permission
	// tag to disappear at once. Said once, not on every row.
	if (!warned) {
		warned = true
		reportError(
			'[StaffTags] could not compute permissions with this Discord version. ADMIN/STAFF/MOD tags will not appear.',
		)
	}
	return undefined
}

/** Where a tag is being drawn; each place has its own switch. */
export type Place = 'chat' | 'members' | 'profiles'

const PLACE_SETTING = {
	chat: 'showInChat',
	members: 'showInMembers',
	profiles: 'showInProfiles',
} as const

/** Compact label for text with no short form: initials of several words, else the first 3 letters. */
function abbreviate(text: string): string {
	const words = text.trim().split(/\s+/)
	return (words.length > 1 ? words.map(word => word[0]).join('') : text.trim())
		.slice(0, 3)
		.toUpperCase()
}

function compactLabel(tag: ResolvedTag, short: string): ResolvedTag {
	if (tag.icon || tag.iconGlyph) return { ...tag, iconOnly: true }
	return { ...tag, text: short }
}

/**
 * Resolved tags by guild, channel and user. Working a tag out means computing the member's
 * permissions from all their roles; in chat that ran again for every message row, even for the
 * same author. `tag: null` remembers "no tag".
 *
 * An entry is reused only while the member's `roles` array and role colour are the ones it was
 * computed from, so a member whose roles change (or who was not loaded yet and now is) is worked
 * out again, and nobody else is. The whole cache is cleared only by events that change
 * permissions for everyone: roles, the guild, channel overwrites, settings (see `index.ts`).
 *
 * The first version of this cache was cleared on every change of GuildMemberStore and four other
 * stores. GuildMemberStore changes on almost every incoming message, so in real use the cache was
 * emptied constantly and permissions were recomputed nearly as often as without it.
 */
interface CachedTag {
	tag: ResolvedTag | null
	roles: unknown
	color: unknown
}
const cache = new Map<string, CachedTag>()
const MAX_CACHED = 5000

export function clearTagCache() {
	cache.clear()
}

/** The tag [user] gets in [guild] at [place], or undefined. */
export default function getTag(
	guild: Guild | undefined,
	channel: Channel | undefined,
	user: User | undefined,
	place: Place,
): ResolvedTag | undefined {
	if (!user?.id) return undefined
	const s = settings()
	if (s[PLACE_SETTING[place]] === false) return undefined

	const key = `${guild?.id ?? ''}|${channel?.id ?? ''}|${user.id}`
	const member = guild
		? (stores.guildMember()?.getMember(guild.id, user.id) as
				| { roles?: unknown; colorString?: unknown }
				| undefined)
		: undefined
	const roles = member?.roles
	const color = member?.colorString
	const known = cache.get(key)
	if (known && known.roles === roles && known.color === color)
		return known.tag ?? undefined

	const tag = resolveTag(guild, channel, user, s.useRoleColor, s.compact)
	// Until Discord's permission helper and tag component have loaded, the answer may be
	// incomplete; keep asking instead of remembering it.
	if (getTagModule() && (!guild || getPermissionHelper())) {
		if (cache.size >= MAX_CACHED) cache.clear()
		cache.set(key, { tag: tag ?? null, roles, color })
	}
	return tag
}

function resolveTag(
	guild: Guild | undefined,
	channel: Channel | undefined,
	user: User,
	useRoleColor: boolean,
	compact: boolean,
): ResolvedTag | undefined {
	// A tag you gave this person yourself comes first, in every server and in DMs.
	const own = userTagFor(user.id)
	if (own) {
		const backgroundColor = own.color || USER_TAG_COLOR
		const tag: ResolvedTag = {
			id: `user:${user.id}`,
			text: own.text.trim(),
			textColor: isDarkColor(backgroundColor) ? '#FFFFFF' : '#000000',
			backgroundColor,
			iconOnly: false,
			verified: false,
		}
		return compact ? compactLabel(tag, abbreviate(tag.text)) : tag
	}

	if (isGuildHidden(guild?.id)) return undefined
	const tag = staffTag(guild, channel, user, useRoleColor)
	if (!tag || !compact) return tag
	const def = TAGS.find(entry => entry.id === tag.id)
	const custom = overrideFor(tag.id).text?.trim()
	return compactLabel(
		tag,
		custom ? abbreviate(custom) : (def?.short ?? abbreviate(tag.text)),
	)
}

function staffTag(
	guild: Guild | undefined,
	channel: Channel | undefined,
	user: User,
	useRoleColor: boolean,
): ResolvedTag | undefined {
	if (!user) return undefined
	const permissions = guild
		? computePermissions(guild, channel, user)
		: undefined
	const has = (name: Permission) =>
		permissions !== undefined && (permissions & PERMISSION_BITS[name]) !== 0n

	for (const tag of TAGS) {
		const matches =
			tag.condition?.(guild, channel, user) ||
			(!user.bot && tag.permissions?.some(has))
		if (!matches) continue

		// Everything the user changed about this one tag. Read per call, so a settings change shows
		// up on the next row Discord draws.
		const custom = overrideFor(tag.id)
		if (custom.enabled === false) continue

		const roleColor =
			useRoleColor && guild
				? stores.guildMember()?.getMember(guild.id, user.id)?.colorString
				: undefined
		// A colour the user picked wins over the role colour: they asked for that exact one.
		const chosenColor =
			custom.useCustomColor && custom.color ? custom.color : undefined
		const backgroundColor = chosenColor || roleColor || tag.defaultColor

		return {
			id: tag.id,
			text: custom.text?.trim() || tag.text,
			textColor: isDarkColor(backgroundColor) ? '#FFFFFF' : '#000000',
			backgroundColor,
			gradientColor:
				custom.useGradient && custom.gradientColor
					? custom.gradientColor
					: undefined,
			icon: custom.icon && custom.icon !== 'none' ? custom.icon : undefined,
			customSvg: custom.customSvg,
			iconOnly: !!custom.iconOnly,
			iconGlyph: iconById(custom.icon)?.fallback,
			verified: false,
		}
	}

	return undefined
}
