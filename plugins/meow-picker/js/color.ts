import { Tokens } from '@valenced/discord/common/tokens'
import { Stores } from '@valenced/discord/flux'

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
