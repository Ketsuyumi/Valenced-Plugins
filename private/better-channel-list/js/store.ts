export interface Settings {
	/** 채널 이름 아래에 마지막 메시지 */
	lastMessage: boolean
	/** 보낸 사람 이름을 역할 색으로 */
	roleColor: boolean
	/** 표시 이름 스타일 (글꼴, 색) */
	nameStyle: boolean
	/** 그라데이션 이름을 진짜 그라데이션으로 */
	realGradient: boolean
	/** 예전 버전에서 켜진 realGradient 를 한 번 끄기 위한 표시 */
	gradientReset?: boolean
	/** 1.0.12 에서 realGradient 를 한 번 다시 켜기 위한 표시 */
	splitReset?: boolean
	/** 보낸 사람 이름 보이기 */
	showAuthor: boolean
	/** 채널 아이콘을 이모지 칸으로 (원래 플러그인의 Redesign) */
	redesign: boolean
	/** 디스코드가 정한 이모지가 없으면 채널 이름으로 고르기 */
	autoEmoji: boolean
	/** 채널 이름 속 이모지 빼기 (이모지 칸에 보이니까) */
	stripNameEmoji?: boolean
	/** 이모지 칸 크기 */
	iconSize: 'medium' | 'small' | 'tiny'
	/** 직접 바꾼 채널 이모지 (채널 ID → 이모지) */
	icons: Record<string, string>
	/** 서버 이모지 바탕색 (이모지 ID → 색) */
	colors?: Record<string, string>
	/** Which channels get a preview. Better Channel List+: 'unreads' shows it only on unread channels. */
	mode: 'all' | 'unreads' | 'default'
	/** Better Channel List+: how long ago the last message was sent, after the author's name. */
	showTime?: boolean
	/** Better Channel List+: no preview under muted channels. */
	hideMuted?: boolean
}
export const DEFAULTS: Settings = {
	lastMessage: true,
	roleColor: true,
	nameStyle: true,
	realGradient: true,
	showAuthor: true,
	mode: 'all',
	redesign: true,
	autoEmoji: true,
	iconSize: 'medium',
	icons: {},
	showTime: false,
	hideMuted: false,
}

let storage: any
/**
 * The merged settings, built once per change. The original spread DEFAULTS over the stored object
 * on every call, and settings() is read several times for every channel row.
 */
let snapshot: Settings | undefined
let snapshotSource: unknown
let version = 0
const invalidate = () => {
	snapshot = undefined
	version++
}
let unsubscribe: (() => void) | undefined
export const bind = (s: any) => {
	try {
		unsubscribe?.()
	} catch {}
	storage = s
	invalidate()
	try {
		const off = s?.subscribe?.(invalidate)
		unsubscribe = typeof off === 'function' ? off : undefined
	} catch {
		unsubscribe = undefined
	}
}
export const unbind = () => bind(undefined)
export const settings = (): Settings => {
	const source = storage?.cache
	// The cache object is replaced when the storage loads or is written; rebuild then too.
	if (!snapshot || source !== snapshotSource) {
		snapshotSource = source
		snapshot = { ...DEFAULTS, ...(source ?? {}) }
		version++
	}
	return snapshot as Settings
}
/** Changes whenever the settings do. Cached previews are keyed on it. */
export const settingsVersion = () => {
	settings()
	return version
}
export function useSettings(): Settings {
	storage?.use?.()
	return settings()
}
/**
 * 저장. 저장 파일을 아직 안 읽었는데 통째로 덮어쓰면 바꾼 이모지 같은 것이 지워지므로,
 * 읽은 뒤에만 통째로 쓰고, 아니면 먼저 읽고 나서 쓴다.
 */
export async function update(patch: Partial<Settings>) {
	if (!storage) return
	if (!storage.cache) {
		try {
			await storage.get?.()
		} catch {}
	}
	const result = storage.set({ ...settings(), ...patch }, true)
	invalidate()
	Promise.resolve(result).then(invalidate, invalidate)
	return result
}
