import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import * as React from 'react'
import * as ReactNative from 'react-native'
import {
	getStorage,
	removeUserTag,
	settings,
	setUserTag,
	USER_TAG_COLOR,
} from '../../lib/state'
import ColorInput from '../ColorInput'
import { useBottomPadding } from '../safeArea'

const USER_ID = /^\d{17,20}$/
const MAX_TEXT = 24

function nameOf(id: string): string | undefined {
	const user = (
		Stores.UserStore as
			| {
					getUser?(
						id: string,
					): { username?: string; globalName?: string } | undefined
			  }
			| undefined
	)?.getUser?.(id)
	return user?.globalName || user?.username
}

/** Your own tag for a specific person: shown everywhere, before any staff tag. */
export default function UserTags() {
	// Read per-render, never at module scope.
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, TextInput, Button, TableRowGroup, TableRow } = Design

	getStorage()?.use()
	const tags = settings().userTags ?? {}
	const [id, setId] = React.useState('')
	const [text, setText] = React.useState('')
	const [color, setColor] = React.useState('')
	// ColorInput keeps its own draft, so it is remounted when a row is loaded for editing.
	const [formKey, setFormKey] = React.useState(0)

	const userId = id.trim()
	const validId = USER_ID.test(userId)
	const label = text.trim()
	const editing = validId && !!tags[userId]
	const who = validId ? nameOf(userId) : undefined

	const save = () => {
		if (!validId || !label) return
		setUserTag(userId, { text: label.slice(0, MAX_TEXT), color })
		setId('')
		setText('')
		setColor('')
		setFormKey(key => key + 1)
	}

	const load = (rowId: string) => {
		setId(rowId)
		setText(tags[rowId]?.text ?? '')
		setColor(tags[rowId]?.color ?? '')
		setFormKey(key => key + 1)
	}

	const swatch = (value: string) => (
		<View
			style={{
				width: 28,
				height: 28,
				borderRadius: 6,
				backgroundColor: value || USER_TAG_COLOR,
			}}
		/>
	)

	const entries = Object.entries(tags).filter(([, tag]) => tag?.text?.trim())

	return (
		<Page>
			<ScrollView
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
				keyboardShouldPersistTaps="handled"
			>
				<Stack spacing={24}>
					<Stack spacing={12}>
						<TextInput
							label="User ID"
							placeholder="159985870458322944"
							value={id}
							onChange={setId}
							isClearable
							status={id.trim() && !validId ? 'error' : 'default'}
							errorMessage={
								id.trim() && !validId
									? 'A Discord ID is a 17 to 20 digit number'
									: undefined
							}
							description={
								validId
									? `${who ?? 'Unknown user (not loaded yet)'}${editing ? ' · has a tag, saving replaces it' : ''}`
									: 'Turn on Developer Mode, then long-press someone and copy their user ID.'
							}
						/>
						<TextInput
							label="Tag"
							placeholder="FRIEND"
							value={text}
							onChange={(value: string) => setText(value.slice(0, MAX_TEXT))}
							isClearable
						/>
					</Stack>
					<TableRowGroup title="Colour">
						<ColorInput
							key={formKey}
							label="Background"
							description="Empty uses pink. Hex like #EB459E, or RGB like 235, 69, 158"
							value={color}
							placeholder={USER_TAG_COLOR}
							onChange={setColor}
						/>
					</TableRowGroup>
					<Button
						text={editing ? 'Save tag' : 'Add tag'}
						disabled={!validId || !label}
						onPress={save}
					/>

					{entries.length ? (
						<TableRowGroup title="Your tags — tap one to edit it" hasIcons>
							{entries.map(([rowId, tag]) => (
								<TableRow
									key={rowId}
									label={tag.text}
									subLabel={`${nameOf(rowId) ?? 'Unknown user'} · ${rowId}`}
									icon={swatch(tag.color)}
									onPress={() => load(rowId)}
									trailing={
										<Button
											text="✕"
											size="sm"
											variant="secondary"
											onPress={() => removeUserTag(rowId)}
										/>
									}
								/>
							))}
						</TableRowGroup>
					) : null}

					<Text color="text-muted" variant="text-sm/normal">
						Only you see these. They show in every server and in DMs, before any
						staff tag, and follow Compact mode and the "Show tags in" switches.
					</Text>
				</Stack>
			</ScrollView>
		</Page>
	)
}
