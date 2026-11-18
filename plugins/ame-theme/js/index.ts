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


// ---------------------------------------------------------------------------------------------
// Monochrome: the greyscale sketch. Slate surfaces with the art's periwinkle as the only colour.

const peri = '#9c9ed0'

const monoTone: Tone = {
	greys: [
		['#000000', '#08080d'],
		['#2c2d32', '#15151d'],
		['#323339', '#1c1c26'],
		['#393a41', '#262633'],
		['#41434a', '#2f2f3e'],
		['#595a63', '#4e4f63'],
		['#81828a', '#7d7f95'],
		['#97979f', '#9799ad'],
		['#abacb2', '#b0b2c6'],
		['#c5c6ca', '#c9cadb'],
		['#efeff1', '#ececf3'],
		['#f3f3f4', '#f3f3f8'],
		['#fbfbfb', '#fbfbfd'],
		['#ffffff', '#ffffff'],
	],
	hues: {
		red: '#e8798a',
		orange: '#e0a585',
		yellow: '#dcc98e',
		green: '#8fcfb4',
		teal: '#9cc9d6',
		blue: '#9aaee6',
		blurple: peri,
		purple: '#aa9ad6',
		pink: '#d6a0c8',
	},
}

const monoNight: Palette = {
	...night,
	rail: '#15151d',
	floor: '#1c1c26',
	panel: '#191922',
	page: '#21212c',
	card: '#292936',
	popup: '#30303e',
	input: '#252531',
	control: '#363646',
	pressed: '#424256',
	strong: '#f3f3f8',
	text: '#e2e2ec',
	subtle: '#bdbed2',
	muted: '#9798ae',
	faint: '#66677d',
	divider: '#b8baff17',
	border: '#b8baff29',
	borderStrong: '#b8baff4a',
	accent: peri,
	accentPress: '#8a8cc2',
	onAccent: '#14141c',
	accentSoft: '#9c9ed033',
	accentText: '#c3c5f0',
	brand: '#5e60a0',
	rowIcon: peri,
	selection: '#9c9ed02e',
	link: '#c3c5f0',
	mentionText: '#e0e1fb',
	mentionPill: '#9c9ed040',
	mentionBg: '#9c9ed017',
	keyword: '#9c9ed040',
	code: '#111118',
	codeText: '#c3c5f0',
	spoiler: '#363646',
	spoilerRevealed: '#292936',
	positive: '#8fcfb4',
	warning: '#dcc98e',
	danger: '#e8798a',
	dangerFill: '#c25468',
	scrim: '#08080dcc',
}

const monoDay: Palette = {
	...day,
	rail: '#e1e1ec',
	floor: '#fafafd',
	panel: '#efeff6',
	page: '#efeff6',
	input: '#e9e9f2',
	control: '#dedee9',
	pressed: '#cfd0e0',
	heading: '#16161e',
	strong: '#1c1c26',
	text: '#33333f',
	subtle: '#53546a',
	muted: '#707187',
	faint: '#9fa0b3',
	divider: '#1c1c2614',
	border: '#1c1c2621',
	borderStrong: '#1c1c2640',
	accent: '#6f71b0',
	accentPress: '#5f61a0',
	onAccent: '#ffffff',
	accentSoft: '#6f71b026',
	accentText: '#4f5194',
	brand: '#5e60a0',
	rowIcon: '#4f5194',
	selection: '#6f71b026',
	link: '#4547a0',
	mentionText: '#3d3f92',
	mentionPill: '#6f71b033',
	mentionBg: '#6f71b01f',
	keyword: '#6f71b040',
	code: '#ececf4',
	codeText: '#4547a0',
	spoiler: '#c4c5d6',
	spoilerRevealed: '#dedee9',
	positive: '#24745a',
	warning: '#7a6418',
	danger: '#b0364c',
	dangerFill: '#c25468',
}

const monoStates = {
	...states,
	STATUS_ONLINE: '#8fcfb4',
	ICON_STATUS_ONLINE: '#8fcfb4',
	TEXT_STATUS_ONLINE: '#8fcfb4',
	STATUS_SPEAKING: '#8fcfb4',
	ICON_VOICE_SPEAKING: '#8fcfb4',
	ICON_STATUS_DND: '#e8798a',
	TEXT_STATUS_DND: '#e8798a',
	BADGE_NOTIFICATION_BACKGROUND: '#c25468',
}
const monoColors = lazyColors(monoTone, {
	dark: { palette: monoNight, extra: monoStates },
	darker: { palette: monoNight, extra: monoStates },
	midnight: { palette: monoNight, extra: monoStates },
	light: { palette: monoDay, extra: monoStates },
})

// ---------------------------------------------------------------------------------------------
// Glitch: the stream-glitch art. Deep magenta surfaces, hot pink accents and the glitch's cyan
// for links and mentions.

const hot = '#c2407f'
const cyan = '#7fe3ec'

const glitchTone: Tone = {
	greys: [
		['#000000', '#0c050b'],
		['#2c2d32', '#1b0d1b'],
		['#323339', '#231223'],
		['#393a41', '#2e182f'],
		['#41434a', '#381e39'],
		['#595a63', '#5c3b5c'],
		['#81828a', '#8c6a8b'],
		['#97979f', '#a685a4'],
		['#abacb2', '#bd9fbb'],
		['#c5c6ca', '#d6bfd4'],
		['#efeff1', '#f6e9f4'],
		['#f3f3f4', '#f9eff7'],
		['#fbfbfb', '#fdf8fc'],
		['#ffffff', '#ffffff'],
	],
	hues: {
		red: '#ff6b7d',
		orange: '#f39a76',
		yellow: '#f0d080',
		green: '#7fe0b4',
		teal: cyan,
		blue: '#88aaf5',
		blurple: '#b07fe6',
		purple: '#c47ae0',
		pink: '#ff8fc6',
	},
}

const glitchNight: Palette = {
	...night,
	rail: '#1b0d1b',
	floor: '#231223',
	panel: '#1f0f1f',
	page: '#2a162b',
	card: '#331b35',
	popup: '#3b203d',
	input: '#2e1830',
	control: '#45254a',
	pressed: '#532c58',
	strong: '#f9eff7',
	text: '#f0e1ee',
	subtle: '#d2b5cf',
	muted: '#ad8daa',
	faint: '#755a74',
	divider: '#ff8fc61a',
	border: '#ff8fc62e',
	borderStrong: '#ff8fc652',
	accent: hot,
	accentPress: '#ad366f',
	onAccent: '#ffffff',
	accentSoft: '#c2407f33',
	accentText: '#ff9ccc',
	brand: '#a8336b',
	rowIcon: '#ff9ccc',
	selection: '#c2407f2e',
	link: cyan,
	mentionText: '#c6f6fa',
	mentionPill: '#7fe3ec33',
	mentionBg: '#7fe3ec14',
	keyword: '#c2407f40',
	code: '#140814',
	codeText: cyan,
	spoiler: '#45254a',
	spoilerRevealed: '#331b35',
	positive: '#7fe0b4',
	warning: '#f0d080',
	danger: '#ff6b7d',
	dangerFill: '#c8384e',
	scrim: '#0c050bcc',
}

const glitchDay: Palette = {
	...day,
	rail: '#f1dfee',
	floor: '#fdf8fc',
	panel: '#f7ecf5',
	page: '#f7ecf5',
	input: '#f3e4f0',
	control: '#ead6e6',
	pressed: '#dfc3da',
	heading: '#200f1f',
	strong: '#271426',
	text: '#3e2a3d',
	subtle: '#62485f',
	muted: '#80677d',
	faint: '#ad97ab',
	divider: '#27142614',
	border: '#27142621',
	borderStrong: '#27142640',
	accent: hot,
	accentPress: '#ad366f',
	onAccent: '#ffffff',
	accentSoft: '#c2407f26',
	accentText: '#a32f68',
	brand: '#a8336b',
	rowIcon: '#a32f68',
	selection: '#c2407f24',
	link: '#0f7480',
	mentionText: '#0d6670',
	mentionPill: '#2fbfcc33',
	mentionBg: '#2fbfcc1f',
	keyword: '#c2407f40',
	code: '#f5e9f3',
	codeText: '#0f7480',
	spoiler: '#d6bfd4',
	spoilerRevealed: '#ead6e6',
	positive: '#1f7a55',
	warning: '#7a6418',
	danger: '#b5304a',
	dangerFill: '#c8384e',
}

const glitchStates = {
	...states,
	STATUS_ONLINE: '#7fe0b4',
	ICON_STATUS_ONLINE: '#7fe0b4',
	TEXT_STATUS_ONLINE: '#7fe0b4',
	STATUS_SPEAKING: '#7fe0b4',
	ICON_VOICE_SPEAKING: '#7fe0b4',
	ICON_STATUS_DND: '#ff6b7d',
	TEXT_STATUS_DND: '#ff6b7d',
	BADGE_NOTIFICATION_BACKGROUND: hot,
}
const glitchColors = lazyColors(glitchTone, {
	dark: { palette: glitchNight, extra: glitchStates },
	darker: { palette: glitchNight, extra: glitchStates },
	midnight: { palette: glitchNight, extra: glitchStates },
	light: { palette: glitchDay, extra: glitchStates },
})

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
			name: 'Ame-chan (Background, top)',
			description: 'The same colours with Ame-chan in the top corner, dimmed so text stays readable.',
			getColors: colors,
			background: {
				path: 'assets/ame.jpg',
				opacity: 1,
				blur: 0,
				dimming: 0.78,
			},
		})
		themes.registerTheme('ame', 'ame-background-bottom', {
			name: 'Ame-chan (Background, bottom)',
			description: 'Ame-chan in the bottom corner instead, her hair fading into the purple so the top of the chat stays clear.',
			getColors: colors,
			background: {
				path: 'assets/ame-bottom.jpg',
				opacity: 1,
				blur: 0,
				dimming: 0.78,
			},
		})
		themes.registerTheme('ame', 'ame-mono', {
			name: 'Ame-chan Purple',
			description: 'Soft purple and slate, from the sketch art.',
			getColors: monoColors,
		})
		themes.registerTheme('ame', 'ame-mono-background', {
			name: 'Ame-chan Purple (Background)',
			description: 'The sketch art without its white frame, at the bottom of the screen.',
			getColors: monoColors,
			background: {
				path: 'assets/ame-mono.jpg',
				opacity: 1,
				blur: 0,
				dimming: 0.78,
			},
		})
		themes.registerTheme('ame', 'ame-glitch', {
			name: 'Ame-chan Glitch',
			description: 'Deep magenta, hot pink and glitch cyan.',
			getColors: glitchColors,
		})
		themes.registerTheme('ame', 'ame-glitch-background', {
			name: 'Ame-chan Glitch (Background)',
			description: 'The glitch art at the bottom of the screen, fading into grainy magenta.',
			getColors: glitchColors,
			background: {
				path: 'assets/ame-glitch.jpg',
				opacity: 1,
				blur: 0,
				dimming: 0.78,
			},
		})
	},
})
