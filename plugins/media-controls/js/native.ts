import { callNativeMethod } from '@valenced/modules/native'

/** What the native part reports (see src/main/kotlin/.../MediaControls.kt). */
export interface NativeState {
	/** False until Media Bridge has sent anything to this Discord. */
	heard: boolean
	/** Milliseconds since the last hello, or -1 if none was sent yet. */
	sinceHello?: number
	discordPackage?: string | null
	protocol?: number
	access?: boolean
	active?: boolean
	app?: string | null
	package?: string | null
	title?: string | null
	artist?: string | null
	album?: string | null
	playing?: boolean
	position?: number
	duration?: number
	canSeek?: boolean
	canShuffle?: boolean
	canRepeat?: boolean
	shuffle?: boolean
	repeat?: 'off' | 'all' | 'one'
	trackKey?: string | null
	artVersion?: number
	artUrl?: string | null
	age?: number
}

const call = callNativeMethod as unknown as (
	method: string,
	args: unknown[],
) => Promise<any>

export const native = {
	state: (): Promise<NativeState> => call('mediaControls.state', []),
	art: (): Promise<string | null> => call('mediaControls.art', []),
	playing: (): Promise<boolean> => call('mediaControls.playing', []),
	press: (key: 'playPause' | 'next' | 'previous'): Promise<boolean> =>
		call('mediaControls.press', [key]),
	command: (name: string, position = 0): Promise<boolean> =>
		call('mediaControls.command', [name, position]),
}
