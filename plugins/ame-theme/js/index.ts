/// <reference types="@valenced/themes-api" />

import { lazyColors } from './theme-kit'
import type { Look, Palette, Tone } from './theme-kit'

/**
 * Ame-chan, from NEEDY STREAMER OVERLOAD: plum surfaces from the art's background, her red vest
 * for buttons and toggles, and the gold of her heart charm and hairpin for links and mentions.
 * Text stays near-white on plum (about 13:1), so chat reads like Discord's own dark theme.
 */

const cherry = '#c93c51' // her vest, brightened a little to read on plum
const gold = '#e8c98b'

const tone: Tone = {
	greys: [
		['#000000', '#0a0710'],
		['#2c2d32', '#17111f'],
		['#323339', '#1f1729'],
		['#393a41', '#2a1f35'],
		['#41434a', '#33273f'],
		['#595a63', '#55456a'],
		['#81828a', '#85739c'],
		['#97979f', '#9d8bb4'],
		['#abacb2', '#b4a3cb'],
		['#c5c6ca', '#ccbedf'],
		['#efeff1', '#f1eaf8'],
		['#f3f3f4', '#f6f0fb'],
		['#fbfbfb', '#fcf9fe'],
		['#ffffff', '#ffffff'],
	],
	hues: {
		red: '#ef5a6f',
		orange: '#f0a070',
		yellow: gold,
		green: '#7fd3a8',
		teal: '#86d6cf',
		blue: '#8aa2ee',
		blurple: '#9a82e0',
		purple: '#a77ad6',
		pink: '#ff8fb0',
	},
}

const night: Palette = {
	rail: '#17111f',
	floor: '#1f1729',
	panel: '#1b1424',
	page: '#241a30',
	card: '#2d2239',
	popup: '#342842',
	input: '#2a1f35',
	control: '#3b2d4b',
	pressed: '#47375b',

	heading: '#ffffff',
	strong: '#f6f0fb',
	text: '#e6dcf0',
	subtle: '#c4b3da',
	muted: '#a08cb9',
	faint: '#6e5d86',

	divider: '#c9a7ff1a',
	border: '#c9a7ff2e',
	borderStrong: '#c9a7ff52',

	accent: cherry,
	accentPress: '#b5334a',
	onAccent: '#ffffff',
	accentSoft: '#d6455a33',
	accentText: '#ff8f9e',
	brand: '#b8364b',
	rowIcon: '#ff8f9e',
	selection: '#9d7fd033',

	link: gold,
	mentionText: '#f6e2b8',
	mentionPill: '#e8c98b33',
	mentionBg: '#e8c98b14',
	replyBg: '#ffffff0d',
	keyword: '#d6455a40',
	code: '#140e1b',
	codeText: gold,
	spoiler: '#3e2f4d',
	spoilerRevealed: '#2d2239',

	positive: '#7fd3a8',
	warning: gold,
	danger: '#ff7d8f',
	dangerFill: cherry,
	scrim: '#0c0812cc',
}

const day: Palette = {
	rail: '#e9e0f2',
	floor: '#fcf9fd',
	panel: '#f3ecf8',
	page: '#f3ecf8',
	card: '#ffffff',
	popup: '#ffffff',
	input: '#eee5f6',
	control: '#e4d9ef',
	pressed: '#d6c7e7',

	heading: '#1c1222',
	strong: '#22172b',
	text: '#382b45',
	subtle: '#594a6b',
	muted: '#76688a',
	faint: '#a395b6',

	divider: '#22172b14',
	border: '#22172b21',
	borderStrong: '#22172b40',

	accent: '#c23a4f',
	accentPress: '#a93044',
	onAccent: '#ffffff',
	accentSoft: '#c23a4f26',
	accentText: '#a93044',
	brand: '#b8364b',
	rowIcon: '#a93044',
	selection: '#9d7fd02e',

	link: '#8a5f12',
	mentionText: '#7a540f',
	mentionPill: '#e8c98b59',
	mentionBg: '#e8c98b2e',
	replyBg: '#22172b0a',
	keyword: '#c23a4f40',
	code: '#f0e8f6',
	codeText: '#8a5f12',
	spoiler: '#c9bad9',
	spoilerRevealed: '#e4d9ef',

	positive: '#1f7a55',
	warning: '#8a5f12',
	danger: '#b5304a',
	dangerFill: '#c23a4f',
	scrim: '#22172b59',
}

// Online and voice stay green so they don't look like errors; do-not-disturb is her red.
const states = {
	STATUS_ONLINE: '#7fd3a8',
	ICON_STATUS_ONLINE: '#7fd3a8',
	TEXT_STATUS_ONLINE: '#7fd3a8',
	STATUS_SPEAKING: '#7fd3a8',
	ICON_VOICE_SPEAKING: '#7fd3a8',
	ICON_STATUS_DND: '#ef5a6f',
	TEXT_STATUS_DND: '#ef5a6f',
	BADGE_NOTIFICATION_BACKGROUND: cherry,
}

const dark: Look = { palette: night, extra: states }
const light: Look = { palette: day, extra: states }
const colors = lazyColors(tone, { dark, darker: dark, midnight: dark, light })

export default plugin({
	preInit({ themes }) {
		themes.registerGroup('ame', {
			name: 'Ame-chan',
			description: 'NEEDY STREAMER OVERLOAD · plum, cherry red and gold.',
		})
		themes.registerTheme('ame', 'ame', {
			name: 'Ame-chan',
			description: 'Plum surfaces, cherry-red accents, gold links. Simple and readable.',
			getColors: colors,
		})
		themes.registerTheme('ame', 'ame-background', {
			name: 'Ame-chan (Background)',
			description: 'The same colours with Ame-chan in the corner, dimmed so text stays readable.',
			getColors: colors,
			background: {
				path: 'assets/ame.jpg',
				opacity: 1,
				blur: 0,
				dimming: 0.78,
			},
		})
	},
})
