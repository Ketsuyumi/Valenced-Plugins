import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { ScrollView } from 'react-native'
import { describe, findConfirm } from './alerts'
import type { PluginApi } from '@valenced/plugins/types'
import type { SeenAlert } from './alerts'

interface Settings {
	/** Dialogs seen so far, newest first. */
	seen: SeenAlert[]
	/** Ids of dialogs to skip. */
	skip: string[]
}

type Api = PluginApi<{ jsonStorage: Settings }>

const DEFAULTS: Settings = { seen: [], skip: [] }
const MAX_SEEN = 60

function SettingsPage({ api }: { api: Api }) {
	const { Stack, Text, TableRowGroup, TableSwitchRow, TableRow } = Design
	const settings = { ...DEFAULTS, ...api.jsonStorage.use() }

	const setSkip = (id: string, on: boolean) =>
		api.jsonStorage.set(
			{
				...settings,
				skip: on
					? [...new Set([...settings.skip, id])]
					: settings.skip.filter(s => s !== id),
			},
			true,
		)

	return (
		<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
			<Stack spacing={24}>
				<Text variant="text-sm/medium" color="text-muted">
					Every confirmation dialog you see is listed here. Turn on Skip and
					next time the plugin presses its confirm button for you, without
					showing it. Nothing is skipped until you turn it on.
				</Text>
				{settings.seen.length ? (
					<TableRowGroup title="Confirmations">
						{settings.seen.map(alert =>
							alert.confirmText !== null ? (
								<TableSwitchRow
									key={alert.id}
									label={alert.title}
									subLabel={`Presses "${alert.confirmText}"`}
									value={settings.skip.includes(alert.id)}
									onValueChange={(on: boolean) => setSkip(alert.id, on)}
								/>
							) : (
								<TableRow
									key={alert.id}
									label={alert.title}
									subLabel={`Can't be skipped yet (no confirm button found). Shape: ${alert.shape}`}
								/>
							),
						)}
					</TableRowGroup>
				) : (
					<Text variant="text-md/medium" color="text-muted">
						No confirmations seen yet. Do something that asks for confirmation
						(for example delete a message), cancel it, then come back.
					</Text>
				)}
				{settings.seen.length ? (
					<TableRowGroup>
						<TableRow
							label="Clear the list"
							subLabel="Also turns every Skip off"
							onPress={() => api.jsonStorage.set(DEFAULTS, true)}
						/>
					</TableRowGroup>
				) : null}
			</Stack>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage, logger }) {
		const settings = () => ({ ...DEFAULTS, ...jsonStorage.cache })

		/** Elements already handled, so a call passing through two patched objects counts once. */
		const handled = new WeakSet<object>()

		const hook = (args: any[], original: (...a: any[]) => any) => {
			const [key, element] = args
			if (!element || typeof element !== 'object' || handled.has(element))
				return original(...args)
			handled.add(element)

			let seen: SeenAlert | null = null
			try {
				seen = describe(String(key ?? ''), element)
			} catch (e) {
				logger.warn(`Couldn't read an alert: ${String(e)}`)
			}
			if (!seen) return original(...args)

			const s = settings()
			// Remember it (newest first); saving doesn't hold up the dialog.
			const rest = s.seen.filter(a => a.id !== seen!.id)
			jsonStorage.set({ ...s, seen: [seen, ...rest].slice(0, MAX_SEEN) }, true)

			if (s.skip.includes(seen.id)) {
				const confirm = findConfirm(element)
				if (confirm) {
					try {
						confirm.run()
						return undefined
					} catch (e) {
						logger.warn(
							`Skipping "${seen.title}" failed, showing it instead: ${String(e)}`,
						)
					}
				}
			}
			return original(...args)
		}

		// Only runs when Discord is about to show an alert, so it costs nothing otherwise.
		// Patched on Valenced's binding and on every module exporting openAlert.
		const patched = new WeakSet<object>()
		const patch = (target: any) => {
			if (
				!target ||
				typeof target.openAlert !== 'function' ||
				patched.has(target)
			)
				return
			try {
				cleanup(instead(target, 'openAlert', hook as never))
				patched.add(target)
			} catch {
				// Read-only re-export; the source module is patched instead.
			}
		}
		patch(AlertActionCreators)
		cleanup(
			getModules(
				withProps('openAlert', 'dismissAlert'),
				module => patch(module),
				{ max: 5 },
			),
		)
		logger.log('Watching confirmation dialogs')
	},
	SettingsComponent: SettingsPage,
})
