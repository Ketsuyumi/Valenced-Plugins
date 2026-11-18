import { Design } from '@valenced/discord/design'
import { after } from '@valenced/patcher'
import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { findModule } from './find'
import { onSelectionChange, selection } from './selection'

/**
 * The bar shown at the top of the screen while selecting: the count, a ⋮ button for the options
 * and ✕ to stop. Drawn beside Discord's toast container (AppToastContainer's `default`, mounted
 * once over the whole app), the one place a plugin can float something over every screen; Ghost
 * Log and Mini Chat use the same spot.
 */

let mounted = false
/** Whether the bar can be shown; when not, long-press opens the options instead. */
export const barAvailable = () => mounted

interface BarActions {
	options: () => void
	cancel: () => void
}
let actions: BarActions | undefined

function SelectionBar() {
	const { Text } = Design as any
	const [, tick] = useState(0)
	useEffect(() => {
		mounted = true
		const off = onSelectionChange(() => tick(n => n + 1))
		return () => {
			off()
			mounted = false
		}
	}, [])
	if (!selection.active || !actions) return null
	const n = selection.ids.size
	const button = {
		minWidth: 40,
		height: 40,
		borderRadius: 20,
		alignItems: 'center' as const,
		justifyContent: 'center' as const,
		paddingHorizontal: 10,
	}
	return (
		<View
			pointerEvents="box-none"
			style={{
				position: 'absolute',
				top: 52,
				left: 12,
				right: 12,
				alignItems: 'center',
			}}
		>
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					gap: 4,
					paddingLeft: 16,
					paddingRight: 4,
					paddingVertical: 4,
					borderRadius: 24,
					backgroundColor: 'rgba(30, 31, 34, 0.96)',
					borderWidth: 1,
					borderColor: 'rgba(255, 255, 255, 0.08)',
					maxWidth: 480,
				}}
			>
				<Text
					variant="text-md/semibold"
					color="text-default"
					style={{ marginRight: 8 }}
				>
					{n} selected
				</Text>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Selection options"
					onPress={() => actions?.options()}
					style={button}
				>
					<Text variant="heading-lg/bold" color="text-default">
						⋮
					</Text>
				</Pressable>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Stop selecting"
					onPress={() => actions?.cancel()}
					style={button}
				>
					<Text variant="heading-md/bold" color="text-muted">
						✕
					</Text>
				</Pressable>
			</View>
		</View>
	)
}

export function installBar(next: BarActions): () => void {
	actions = next
	const unpatches: Array<() => void> = []
	const unfind = findModule(
		'modules/toast/native/AppToastContainer.tsx',
		['AppToastContainer'],
		(mod: any) => {
			if (typeof mod?.default !== 'function') return
			unpatches.push(
				after(mod, 'default', ((rendered: any) => (
					<>
						{rendered}
						<SelectionBar />
					</>
				)) as never),
			)
		},
	)
	return () => {
		unfind()
		for (const unpatch of unpatches.splice(0))
			try {
				unpatch()
			} catch {}
		actions = undefined
		mounted = false
	}
}
