import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as ReactNative from 'react-native'
import { TAGS } from '../../lib/getTag'
import { iconById } from '../../lib/icons'
import { selectTag } from '../../lib/selection'
import { DEFAULTS, overrideFor, setOption } from '../../lib/state'
import { SERVERS_ROUTE, TAG_ROUTE, USER_TAGS_ROUTE } from '../routes'
import { useBottomPadding } from '../safeArea'
import TagIcon from '../TagIcon'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { StaffTagsStorage } from '../../types'

/**
 * The tag list: every tag with what it currently looks like, each opening its own page.
 *
 * Resolved per-render, never at module top level. A plugin's whole bundle is evaluated
 * during preInit (revenge-bundle-next's createOptionsFactory runs the script through
 * `new Function`), long before Discord's design module exists. `valenced.discord.design.Design`
 * is a lazy proxy backed by lookupModule, and a full-scope miss calls cacheFilterNotFound()
 * on the *shared* 'valenced.discord.design.Design' key -- which permanently breaks Design for
 * Valenced's own settings UI too, not just this plugin, and gets flushed to the on-disk module
 * cache by the next unrelated write. That is what took out the whole Settings screen before.
 */
type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: StaffTagsStorage }>
>

export default function Settings({ api }: Props) {
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow } = Design
	const { useNavigation } = ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }

	const hiddenServers = Object.values(s.hiddenGuilds ?? {}).filter(
		Boolean,
	).length
	const userTagCount = Object.values(s.userTags ?? {}).filter(tag =>
		tag?.text?.trim(),
	).length

	const open = (id: string) => () => {
		selectTag(id)
		navigation.navigate(TAG_ROUTE)
	}

	const preview = (id: string, defaultColor: string) => {
		const custom = overrideFor(id)
		const colour =
			custom.useCustomColor && custom.color ? custom.color : defaultColor
		return (
			<View
				style={{
					width: 28,
					height: 28,
					borderRadius: 6,
					backgroundColor: colour,
					alignItems: 'center',
					justifyContent: 'center',
					opacity: custom.enabled === false ? 0.4 : 1,
				}}
			>
				<TagIcon
					icon={custom.icon}
					customSvg={custom.customSvg}
					color="#FFFFFF"
					size={14}
				/>
			</View>
		)
	}

	const describe = (id: string, original: string) => {
		const custom = overrideFor(id)
		if (custom.enabled === false) return 'Hidden'
		const bits: string[] = []
		if (custom.text?.trim() && custom.text.trim() !== original)
			bits.push(`reads “${custom.text.trim()}”`)
		if (custom.icon && custom.icon !== 'none')
			bits.push(
				custom.icon === 'custom'
					? 'own icon'
					: (iconById(custom.icon)?.name ?? 'icon'),
			)
		if (custom.useCustomColor && custom.color) bits.push(custom.color)
		if (custom.useGradient && custom.gradientColor) bits.push('gradient')
		return bits.length ? bits.join(', ') : 'As it ships'
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Tags — tap one to change it" hasIcons>
						{TAGS.map(tag => (
							<TableRow
								key={tag.id}
								label={tag.text}
								subLabel={describe(tag.id, tag.text)}
								icon={preview(tag.id, tag.defaultColor)}
								arrow
								onPress={open(tag.id)}
							/>
						))}
					</TableRowGroup>

					<TableRowGroup title="Everywhere">
						<TableSwitchRow
							label="Compact mode"
							subLabel="Just the icon when a tag has one, otherwise a short label like ADM or VC"
							value={!!s.compact}
							onValueChange={(value: boolean) => setOption('compact', value)}
						/>
						<TableSwitchRow
							label="Use top role colour for tag backgrounds"
							subLabel="A colour you set for a tag still wins over the role colour"
							value={!!s.useRoleColor}
							onValueChange={(value: boolean) =>
								setOption('useRoleColor', value)
							}
						/>
					</TableRowGroup>

					<TableRowGroup title="Show tags in">
						<TableSwitchRow
							label="Chat"
							subLabel="Beside names on messages"
							value={s.showInChat !== false}
							onValueChange={(value: boolean) => setOption('showInChat', value)}
						/>
						<TableSwitchRow
							label="Member list"
							value={s.showInMembers !== false}
							onValueChange={(value: boolean) =>
								setOption('showInMembers', value)
							}
						/>
						<TableSwitchRow
							label="Profiles"
							value={s.showInProfiles !== false}
							onValueChange={(value: boolean) =>
								setOption('showInProfiles', value)
							}
						/>
					</TableRowGroup>

					<TableRowGroup title="More">
						<TableRow
							label="Servers"
							subLabel={
								hiddenServers
									? `Staff tags hidden in ${hiddenServers} server${hiddenServers === 1 ? '' : 's'}`
									: 'Turn staff tags off in specific servers'
							}
							arrow
							onPress={() => navigation.navigate(SERVERS_ROUTE)}
						/>
						<TableRow
							label="Your own tags"
							subLabel={
								userTagCount
									? `${userTagCount} ${userTagCount === 1 ? 'person' : 'people'}`
									: 'Give a specific person a tag by their user ID'
							}
							arrow
							onPress={() => navigation.navigate(USER_TAGS_ROUTE)}
						/>
					</TableRowGroup>

					<Text color="text-muted" variant="text-sm/normal">
						Icons and gradients show on profiles and member lists. Tags on
						message rows are drawn by Discord's native code, which takes text
						and one colour, so there an icon appears as its plain character.
					</Text>
					<View style={{ alignItems: 'center', gap: 2, opacity: 0.8 }}>
						<Text color="text-muted" variant="text-sm/semibold">
							Made by bleelblep, Fiery and シグマ siguma
						</Text>
						<Text color="text-muted" variant="text-xxs/normal">
							Staff Tags+ fork by ketsuyumi · GPL-3.0
						</Text>
					</View>
				</Stack>
			</ScrollView>
		</Page>
	)
}
