import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { Pressable, View } from 'react-native'

/** The theme's main text colour (some colour names don't exist on every version and fall back to black). */
export function textColor(): string {
	try {
		const T = (Tokens as any).default
		const theme = (Stores as any).ThemeStore?.theme
		for (const name of [
			'TEXT_DEFAULT',
			'TEXT_NORMAL',
			'HEADER_PRIMARY',
			'TEXT_PRIMARY',
		]) {
			const token = T?.colors?.[name]
			if (!token) continue
			const value = T.internal.resolveSemanticColor(theme, token)
			if (typeof value === 'string' && value) return value
		}
		return theme === 'light' ? '#060607' : '#f2f3f5'
	} catch {
		return '#f2f3f5'
	}
}

export const ACCENT = '#5865F2'

export function Chip({
	label,
	on,
	onPress,
	color,
	badge,
}: {
	label: string
	on: boolean
	onPress: () => void
	color?: string
	/** Unread conversations in this tab. */
	badge?: number
}) {
	const { Text } = Design as any
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityState={{ selected: on }}
			style={{
				paddingHorizontal: 11,
				paddingVertical: 5,
				borderRadius: 14,
				flexDirection: 'row',
				alignItems: 'center',
				marginRight: 6,
				backgroundColor: on ? (color ?? ACCENT) : 'rgba(127,127,127,0.18)',
			}}
		>
			<Text
				variant="text-xs/semibold"
				style={{ color: on ? '#ffffff' : textColor() }}
			>
				{label}
			</Text>
			{badge ? (
				<View
					style={{
						marginLeft: 5,
						minWidth: 16,
						height: 16,
						paddingHorizontal: 4,
						borderRadius: 8,
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: '#F23F42',
					}}
				>
					<Text
						variant="text-xxs/bold"
						style={{ color: '#ffffff', fontSize: 10, lineHeight: 12 }}
					>
						{badge > 99 ? '99+' : String(badge)}
					</Text>
				</View>
			) : null}
		</Pressable>
	)
}
