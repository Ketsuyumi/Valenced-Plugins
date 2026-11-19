/**
 * AO3 works, fetched and turned into paragraphs for a native reader.
 *
 * The whole work comes in one page: `/works/{id}?view_full_work=true&view_adult=true` (the second
 * skips the "this work could have adult content" stop). Chapter text is in `div.userstuff`
 * (summaries and notes are `blockquote.userstuff`, so they don't match), chapter titles in
 * `h3.title`. There's no DOM here, so a small tag reader turns the HTML into paragraphs of styled
 * pieces: italic, bold, underline, strikethrough, centred, headings, dividers.
 */

export interface Span {
	t: string
	i?: boolean
	b?: boolean
	u?: boolean
	s?: boolean
}
export interface Para {
	spans: Span[]
	center?: boolean
	heading?: boolean
	divider?: boolean
}
export interface Chapter {
	title: string
	paras: Para[]
}
export interface Work {
	id: string
	title: string
	author: string
	summary: string
	fandom: string
	rating: string
	words: string
	chapters: Chapter[]
}

/** The work ID in an AO3 link (works or chapter links, ao3.org too). */
export function workIdOf(url: unknown): string | undefined {
	if (typeof url !== 'string') return undefined
	const m =
		/(?:archiveofourown\.org|ao3\.org)\/(?:collections\/[^/]+\/)?works\/(\d+)/i.exec(
			url,
		)
	return m?.[1]
}

const ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	mdash: '—',
	ndash: '–',
	hellip: '…',
	lsquo: '‘',
	rsquo: '’',
	ldquo: '“',
	rdquo: '”',
	laquo: '«',
	raquo: '»',
	copy: '©',
	reg: '®',
	trade: '™',
	middot: '·',
	bull: '•',
	deg: '°',
	times: '×',
	eacute: 'é',
	egrave: 'è',
	aacute: 'á',
	agrave: 'à',
	iacute: 'í',
	oacute: 'ó',
	uacute: 'ú',
	ntilde: 'ñ',
	ccedil: 'ç',
	uuml: 'ü',
	ouml: 'ö',
	auml: 'ä',
	szlig: 'ß',
}
export function decode(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
		if (code[0] === '#') {
			const n =
				code[1] === 'x' || code[1] === 'X'
					? parseInt(code.slice(2), 16)
					: parseInt(code.slice(1), 10)
			try {
				return Number.isFinite(n) ? String.fromCodePoint(n) : all
			} catch {
				return all
			}
		}
		return ENTITIES[code.toLowerCase()] ?? all
	})
}

const stripTags = (html: string) =>
	decode(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
		.replace(/[ \t]+/g, ' ')
		.trim()

/** The inside of the element whose opening tag ends at [from], counting nested tags of [tag]. */
function inner(
	html: string,
	from: number,
	tag: string,
): { body: string; end: number } {
	const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi')
	re.lastIndex = from
	let depth = 1
	let m: RegExpExecArray | null
	while ((m = re.exec(html))) {
		depth += m[1] ? -1 : 1
		if (depth === 0)
			return { body: html.slice(from, m.index), end: re.lastIndex }
	}
	return { body: html.slice(from), end: html.length }
}

const BLOCK = new Set([
	'p',
	'div',
	'blockquote',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'li',
	'tr',
	'center',
	'ul',
	'ol',
	'table',
	'section',
	'details',
	'summary',
	'figure',
	'pre',
])
const STYLE: Record<string, keyof Omit<Span, 't'>> = {
	i: 'i',
	em: 'i',
	cite: 'i',
	b: 'b',
	strong: 'b',
	u: 'u',
	ins: 'u',
	s: 's',
	strike: 's',
	del: 's',
}

/** HTML of chapter text → paragraphs. */
export function toParas(html: string): Para[] {
	const out: Para[] = []
	let spans: Span[] = []
	const style: Record<string, number> = { i: 0, b: 0, u: 0, s: 0 }
	let center = 0
	let heading = 0
	const alignStack: boolean[] = []
	const flush = () => {
		// Trim the paragraph's ends; drop it if nothing is left.
		while (spans.length && !spans[0].t.trim()) spans.shift()
		while (spans.length && !spans[spans.length - 1].t.trim()) spans.pop()
		if (spans.length) {
			spans[0] = { ...spans[0], t: spans[0].t.replace(/^\s+/, '') }
			const last = spans.length - 1
			spans[last] = { ...spans[last], t: spans[last].t.replace(/\s+$/, '') }
			out.push({
				spans,
				center: center > 0 || undefined,
				heading: heading > 0 || undefined,
			})
		}
		spans = []
	}
	const add = (t: string) => {
		if (!t) return
		const span: Span = { t }
		if (style.i) span.i = true
		if (style.b) span.b = true
		if (style.u) span.u = true
		if (style.s) span.s = true
		const prev = spans[spans.length - 1]
		if (
			prev &&
			prev.i === span.i &&
			prev.b === span.b &&
			prev.u === span.u &&
			prev.s === span.s
		)
			prev.t += t
		else spans.push(span)
	}
	const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g
	let m: RegExpExecArray | null
	while ((m = re.exec(html))) {
		if (m[4] !== undefined) {
			add(decode(m[4].replace(/\s+/g, ' ')))
			continue
		}
		if (!m[2]) continue
		const closing = !!m[1]
		const tag = m[2].toLowerCase()
		const attrs = m[3] ?? ''
		if (tag === 'br') {
			add('\n')
			continue
		}
		if (tag === 'hr') {
			flush()
			out.push({ spans: [], divider: true })
			continue
		}
		if (tag === 'img') {
			const alt = /alt="([^"]*)"/i.exec(attrs)?.[1]
			add(alt ? `[image: ${decode(alt)}]` : '[image]')
			continue
		}
		if (STYLE[tag]) {
			style[STYLE[tag]] = Math.max(0, style[STYLE[tag]] + (closing ? -1 : 1))
			continue
		}
		if (BLOCK.has(tag)) {
			flush()
			const isHeading = /^h[1-6]$/.test(tag)
			if (closing) {
				if (alignStack.pop()) center--
				if (isHeading) heading = Math.max(0, heading - 1)
			} else {
				const centred =
					tag === 'center' || /align="?center|text-align:\s*center/i.test(attrs)
				alignStack.push(centred)
				if (centred) center++
				if (isHeading) heading++
				if (tag === 'li') add('• ')
			}
		}
	}
	flush()
	return out
}

function field(html: string, re: RegExp): string {
	const m = re.exec(html)
	return m ? stripTags(m[1]) : ''
}

/** Parses a full-work page. */
export function parseWork(id: string, html: string): Work {
	const title =
		field(html, /<h2 class="title heading">([\s\S]*?)<\/h2>/) || `Work ${id}`
	const author =
		field(html, /<h3 class="byline heading">([\s\S]*?)<\/h3>/) || 'Anonymous'
	const summary = field(
		html,
		/<div class="summary module">[\s\S]*?<blockquote class="userstuff">([\s\S]*?)<\/blockquote>/,
	)
	const fandom = field(html, /<dd class="fandom tags">([\s\S]*?)<\/dd>/)
	const rating = field(html, /<dd class="rating tags">([\s\S]*?)<\/dd>/)
	const words = field(html, /<dd class="words">([\s\S]*?)<\/dd>/)
	const chapters: Chapter[] = []
	const open = /<div class="userstuff[^"]*"[^>]*>/g
	let m: RegExpExecArray | null
	let lastEnd = 0
	while ((m = open.exec(html))) {
		const { body, end } = inner(html, open.lastIndex, 'div')
		// The chapter's title is the last h3.title between the previous chapter and this one.
		const between = html.slice(lastEnd, m.index)
		const titles = [...between.matchAll(/<h3 class="title">([\s\S]*?)<\/h3>/g)]
		const t = titles.length ? stripTags(titles[titles.length - 1][1]) : ''
		const paras = toParas(
			body.replace(/<h3 class="landmark heading"[^>]*>[\s\S]*?<\/h3>/, ''),
		)
		if (paras.length)
			chapters.push({
				title:
					t || (chapters.length ? `Chapter ${chapters.length + 1}` : title),
				paras,
			})
		open.lastIndex = end
		lastEnd = end
	}
	return { id, title, author, summary, fandom, rating, words, chapters }
}

export class Ao3Error extends Error {}

/** Fetches and parses a work. */
export async function fetchWork(id: string): Promise<Work> {
	const res = await fetch(
		`https://archiveofourown.org/works/${id}?view_full_work=true&view_adult=true`,
		{
			headers: {
				Accept: 'text/html',
				'User-Agent':
					'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
			},
		},
	)
	if (res.status === 404)
		throw new Ao3Error("That work doesn't exist (or was deleted).")
	if (res.status === 429 || res.status === 503)
		throw new Ao3Error('AO3 is busy or rate limiting. Try again in a minute.')
	if (!res.ok) throw new Ao3Error(`AO3 answered ${res.status}.`)
	const html = await res.text()
	if (
		/only available to registered users|users\/login/i.test(html) &&
		!/class="userstuff/.test(html)
	)
		throw new Ao3Error(
			'This work is for logged-in AO3 users only. Open it in the browser.',
		)
	const work = parseWork(id, html)
	if (!work.chapters.length)
		throw new Ao3Error("Couldn't find the work's text on the page.")
	return work
}
