import { Stores } from '@valenced/discord/flux'

/** Discord's relationship types. */
export const KIND: Record<number, string> = {
	1: 'friend',
	2: 'blocked',
	3: 'incoming request',
	4: 'outgoing request',
}

const HEADING: Record<string, string> = {
	friend: 'Friends',
	blocked: 'Blocked',
	'incoming request': 'Incoming requests',
	'outgoing request': 'Outgoing requests',
}

export interface Person {
	id: string
	username: string
	displayName: string
	nickname: string
	kind: string
	since: string
}

export type Format = 'text' | 'csv' | 'json'
export type Scope = 'friends' | 'all'

const S = () => Stores as any

/** Every relationship as [userId, type], whatever shape this Discord version stores them in. */
function relationships(): [string, number][] {
	const store = S().RelationshipStore
	const out: [string, number][] = []
	const add = (id: unknown, value: any) => {
		const type = typeof value === 'number' ? value : Number(value?.type)
		if (id && type) out.push([String(id), type])
	}
	const mutable = store?.getMutableRelationships?.()
	if (mutable instanceof Map) for (const [id, v] of mutable) add(id, v)
	else {
		const plain = store?.getRelationships?.() ?? mutable ?? {}
		if (plain instanceof Map) for (const [id, v] of plain) add(id, v)
		else for (const [id, v] of Object.entries(plain)) add(id, v)
	}
	return out
}

export function collect(scope: Scope): Person[] {
	const store = S().RelationshipStore
	const users = S().UserStore
	return relationships()
		.filter(([, type]) => (scope === 'friends' ? type === 1 : type in KIND))
		.map(([id, type]) => {
			const user = users?.getUser?.(id)
			const since = store?.getSince?.(id)
			return {
				id,
				username: String(user?.username ?? ''),
				displayName: String(user?.globalName ?? user?.global_name ?? ''),
				nickname: String(store?.getNickname?.(id) ?? ''),
				kind: KIND[type],
				since: since ? new Date(since).toISOString().slice(0, 10) : '',
			}
		})
		.sort(
			(a, b) =>
				a.kind.localeCompare(b.kind) ||
				(a.displayName || a.username).localeCompare(b.displayName || b.username),
		)
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

export function render(people: Person[], format: Format, scope: Scope): string {
	if (format === 'json') return JSON.stringify(people, null, 2)
	if (format === 'csv') {
		const cols: (keyof Person)[] = ['id', 'username', 'displayName', 'nickname', 'kind', 'since']
		return [cols.join(','), ...people.map(p => cols.map(c => csvCell(p[c])).join(','))].join('\n')
	}
	const line = (p: Person) => {
		const name = p.displayName && p.displayName !== p.username ? `${p.displayName} (@${p.username})` : `@${p.username || p.id}`
		const extra = [p.nickname && `nickname: ${p.nickname}`, p.since && `since ${p.since}`, `ID ${p.id}`]
			.filter(Boolean)
			.join(' · ')
		return `${name} — ${extra}`
	}
	if (scope === 'friends') return people.map(line).join('\n')
	const groups = new Map<string, Person[]>()
	for (const p of people) groups.set(p.kind, [...(groups.get(p.kind) ?? []), p])
	return [...groups]
		.map(([kind, list]) => `${HEADING[kind] ?? kind} (${list.length}):\n${list.map(line).join('\n')}`)
		.join('\n\n')
}

export function counts(): Record<string, number> {
	const out: Record<string, number> = {}
	for (const [, type] of relationships()) if (KIND[type]) out[KIND[type]] = (out[KIND[type]] ?? 0) + 1
	return out
}

export const fileName = (format: Format) =>
	`discord-friends-${new Date().toISOString().slice(0, 10)}.${format === 'text' ? 'txt' : format}`
