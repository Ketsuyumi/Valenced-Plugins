import {
	ActionSheetActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import { Component, useMemo, useState } from 'react'
import * as ReactNative from 'react-native'
import { Dimensions, Pressable, View } from 'react-native'
import { textColor } from './color'
import { addToMessage, send } from './input'
import { TABS } from './meows'

const KEY = 'meow-picker'

export interface PickerOptions {
	recent: () => string[]
	remember: (text: string) => void
	tapSends: () => boolean
	keepOpen: () => boolean
}

function toast(text: string) {
	try {
		ToastActionCreators.open(KEY, { text } as never)
	} catch {}
}

/**
 * A list a Discord bottom sheet lets scroll. Discord's sheets are @gorhom/bottom-sheet, whose drag
 * only gives way to its own BottomSheetScrollView (what the emoji list uses); a plain ScrollView
 * can't be scrolled in one. Approach from bleelblep's Pocket Browser / Character Counter (GPL-3.0).
 */
let SheetList: any
function sheetList(): any {
	if (SheetList) return SheetList
	try {
		for (const [exports] of (finders as any).lookupModules(
			(filters as any).withProps(
				'BottomSheetScrollView',
				'BottomSheetFlatList',
			),
		)) {
			SheetList = exports.BottomSheetScrollView
			break
		}
	} catch {}
	return SheetList
}
class Boundary extends Component<
	{ fallback: () => any; children?: any },
	{ failed: boolean }
> {
	state = { failed: false }
	static getDerivedStateFromError() {
		return { failed: true }
	}
	render() {
		return this.state.failed ? this.props.fallback() : this.props.children
	}
}
function SheetScrollView(props: any) {
	const Plain: any = (ReactNative as any).ScrollView
	const Sheet = sheetList()
	if (!Sheet) return <Plain {...props} />
	return (
		<Boundary fallback={() => <Plain {...props} />}>
			<Sheet {...props} />
		</Boundary>
	)
}

function pick(text: string, sendNow: boolean, opts: PickerOptions) {
	opts.remember(text)
	const done = sendNow ? send(text) : addToMessage(text) || send(text)
	if (!done) return toast('Open a chat first')
	if (!opts.keepOpen())
		try {
			;(ActionSheetActionCreators as any).hideActionSheet(KEY)
		} catch {}
}

function Chip({
	text,
	opts,
	color,
}: {
	text: string
	opts: PickerOptions
	color: string
}) {
	const { Text } = Design as any
	return (
		<Pressable
			onPress={() => pick(text, opts.tapSends(), opts)}
			onLongPress={() => pick(text, true, opts)}
			delayLongPress={350}
			accessibilityRole="button"
			accessibilityLabel={text}
			style={({ pressed }: { pressed: boolean }) => ({
				paddingHorizontal: 10,
				paddingVertical: 7,
				margin: 3,
				borderRadius: 14,
				maxWidth: '100%',
				backgroundColor: pressed
					? 'rgba(255,255,255,0.16)'
					: 'rgba(255,255,255,0.06)',
			})}
		>
			<Text variant="text-sm/medium" style={{ color }} numberOfLines={2}>
				{text}
			</Text>
		</Pressable>
	)
}

function MeowSheet({ opts }: { opts: PickerOptions }) {
	const { ActionSheet, Text, TextInput } = Design as any
	const recent = opts.recent()
	const tabs = useMemo(
		() => [
			...(recent.length
				? [['Recent', '🕘', recent] as [string, string, string[]]]
				: []),
			...TABS,
		],
		[],
	)
	const [tab, setTab] = useState(0)
	const [query, setQuery] = useState('')
	const color = textColor()
	const q = query.trim().toLowerCase()
	const shown = q
		? [
				...new Set(
					TABS.flatMap(([, , list]) => list).filter(m =>
						m.toLowerCase().includes(q),
					),
				),
			]
		: tabs[tab][2]
	return (
		<ActionSheet startExpanded>
			{/* A fixed height: the sheet sizes itself to what's inside, and a list with only a
			    maximum height measured as almost nothing, so the sheet opened cut off. */}
			<View
				style={{ height: Math.round(Dimensions.get('window').height * 0.62) }}
			>
				<View style={{ paddingHorizontal: 12, paddingTop: 4 }}>
					<View
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							marginBottom: 8,
						}}
					>
						<Text variant="heading-md/bold" style={{ color, flex: 1 }}>
							{q ? `${shown.length} found` : tabs[tab][0]}
						</Text>
						<Text variant="text-xs/medium" color="text-muted">
							tap adds · hold sends
						</Text>
					</View>
					{TextInput ? (
						<TextInput
							placeholder="Search meows"
							value={query}
							onChange={setQuery}
							isClearable
							size="sm"
						/>
					) : null}
					<View
						style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}
					>
						{tabs.map(([name, icon], i) => {
							const on = i === tab && !q
							return (
								<Pressable
									key={name}
									onPress={() => {
										setQuery('')
										setTab(i)
									}}
									accessibilityRole="tab"
									accessibilityLabel={name}
									accessibilityState={{ selected: on }}
									style={{
										width: 38,
										height: 34,
										margin: 2,
										borderRadius: 10,
										alignItems: 'center',
										justifyContent: 'center',
										backgroundColor: on
											? 'rgba(88,101,242,0.35)'
											: 'rgba(255,255,255,0.05)',
									}}
								>
									<Text variant="text-md/bold" style={{ color }}>
										{icon}
									</Text>
								</Pressable>
							)
						})}
					</View>
				</View>
				<SheetScrollView
					style={{ flex: 1 }}
					contentContainerStyle={{
						flexDirection: 'row',
						flexWrap: 'wrap',
						padding: 9,
						paddingBottom: 32,
					}}
					keyboardShouldPersistTaps="handled"
				>
					{shown.length ? (
						shown.map(m => <Chip key={m} text={m} opts={opts} color={color} />)
					) : (
						<Text
							variant="text-sm/medium"
							color="text-muted"
							style={{ padding: 8 }}
						>
							No meows match that.
						</Text>
					)}
				</SheetScrollView>
			</View>
		</ActionSheet>
	)
}

export function openPicker(opts: PickerOptions) {
	try {
		;(ActionSheetActionCreators as any).openLazy(
			Promise.resolve({ default: MeowSheet }),
			KEY,
			{ opts },
		)
	} catch (e: any) {
		toast(`Couldn't open the meows: ${e?.message ?? e}`)
	}
}
