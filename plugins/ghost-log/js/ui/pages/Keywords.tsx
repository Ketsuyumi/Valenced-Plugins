import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'
import { setSettings, useSettings } from '../../settings'
import { useBottomPadding } from '../safeArea'

const MAX_LENGTH = 60

/** Ghost Log+: words that raise a notice when a deleted message contains them. */
export default function Keywords() {
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
		TableSwitchRow,
	} = Design as any

	const s = useSettings()
	const keywords = s.keywords ?? {}
	const [input, setInput] = React.useState('')

	const word = input.trim().toLowerCase().slice(0, MAX_LENGTH)
	const already = !!word && keywords[word] === true

	const write = (key: string, on: boolean) =>
		void setSettings({ keywords: { ...keywords, [key]: on } })

	const add = () => {
		if (!word || already) return
		write(word, true)
		setInput('')
	}

	const entries = Object.entries(keywords)
		.filter(([, on]) => on)
		.map(([key]) => key)
		.sort()

	return (
		<Page>
			<ScrollView
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
				keyboardShouldPersistTaps="handled"
			>
				<Stack spacing={24}>
					<TableRowGroup title="Alerts">
						<TableSwitchRow
							label="Keyword alerts"
							subLabel="Show a notice when a deleted message contains one of your keywords, even with Toast when caught off."
							value={s.keywordAlerts !== false}
							onValueChange={(value: boolean) =>
								void setSettings({ keywordAlerts: value })
							}
						/>
					</TableRowGroup>

					<Stack spacing={12}>
						<TextInput
							label="Word or phrase"
							placeholder="your name"
							value={input}
							onChange={(value: string) => setInput(value)}
							isClearable
							returnKeyType="done"
							description={
								already
									? 'Already on the list.'
									: 'Not case sensitive. Matches anywhere in the message, so a short word also matches inside longer ones.'
							}
						/>
						<Button
							text="Add keyword"
							disabled={!word || already}
							onPress={add}
						/>
					</Stack>

					{entries.length ? (
						<TableRowGroup title="Keywords">
							{entries.map(key => (
								<TableRow
									key={key}
									label={key}
									trailing={
										<Button
											text="✕"
											size="sm"
											variant="secondary"
											onPress={() => write(key, false)}
										/>
									}
								/>
							))}
						</TableRowGroup>
					) : null}

					<Text color="text-muted" variant="text-sm/normal">
						The notice names the keyword, who deleted the message and where.
						With "Tap the notice to jump" on, tapping it opens the message.
						Messages are logged whether or not they match.
					</Text>
				</Stack>
			</ScrollView>
		</Page>
	)
}
