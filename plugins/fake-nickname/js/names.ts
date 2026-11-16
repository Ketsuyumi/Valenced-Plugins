import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
import { fastNickname, nicknameCount, onLookupChange, store } from './state'

type Cleanup = (fn: () => void) => void
type Fn = (...args: any[]) => any
type Hook = (this: unknown, args: any[], original: Fn) => any

const USER_UTILS_PATH = 'utils/UserUtils.tsx'
const USER_NAME_METHODS = ['getName', 'getGlobalName', 'getFormattedName']

const members = new WeakMap<object, { nick: string; copy: object }>()

function withNick(member: any, nick: string) {
	if (!member || typeof member !== 'object') return member
	const known = members.get(member)
	if (known?.nick === nick) return known.copy
	const copy = Object.assign(
		Object.create(Object.getPrototypeOf(member)),
		member,
		{ nick },
	)
	members.set(member, { nick, copy })
	return copy
}

// Hooks are plain functions created once. Each call does one Map lookup and, for users
// without a fake nickname (almost every call), goes straight to Discord's function:
// no closure, no member copy, no storage read.

const byFirstArg: Hook = function (args, original) {
	const nick = fastNickname(args[0])
	return nick === undefined ? original.apply(this, args) : nick
}

const bySecondArg: Hook = function (args, original) {
	const nick = fastNickname(args[1])
	return nick === undefined ? original.apply(this, args) : nick
}

const byUser: Hook = function (args, original) {
	const user = args[0]
	const nick = fastNickname(typeof user === 'string' ? user : user?.id)
	return nick === undefined ? original.apply(this, args) : nick
}

const memberHook: Hook = function (args, original) {
	const nick = fastNickname(args[1])
	const member = original.apply(this, args)
	return nick === undefined ? member : withNick(member, nick)
}

let userUtils: any[] = []
let unpatches: (() => void)[] | undefined

function patch(target: any, method: string, hook: Hook) {
	if (!unpatches || typeof target?.[method] !== 'function') return
	try {
		unpatches.push(instead(target, method, hook))
	} catch {}
}

function patchUserUtils() {
	for (const target of userUtils)
		for (const method of USER_NAME_METHODS) patch(target, method, byUser)
}

function install() {
	if (unpatches) return
	unpatches = []
	patch(store('RelationshipStore'), 'getNickname', byFirstArg)
	const guildMembers = store('GuildMemberStore')
	patch(guildMembers, 'getNick', bySecondArg)
	patch(guildMembers, 'getMember', memberHook)
	patchUserUtils()
}

function uninstall() {
	const list = unpatches
	unpatches = undefined
	if (list) for (const unpatch of list) unpatch()
}

/** Hooks exist only while at least one fake nickname is saved. */
function sync() {
	if (nicknameCount() > 0) install()
	else uninstall()
}

export function patchNames(cleanup: Cleanup) {
	cleanup(
		getModuleWithImportedPath<any>(USER_UTILS_PATH, module => {
			const targets = new Set<any>([module])
			if (module?.default && typeof module.default === 'object')
				targets.add(module.default)
			userUtils = [...targets]
			if (unpatches) patchUserUtils()
		}),
	)
	cleanup(onLookupChange(sync))
	cleanup(() => {
		uninstall()
		userUtils = []
	})
	sync()
}
