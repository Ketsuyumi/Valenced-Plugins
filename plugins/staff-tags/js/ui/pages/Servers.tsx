import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { getStorage, isGuildHidden, setGuildHidden } from '../../lib/state'
import { useBottomPadding } from '../safeArea'

interface GuildInfo {
	id: string
	name?: string
}

function guilds(): GuildInfo[] {
	const store = Stores.GuildStore as
		| { getGuilds?(): Record<string, GuildInfo> }
		| undefined
	try {
		return Object.values(store?.getGuilds?.() ?? {}).sort((a, b) =>
			(a.name ?? '').localeCompare(b.name ?? ''),
		)
	} catch {
		return []
	}
}

/** One switch per server: off hides staff tags there. */
export default function Servers() {
	// Read per-render, never at module scope.
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, Text, TextInput, TableRowGroup, TableSwitchRow } = Design

	getStorage()?.use()
	const [query, setQuery] = React.useState('')
	const all = React.useMemo(guilds, [])
	const needle = query.trim().toLowerCase()
	const shown = needle
		? all.filter(guild => guild.name?.toLowerCase().includes(needle))
		: all
	const hiddenCount = all.filter(guild => isGuildHidden(guild.id)).length

	return (
		<Page>
			<ScrollView
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
				keyboardShouldPersistTaps="handled"
			>
				<Stack spacing={16}>
					<TextInput
						placeholder="Search servers"
						value={query}
						onChange={setQuery}
						isClearable
					/>
					<TableRowGroup
						title={`Servers (${hiddenCount} hidden of ${all.length})`}
					>
						{shown.map(guild => (
							<TableSwitchRow
								key={guild.id}
								label={guild.name ?? guild.id}
								value={!isGuildHidden(guild.id)}
								onValueChange={(value: boolean) =>
									setGuildHidden(guild.id, !value)
								}
							/>
						))}
					</TableRowGroup>
					<Text color="text-muted" variant="text-sm/normal">
						Off hides OWNER, ADMIN, MOD and the other staff tags in that server.
						Tags you gave people yourself still show.
					</Text>
				</Stack>
			</ScrollView>
		</Page>
	)
}
