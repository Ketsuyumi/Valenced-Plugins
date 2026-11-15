/**
 * Temporary debug plugin: records which components render the DM details
 * tabs (Members / Media / Pins / Links / Files) and the "New Group" button,
 * so a real plugin can patch them. Not published to the repository.
 */
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { ClientInfoModule } from '@valenced/discord/native'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { before } from '@valenced/patcher'
import { React, ReactJSXRuntime } from '@valenced/react'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import type { PluginApi } from '@valenced/plugins/types'

const TARGETS = ['New Group', 'Members', 'Media', 'Pins', 'Links', 'Files']
const MAX_ENTRIES = 120

const entries: string[] = []
const seen = new Set<string>()
let listeners: (() => void)[] = []
let logger: PluginApi['logger'] | undefined

function matches(s: string): boolean {
	return (
		TARGETS.some(t => s === t || s.startsWith(`${t} (`)) || /new group/i.test(s)
	)
}

function describeValue(v: unknown): string {
	if (v === null) return 'null'
	if (Array.isArray(v)) return `array(${v.length})`
	if (typeof v === 'object' && v && '$$typeof' in v) return 'element'
	return typeof v
}

/** `{a:string,b:function}` style summary of an object's shape. */
function shape(obj: unknown): string {
	if (!obj || typeof obj !== 'object') return describeValue(obj)
	return `{${Object.keys(obj)
		.slice(0, 25)
		.map(k => `${k}:${describeValue((obj as any)[k])}`)
		.join(',')}}`
}

function typeName(type: unknown): string {
	if (typeof type === 'string') return `<${type}>`
	if (typeof type === 'function')
		return (type as any).displayName || type.name || '(anonymous fn)'
	if (type && typeof type === 'object') {
		const t = type as any
		const kind = String(t.$$typeof?.description ?? t.$$typeof ?? 'object')
		const inner = t.type ?? t.render
		return `${t.displayName || inner?.displayName || inner?.name || '(anonymous)'} [${kind}]`
	}
	return String(type)
}

function location(type: unknown): string {
	const t = type as any
	const fn =
		typeof t === 'function'
			? t
			: typeof t?.type === 'function'
				? t.type
				: typeof t?.render === 'function'
					? t.render
					: undefined
	if (!fn) return '-'
	try {
		const loc = (globalThis as any).HermesInternal?.getFunctionLocation?.(fn)
		if (!loc) return '-'
		return `${loc.fileName ?? '?'}:${loc.lineNumber}:${loc.columnNumber} seg=${loc.segmentID} off=${loc.virtualOffset}`
	} catch {
		return '-'
	}
}

/** Paths of props whose (nested) string values look like our targets. */
function findMatches(
	props: any,
): { path: string; value: string; item?: unknown }[] {
	const found: { path: string; value: string; item?: unknown }[] = []
	if (!props || typeof props !== 'object') return found

	for (const key of Object.keys(props)) {
		const v = props[key]
		if (typeof v === 'string') {
			if (matches(v)) found.push({ path: key, value: v })
		} else if (Array.isArray(v)) {
			v.slice(0, 20).forEach((item, i) => {
				if (typeof item === 'string') {
					if (matches(item)) found.push({ path: `${key}[${i}]`, value: item })
				} else if (item && typeof item === 'object' && !('$$typeof' in item)) {
					for (const f of Object.keys(item))
						if (typeof item[f] === 'string' && matches(item[f]))
							found.push({ path: `${key}[${i}].${f}`, value: item[f], item })
				}
			})
		} else if (v && typeof v === 'object' && !('$$typeof' in v)) {
			for (const f of Object.keys(v))
				if (typeof v[f] === 'string' && matches(v[f]))
					found.push({ path: `${key}.${f}`, value: v[f] })
		}
	}
	return found
}

function record(type: unknown, props: any) {
	const found = findMatches(props)
	if (!found.length || entries.length >= MAX_ENTRIES) return

	const name = typeName(type)
	const key = `${name}|${found.map(f => `${f.path}=${f.value}`).join(';')}`
	if (seen.has(key)) return
	seen.add(key)

	const stack = String(new Error().stack ?? '')
		.split('\n')
		.slice(2, 18)
		.map(l => l.trim())
		.join(' <- ')

	const lines = [
		`## ${name}`,
		`loc: ${location(type)}`,
		`matched: ${found.map(f => `${f.path}="${f.value}"`).join(', ')}`,
		`props: ${shape(props)}`,
		...found
			.filter(f => f.item)
			.slice(0, 1)
			.map(f => `item: ${shape(f.item)}`),
		`stack: ${stack}`,
	]
	const entry = lines.join('\n')
	entries.push(entry)
	logger?.log(`[inspector]\n${entry}`)
	for (const l of listeners) l()
}

function storeInfo(name: string): string {
	const store = Stores[name] as any
	if (!store) return `${name}: missing`
	const methods = new Set<string>()
	let proto = Object.getPrototypeOf(store)
	while (proto && proto !== Object.prototype) {
		for (const k of Object.getOwnPropertyNames(proto))
			if (k !== 'constructor' && !k.startsWith('_')) methods.add(k)
		proto = Object.getPrototypeOf(proto)
	}
	return `${name}: ${[...methods]
		.filter(m => /^(get|has|is|search)/.test(m))
		.slice(0, 40)
		.join(', ')}`
}

function report(): string {
	let version = '?'
	try {
		version = String(ClientInfoModule.getConstants().Version)
	} catch {}
	return [
		`# DM inspector report (Discord ${version})`,
		'',
		...['StickersStore', 'EmojiStore', 'MessageStore', 'SearchStore'].map(
			storeInfo,
		),
		'',
		entries.length
			? entries.join('\n\n')
			: 'No matches yet. Open a DM, tap its name to open the details screen, switch between tabs, then come back.',
	].join('\n')
}

function SettingsPage() {
	const { Stack, Text, Button } = Design
	const [, rerender] = useState(0)

	React.useEffect(() => {
		const l = () => rerender(n => n + 1)
		listeners.push(l)
		return () => {
			listeners = listeners.filter(x => x !== l)
		}
	}, [])

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ padding: 16 }}
			keyboardShouldPersistTaps="handled"
		>
			<Stack spacing={16}>
				<Text variant="text-md/medium">
					1. Open a DM and tap the name at the top to open its details.{'\n'}
					2. Tap through Members, Media, Pins, Links and Files.{'\n'}
					3. Also open search in that DM and type "has: sticker".{'\n'}
					4. Come back here and tap Copy report, then paste it to Claude.
				</Text>
				<Text variant="text-sm/medium" color="text-muted">
					Recorded so far: {entries.length}
				</Text>
				<Button
					text="Copy report"
					onPress={() => Clipboard.setString(report())}
				/>
				<Button
					text="Clear"
					variant="secondary"
					onPress={() => {
						entries.length = 0
						seen.clear()
						rerender(n => n + 1)
					}}
				/>
			</Stack>
		</ScrollView>
	)
}

export default plugin({
	start({ cleanup, logger: pluginLogger }) {
		logger = pluginLogger
		const hook = (args: any[]) => {
			try {
				record(args[0], args[1])
			} catch {}
			return args
		}
		const runtime = ReactJSXRuntime as any
		for (const key of ['jsx', 'jsxs'])
			if (typeof runtime[key] === 'function')
				cleanup(before(runtime, key, hook as never))
		cleanup(before(React as any, 'createElement', hook as never))
		pluginLogger.log('[inspector] watching for DM details components')
	},
	SettingsComponent: SettingsPage,
})
