/// <reference types="@valenced/themes-api" />

import { lazyColors } from './theme-kit'
import type { Look, Palette, Tone } from './theme-kit'

/**
 * Aubrey, from OMORI: her purple hair for the surfaces, the pink bow for buttons and toggles, and
 * her mint dress for links and mentions. Text stays near-white on plum (about 13:1), so chat reads
 * as easily as Discord's own dark theme.
 */

const bow = '#f4a3b8'
const onBow = '#2b1220' // dark text on pink: 9:1, where white would be 2:1
const mint = '#97e3d8'

// Discord's greys become plum, keyed by how light they are.
const tone: Tone = {
	greys: [
		['#000000', '#0b0710'],
		['#2c2d32', '#1a1220'],
		['#323339', '#221829'],
		['#393a41', '#2c2135'],
		['#41434a', '#352840'],
		['#595a63', '#57466b'],
		['#81828a', '#86749e'],
		['#97979f', '#9e8cb6'],
		['#abacb2', '#b5a4cc'],
		['#c5c6ca', '#cdbfe0'],
		['#efeff1', '#f1eaf8'],
		['#f3f3f4', '#f6f0fb'],
		['#fbfbfb', '#fcf9fe'],
		['#ffffff', '#ffffff'],
	],
	hues: {
		red: '#ff7d95',
		orange: '#f4a77a',
		yellow: '#f2d27a',
		green: '#6fd6c0',
		teal: mint,
		blue: '#8fb0f2',
		blurple: '#a98ae6',
		purple: '#b48ce6',
		pink: bow,
	},
}

const night: Palette = {
	rail: '#1a1220',
	floor: '#221829',
	panel: '#1e1525',
	page: '#261b2e',
	card: '#2f2338',
	popup: '#35283f',
	input: '#2c2035',
	control: '#3b2d49',
	pressed: '#46365a',

	heading: '#ffffff',
	strong: '#f6f0fb',
	text: '#e6dcf0',
	subtle: '#c4b3da',
	muted: '#a08cb9',
	faint: '#6e5d86',

	divider: '#c9a7ff1a',
	border: '#c9a7ff2e',
	borderStrong: '#c9a7ff52',

	accent: bow,
	accentPress: '#e98ea6',
	onAccent: onBow,
	accentSoft: '#f4a3b829',
	accentText: '#f7b8c9',
	brand: '#c9587e',
	rowIcon: bow,
	selection: '#b48ce633',

	link: mint,
	mentionText: '#c6f3ec',
	mentionPill: '#97e3d833',
	mentionBg: '#97e3d814',
	replyBg: '#ffffff0d',
	keyword: '#f4a3b840',
	code: '#150e1b',
	codeText: mint,
	spoiler: '#3e2f4d',
	spoilerRevealed: '#2f2338',

	positive: '#7fdcc6',
	warning: '#f2d27a',
	danger: '#ff7d95',
	dangerFill: '#e8607e',
	scrim: '#0d0812cc',
}

const day: Palette = {
	rail: '#e6dcf3',
	floor: '#fbf8fe',
	panel: '#f1eaf9',
	page: '#f1eaf9',
	card: '#ffffff',
	popup: '#ffffff',
	input: '#ece3f7',
	control: '#e2d6f2',
	pressed: '#d4c4ea',

	heading: '#1e1426',
	strong: '#24192e',
	text: '#3a2d48',
	subtle: '#5b4a6e',
	muted: '#7a6a8e',
	faint: '#a596b8',

	divider: '#24192e14',
	border: '#24192e21',
	borderStrong: '#24192e40',

	accent: '#e27a98',
	accentPress: '#d0678a',
	onAccent: onBow,
	accentSoft: '#e27a9833',
	// The pink is too light for text on white, so text uses a deeper rose.
	accentText: '#b0466c',
	brand: '#b0466c',
	rowIcon: '#b0466c',
	selection: '#9d7fe02e',

	link: '#17766a',
	mentionText: '#16756a',
	mentionPill: '#3cbfa940',
	mentionBg: '#3cbfa91f',
	replyBg: '#24192e0a',
	keyword: '#e27a9859',
	code: '#efe7f8',
	codeText: '#1f8a7c',
	spoiler: '#c9bad9',
	spoilerRevealed: '#e2d6f2',

	positive: '#1f8a7c',
	warning: '#9a7414',
	danger: '#c43c5c',
	dangerFill: '#e8607e',
	scrim: '#24192e59',
}

// Online and voice are mint; do-not-disturb stays rose so it still differs from online.
const states = {
	STATUS_ONLINE: '#6fd6c0',
	ICON_STATUS_ONLINE: '#6fd6c0',
	TEXT_STATUS_ONLINE: '#6fd6c0',
	STATUS_SPEAKING: '#6fd6c0',
	ICON_VOICE_SPEAKING: '#6fd6c0',
	ICON_STATUS_DND: '#ff7d95',
	TEXT_STATUS_DND: '#ff7d95',
	BADGE_NOTIFICATION_BACKGROUND: '#e8607e',
}

const dark: Look = { palette: night, extra: states }
const light: Look = { palette: day, extra: states }
const colors = lazyColors(tone, { dark, darker: dark, midnight: dark, light })

export default plugin({
	preInit({ themes }) {
		themes.registerGroup('aubrey', {
			name: 'Aubrey',
			description: 'OMORI · soft plum, bow pink and mint.',
		})
		themes.registerTheme('aubrey', 'aubrey', {
			name: 'Aubrey',
			description: 'Plum surfaces, pink accents, mint links. Simple and readable.',
			getColors: colors,
		})
		themes.registerTheme('aubrey', 'aubrey-background', {
			name: 'Aubrey (Background)',
			description: 'The same colours over OMORI artwork, softly blurred and dimmed so text stays readable.',
			getColors: colors,
			background: {
				path: 'assets/aubrey.jpg',
				opacity: 1,
				blur: 2,
				dimming: 0.78,
			},
		})
	},
})
