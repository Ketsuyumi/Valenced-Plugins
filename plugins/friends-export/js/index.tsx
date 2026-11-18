import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { FileModule } from '@valenced/discord/native'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { argument, createCommands, OptionType } from './commands'
import { collect, counts, fileName, render } from './export'
import type { Format, Scope } from './export'

const commands = createCommands('Friends Export', 2)

function toast(text: string) {
	try {
		ToastActionCreators.open('friends-export', { text } as never)
	} catch {}
}

async function copy(text: string) {
	await Clipboard.setString(text)
}

/** Saves to Downloads where the app may write there, else to Discord's documents folder. */
async function save(text: string, format: Format): Promise<string> {
	const name = fileName(format)
	const fm = FileModule as any
	const consts = fm.getConstants?.() ?? {}
	for (const [where, dir] of [
		['downloads', consts.DownloadsDirPath],
		['documents', consts.DocumentsDirPath],
	] as const) {
		try {
			await fm.writeFile(where, name, text, 'utf8')
			return dir ? `${dir}/${name}` : `${where}/${name}`
		} catch {}
	}
	throw new Error("Couldn't write the file")
}

const SHOW_LIMIT = 3500

function SettingsPage() {
	const { Stack, Text, Button, TableRowGroup, TableRow, TableRadioGroup, TableRadioRow } = Design as any
	const [format, setFormat] = useState<Format>('text')
	const [scope, setScope] = useState<Scope>('friends')
	const [busy, setBusy] = useState(false)
	const n = counts()
	const people = collect(scope)
	const status = commands.registryStatus()
	return (
		<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
			<Stack spacing={24}>
				<TableRowGroup title="Your relationships">
					<TableRow label="Friends" trailing={<Text variant="text-md/semibold">{n.friend ?? 0}</Text>} />
					<TableRow label="Blocked" trailing={<Text variant="text-md/semibold">{n.blocked ?? 0}</Text>} />
					<TableRow
						label="Requests"
						subLabel="Incoming / outgoing"
						trailing={
							<Text variant="text-md/semibold">
								{n['incoming request'] ?? 0} / {n['outgoing request'] ?? 0}
							</Text>
						}
					/>
				</TableRowGroup>
				<TableRadioGroup title="Include" defaultValue={scope} value={scope} onChange={setScope}>
					<TableRadioRow label="Friends only" value="friends" />
					<TableRadioRow label="Friends, blocked and requests" value="all" />
				</TableRadioGroup>
				<TableRadioGroup title="Format" defaultValue={format} value={format} onChange={setFormat}>
					<TableRadioRow label="Text list" subLabel="Name (@username) — nickname · since · ID" value="text" />
					<TableRadioRow label="CSV" subLabel="Opens in Sheets or Excel" value="csv" />
					<TableRadioRow label="JSON" value="json" />
				</TableRadioGroup>
				<Stack spacing={8}>
					<Button
						text={`Copy ${people.length} to clipboard`}
						disabled={busy || !people.length}
						onPress={async () => {
							await copy(render(people, format, scope))
							toast(`Copied ${people.length}`)
						}}
					/>
					<Button
						text="Save to a file"
						variant="secondary"
						disabled={busy || !people.length}
						onPress={async () => {
							setBusy(true)
							try {
								const path = await save(render(people, format, scope), format)
								toast(`Saved to ${path}`)
							} catch (e: any) {
								toast(e?.message ?? 'Saving failed')
							} finally {
								setBusy(false)
							}
						}}
					/>
				</Stack>
				<TableRowGroup title="Slash command">
					<TableRow
						label="/friendslist"
						subLabel={
							status.found
								? 'Ready. Options: format, include, and to (show, copy or file). Only you see the reply.'
								: 'Waiting for Discord’s command list (open a chat once).'
						}
					/>
				</TableRowGroup>
			</Stack>
		</ScrollView>
	)
}

export default plugin({
	start({ cleanup }) {
		cleanup(
			commands.registerCommand({
				name: 'friendslist',
				description: 'Export your friends list (only you see the reply)',
				options: [
					{
						name: 'format',
						description: 'How to write it',
						type: OptionType.String,
						choices: [
							{ name: 'text', value: 'text' },
							{ name: 'csv', value: 'csv' },
							{ name: 'json', value: 'json' },
						],
					},
					{
						name: 'include',
						description: 'Friends only, or blocked and requests too',
						type: OptionType.String,
						choices: [
							{ name: 'friends', value: 'friends' },
							{ name: 'everything', value: 'all' },
						],
					},
					{
						name: 'to',
						description: 'Show it here, copy it, or save a file',
						type: OptionType.String,
						choices: [
							{ name: 'show', value: 'show' },
							{ name: 'copy', value: 'copy' },
							{ name: 'file', value: 'file' },
						],
					},
				],
				execute(args, context) {
					const format = argument<Format>(args, 'format', 'text')
					const scope = argument<Scope>(args, 'include', 'friends')
					const to = argument<string>(args, 'to', 'show')
					const channelId = context?.channel?.id
					const people = collect(scope)
					const text = render(people, format, scope)
					const reply = (content: string) => {
						if (channelId) commands.showClientMessage({ channelId, content })
						else toast(content)
					}
					if (!people.length) return reply('Nothing to export.')
					if (to === 'copy')
						return void copy(text).then(() => reply(`Copied ${people.length} to your clipboard (${format}).`))
					if (to === 'file')
						return void save(text, format)
							.then(path => reply(`Saved ${people.length} to \`${path}\`.`))
							.catch(e => reply(e?.message ?? 'Saving failed'))
					const body = text.length > SHOW_LIMIT ? `${text.slice(0, SHOW_LIMIT)}\n…` : text
					const more = text.length > SHOW_LIMIT ? '\nToo long to show in full: use `to: copy` or `to: file`.' : ''
					reply(`**${people.length} exported** (${format})\n\`\`\`\n${body}\n\`\`\`${more}`)
				},
			}),
		)
	},
	SettingsComponent: SettingsPage,
})
