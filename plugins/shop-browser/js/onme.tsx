import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { Image, View } from 'react-native'
import type { Product } from './shop'

/**
 * The item on you: your own avatar and name, drawn here (not by Discord), so it works without
 * Discord's item sheet. A nameplate behind your name row, a decoration around your avatar, a frame
 * or effect over a small profile card of yours.
 */

function me(): { name: string; avatar: string } {
	const u: any = (Stores as any).UserStore?.getCurrentUser?.()
	const id = String(u?.id ?? '0')
	let avatar = ''
	try {
		avatar = u?.getAvatarURL?.(undefined, 128, false) ?? ''
	} catch {}
	if (!avatar && u?.avatar)
		avatar = `https://cdn.discordapp.com/avatars/${id}/${u.avatar}.png?size=128`
	if (!avatar) {
		let n = 0
		try {
			n = Number((BigInt(id) >> 22n) % 6n)
		} catch {}
		avatar = `https://cdn.discordapp.com/embed/avatars/${n}.png`
	}
	return {
		name: u?.globalName ?? u?.global_name ?? u?.username ?? 'You',
		avatar,
	}
}

export function OnMe({ p, text }: { p: Product; text: string }) {
	const { Text } = Design as any
	const { name, avatar } = me()
	const img = p.image ? { uri: p.image } : undefined
	if (p.type === 2)
		// Nameplate: a member-list row with it behind.
		return (
			<View
				style={{
					height: 56,
					borderRadius: 10,
					overflow: 'hidden',
					backgroundColor: 'rgba(0,0,0,0.35)',
					justifyContent: 'center',
				}}
			>
				{img ? (
					<Image
						source={img}
						resizeMode="cover"
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							right: 0,
							bottom: 0,
						}}
					/>
				) : null}
				<View
					style={{
						flexDirection: 'row',
						alignItems: 'center',
						paddingHorizontal: 10,
						gap: 10,
					}}
				>
					<Image
						source={{ uri: avatar }}
						style={{ width: 36, height: 36, borderRadius: 18 }}
					/>
					<Text
						variant="text-md/semibold"
						style={{ color: text }}
						numberOfLines={1}
					>
						{name}
					</Text>
				</View>
			</View>
		)
	if (p.type === 0)
		// Decoration: around your avatar.
		return (
			<View style={{ alignItems: 'center', paddingVertical: 8 }}>
				<View
					style={{
						width: 120,
						height: 120,
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<Image
						source={{ uri: avatar }}
						style={{ width: 96, height: 96, borderRadius: 48 }}
					/>
					{img ? (
						<Image
							source={img}
							resizeMode="contain"
							style={{ position: 'absolute', width: 120, height: 120 }}
						/>
					) : null}
				</View>
				<Text variant="text-md/bold" style={{ color: text, marginTop: 4 }}>
					{name}
				</Text>
			</View>
		)
	// Frame, effect (and bundles): a small profile card of yours, the item over it.
	return (
		<View style={{ alignItems: 'center' }}>
			<View
				style={{
					width: 200,
					height: 260,
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<View
					style={{
						width: 170,
						height: 230,
						borderRadius: 14,
						overflow: 'hidden',
						backgroundColor: 'rgba(0,0,0,0.45)',
					}}
				>
					<View
						style={{ height: 62, backgroundColor: 'rgba(127,127,127,0.35)' }}
					/>
					<Image
						source={{ uri: avatar }}
						style={{
							width: 64,
							height: 64,
							borderRadius: 32,
							marginTop: -32,
							marginLeft: 12,
							borderWidth: 4,
							borderColor: 'rgba(0,0,0,0.45)',
						}}
					/>
					<Text
						variant="text-md/bold"
						style={{ color: text, marginLeft: 14, marginTop: 6 }}
						numberOfLines={1}
					>
						{name}
					</Text>
					<View
						style={{
							height: 8,
							width: 90,
							borderRadius: 4,
							marginLeft: 14,
							marginTop: 10,
							backgroundColor: 'rgba(127,127,127,0.35)',
						}}
					/>
					<View
						style={{
							height: 8,
							width: 120,
							borderRadius: 4,
							marginLeft: 14,
							marginTop: 8,
							backgroundColor: 'rgba(127,127,127,0.25)',
						}}
					/>
				</View>
				{img ? (
					p.type === 1 ? (
						// An effect plays over the whole card, edge to edge.
						<Image
							source={img}
							resizeMode="cover"
							style={{
								position: 'absolute',
								width: 170,
								height: 230,
								borderRadius: 14,
							}}
						/>
					) : (
						// A frame wraps around the card, a little bigger than it.
						<Image
							source={img}
							resizeMode="contain"
							style={{ position: 'absolute', width: 200, height: 260 }}
						/>
					)
				) : null}
			</View>
		</View>
	)
}
