/// <reference types="@valenced/themes-api" />

import { lazyColors } from './theme-kit'
import type { Look, Palette, Tone } from './theme-kit'

/**
 * Mari, from OMORI: violet-night surfaces from her hair, her blue vest for buttons and toggles,
 * the coral of her neckerchief for links and mentions, and the art's magenta sparkles for
 * highlights. Text stays near-white (about 13:1) so chat reads like Discord's dark theme.
 */

const vest = '#8c86f5' // her vest, lifted to read on dark violet
const coral = '#f4a29a'

const tone: Tone = {
	greys: [
		['#000000', '#07060f'],
		['#2c2d32', '#14112a'],
		['#323339', '#1b1733'],
		['#393a41', '#25203f'],
		['#41434a', '#2e2849'],
		['#595a63', '#4d4670'],
		['#81828a', '#7d759f'],
		['#97979f', '#978fb9'],
		['#abacb2', '#afa7d0'],
		['#c5c6ca', '#c8c1e5'],
		['#efeff1', '#eeeafb'],
		['#f3f3f4', '#f4f1fd'],
		['#fbfbfb', '#fbfaff'],
		['#ffffff', '#ffffff'],
	],
	hues: {
		red: '#ff7a8a',
		orange: coral,
		yellow: '#f2d488',
		green: '#7fd8b6',
		teal: '#86cfe0',
		blue: '#8aa0f5',
		blurple: vest,
		purple: '#b38af0',
		pink: '#e86ad8',
	},
}

const night: Palette = {
	rail: '#14112a',
	floor: '#1b1733',
	panel: '#17142e',
	page: '#211c3b',
	card: '#2a2446',
	popup: '#312a50',
	input: '#25203f',
	control: '#363057',
	pressed: '#433b68',

	heading: '#ffffff',
	strong: '#f4f1fd',
	text: '#e4def5',
	subtle: '#c0b7e0',
	muted: '#9d93c2',
	faint: '#6a6191',

	divider: '#b3a8ff1a',
	border: '#b3a8ff2e',
	borderStrong: '#b3a8ff52',

	accent: vest,
	accentPress: '#7b74ea',
	onAccent: '#100d24',
	accentSoft: '#8c86f533',
	accentText: '#b8b4ff',
	brand: '#5a52d6',
	rowIcon: vest,
	selection: '#b38af02e',

	link: coral,
	mentionText: '#ffd3cd',
	mentionPill: '#f4a29a33',
	mentionBg: '#f4a29a14',
	replyBg: '#ffffff0d',
	keyword: '#e86ad840',
	code: '#0f0c22',
	codeText: coral,
	spoiler: '#363057',
	spoilerRevealed: '#2a2446',

	positive: '#7fd8b6',
	warning: '#f2d488',
	danger: '#ff7a8a',
	dangerFill: '#d84a64',
	scrim: '#07060fcc',
}

const day: Palette = {
	rail: '#e3dff6',
	floor: '#fbfaff',
	panel: '#f0edfb',
	page: '#f0edfb',
	card: '#ffffff',
	popup: '#ffffff',
	input: '#eae6f9',
	control: '#dfd9f4',
	pressed: '#cfc7ec',

	heading: '#120f26',
	strong: '#18142f',
	text: '#2f2a4a',
	subtle: '#4f486f',
	muted: '#6c658e',
	faint: '#9c96b8',

	divider: '#18142f14',
	border: '#18142f21',
	borderStrong: '#18142f40',

	accent: '#5a52d6',
	accentPress: '#4a43c0',
	onAccent: '#ffffff',
	accentSoft: '#5a52d626',
	accentText: '#4a43c0',
	brand: '#5a52d6',
	rowIcon: '#4a43c0',
	selection: '#8c86f52e',

	link: '#b2443a',
	mentionText: '#9c3a31',
	mentionPill: '#f4a29a59',
	mentionBg: '#f4a29a2e',
	replyBg: '#18142f0a',
	keyword: '#e86ad840',
	code: '#eeebfa',
	codeText: '#b2443a',
	spoiler: '#c8c1e5',
	spoilerRevealed: '#dfd9f4',

	positive: '#1f7a5a',
	warning: '#7a6418',
	danger: '#b5304a',
	dangerFill: '#d84a64',
	scrim: '#18142f59',
}

const states = {
	STATUS_ONLINE: '#7fd8b6',
	ICON_STATUS_ONLINE: '#7fd8b6',
	TEXT_STATUS_ONLINE: '#7fd8b6',
	STATUS_SPEAKING: '#7fd8b6',
	ICON_VOICE_SPEAKING: '#7fd8b6',
	ICON_STATUS_DND: '#ff7a8a',
	TEXT_STATUS_DND: '#ff7a8a',
	BADGE_NOTIFICATION_BACKGROUND: '#d84a64',
}

const dark: Look = { palette: night, extra: states }
const light: Look = { palette: day, extra: states }
const colors = lazyColors(tone, { dark, darker: dark, midnight: dark, light })

export default plugin({
	preInit({ themes }) {
		themes.registerGroup('mari', {
			name: 'Mari',
			description: 'OMORI · violet night, vest blue and coral.',
		})
		themes.registerTheme('mari', 'mari', {
			name: 'Mari',
			description: 'Violet surfaces, blue accents, coral links. Simple and readable.',
			getColors: colors,
		})
		themes.registerTheme('mari', 'mari-background', {
			name: 'Mari (Background)',
			description: 'The same colours with Mari at the top of the screen, dimmed so text stays readable.',
			getColors: colors,
			background: {
				path: 'assets/mari.jpg',
				opacity: 1,
				blur: 0,
				dimming: 0.78,
			},
		})
	},
})
