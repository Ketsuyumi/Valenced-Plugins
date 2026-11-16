/** What one tag may have changed about it. Everything is optional: absent means "as shipped". */
export interface TagOverride {
	/** Off hides this tag everywhere. */
	enabled?: boolean
	/** Replaces the label, e.g. "OWNER" -> "BOSS". */
	text?: string
	/** Id from `lib/icons.ts`, or "none". */
	icon?: string
	/** Pasted `<svg>` markup, used when `icon` is "custom". */
	customSvg?: string
	/** Show only the icon, without the label text. */
	iconOnly?: boolean
	/** Use `color` instead of the tag's own colour. */
	useCustomColor?: boolean
	/** Background colour as `#rrggbb`. */
	color?: string
	/** Fade from `color` to `gradientColor` across the tag. */
	useGradient?: boolean
	gradientColor?: string
}

export interface StaffTagsStorage {
	/** Tag backgrounds follow the member's top role colour instead of the tag's own. */
	useRoleColor: boolean
	/**
	 * Per-tag changes, keyed by tag id.
	 *
	 * A keyed object rather than an array because entries are only ever added or updated, never
	 * removed -- `jsonStorage.set()` deep-merges objects and cannot delete a key, so "reset" is
	 * written as an explicit empty override rather than a deletion (docs/coding-rules.md rule 6).
	 */
	tags: Record<string, TagOverride>
	/** Short tags: the icon alone when the tag has one, otherwise an abbreviation like ADM or VC. */
	compact: boolean
	/** Where tags are drawn. */
	showInChat: boolean
	showInMembers: boolean
	showInProfiles: boolean
	/** Guild id -> true while staff tags are hidden in that server. `false` means shown. */
	hiddenGuilds: Record<string, boolean>
	/** Your own tag for a specific person, by user id. Shown everywhere, before any staff tag. */
	userTags: Record<string, UserTag>
}

export interface UserTag {
	text: string
	/** Background colour as `#rrggbb`, or '' for the default. */
	color: string
}
