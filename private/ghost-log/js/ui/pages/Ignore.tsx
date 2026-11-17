import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'
import { getStores } from '../../lib/stores'
import { setSettings, useSettings } from '../../settings'
import { useBottomPadding } from '../safeArea'
import type { IgnoreEntry, IgnoreKind } from '../../types'

const ID = /^\d{17,20}$/

const KIND_LABEL: Record<IgnoreKind, string> = {
	server: 'Server',
	channel: 'Channel',
	user: 'Person',
}

/** What an id is, from what Discord has loaded: a server, a channel or a person. */
function identify(id: string): { kind: IgnoreKind; label: string } | undefined {
	const s = getStores() as any
	try {
		const guild = s.GuildStore?.getGuild?.(id)
		if (guild) return { kind: 'server', label: guild.name ?? id }
		const channel = s.ChannelStore?.getChannel?.(id)
		if (channel) {
			const guildName = channel.guild_id
				? s.GuildStore?.getGuild?.(channel.guild_id)?.name
				: undefined
			const name = channel.name ? `#${channel.name}` : 'Direct message'
			return {
				kind: 'channel',
				label: guildName ? `${name} in ${guildName}` : name,
			}
		}
		const user = s.UserStore?.getUser?.(id)
		if (user)
			return {
				kind: 'user',
				label: user.globalName ?? user.global_name ?? user.username ?? id,
			}
	} catch {
		/* fall through: unknown */
	}
	return undefined
}

/** Ghost Log+: servers, channels and people whose deletions and edits are never logged. */
export default function Ignore() {
	const { Page } = components
	const { React } = react
	const { ScrollView } = ReactNative
	const {
		Stack,
		Text,
		TextInput,
		Button,
		TableRowGroup,
		TableRow,
		TableRadioGroup,
		TableRadioRow,
	} = Design as any

	const s = useSettings()
	const ignored = s.ignored ?? {}
	const [input, setInput] = React.useState('')
	const [chosen, setChosen] = React.useState<IgnoreKind | undefined>()

	const id = input.trim()
	const valid = ID.test(id)
	const found = valid ? identify(id) : undefined
	const kind: IgnoreKind = chosen ?? found?.kind ?? 'user'
	const already = valid && ignored[id]?.on

	const write = (key: string, entry: IgnoreEntry) =>
		void setSettings({ ignored: { ...ignored, [key]: entry } })

	const add = () => {
		if (!valid) return
		// The name is only trusted when Discord identified the id as the kind being saved.
		const label = found && found.kind === kind ? found.label : id
		write(id, { kind, label, on: true })
		setInput('')
		setChosen(undefined)
	}

	const entries = Object.entries(ignored).filter(([, entry]) => entry?.on)

	return (
		<Page>
			<ScrollView
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
				keyboardShouldPersistTaps="handled"
			>
				<Stack spacing={24}>
					<TextInput
						label="Server, channel or user ID"
						placeholder="159985870458322944"
						value={input}
						onChange={(value: string) => {
							setInput(value)
							setChosen(undefined)
						}}
						isClearable
						status={id && !valid ? 'error' : 'default'}
						errorMessage={
							id && !valid ? 'An ID is a 17 to 20 digit number' : undefined
						}
						description={
							valid
								? already
									? 'Already on the list.'
									: found
										? `${KIND_LABEL[found.kind]}: ${found.label}`
										: "Discord hasn't loaded this ID, so pick what it is below."
								: 'Turn on Developer Mode, then long-press a server, channel or person and copy the ID.'
						}
					/>

					<TableRadioGroup
						title="This ID is a"
						defaultValue={kind}
						value={kind}
						onChange={(value: IgnoreKind) => setChosen(value)}
					>
						<TableRadioRow label="Server" value="server" />
						<TableRadioRow label="Channel" value="channel" />
						<TableRadioRow label="Person" value="user" />
					</TableRadioGroup>

					<Button
						text="Add to ignore list"
						disabled={!valid || !!already}
						onPress={add}
					/>

					{entries.length ? (
						<TableRowGroup title="Ignored">
							{entries.map(([key, entry]) => (
								<TableRow
									key={key}
									label={entry.label}
									subLabel={`${KIND_LABEL[entry.kind] ?? 'ID'} · ${key}`}
									trailing={
										<Button
											text="✕"
											size="sm"
											variant="secondary"
											onPress={() => write(key, { ...entry, on: false })}
										/>
									}
								/>
							))}
						</TableRowGroup>
					) : null}

					<Text color="text-muted" variant="text-sm/normal">
						Deleted and edited messages from anything on this list are not
						logged, saved or kept on screen. Messages already in the log stay
						until you remove them.
					</Text>
				</Stack>
			</ScrollView>
		</Page>
	)
}
