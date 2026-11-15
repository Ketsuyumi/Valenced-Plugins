# Valenced-Plugins

Plugins for [Valenced](https://valenced.app), built on the official
[Valenced plugin template](https://github.com/Valenced/valenced-plugin-template).

## Plugins

### Block by ID (`dev.ketsuyumi.block-by-id`)

Block any Discord user by their user ID, even when you share no server or DM with them.

1. In Discord, turn on **Developer Mode** (Settings > Advanced), then long-press a user and **Copy User ID**.
   Someone can also send you their ID.
2. Open **Settings > Valenced > Plugins > Block by ID**.
3. Paste the ID (a plain ID or a `<@123…>` mention both work) and tap **Block**, then confirm.

When you paste an ID, the page shows that person's profile picture and name before you block. Users blocked from this page are
listed underneath with their picture, name and an **Unblock** button.

How it blocks: it calls Discord's own relationship action (`addRelationship` with type `2`, *blocked*), the same
code path the app uses when you block from a profile. If a Discord update moves that module, it falls back to
Discord's built-in HTTP client and sends `PUT /users/@me/relationships/{id}` with `{ "type": 2 }`. The plugin never
reads your token: Discord's HTTP client adds authentication itself.

### Ignore Apps (`dev.ketsuyumi.ignore-apps`)

Hide messages from apps and bots, such as MEE6, whose profiles have no Block or Ignore option.

1. In Discord, turn on **Developer Mode**, long-press the app and **Copy User ID**.
2. Open **Settings > Valenced > Plugins > Ignore Apps**, paste the ID and tap **Ignore**.

Options:

- **Hide all apps**: hide every bot, not just the listed ones.
- **Keep replies to my commands** (on by default): still show an app's answer to a slash command you ran.

Messages are filtered as Discord receives them (new messages, edits, channel history, mentions and pins), so it only
affects your device. Messages already on screen stay until you reopen the channel.

### Hide DMs (`dev.ketsuyumi.hide-dms`)

Hide chosen DMs and group DMs from your DM list, without leaving them.

Open **Settings > Valenced > Plugins > Hide DMs**. Every conversation is listed with its picture and a switch to hide
it, plus a search box. **Hide all DMs** and **Hide all group DMs** hide every conversation of that kind.

It filters the lists Discord's DM screen reads from (`PrivateChannelSortStore` and `ChannelStore`), so it is purely
visual and only on this device: you still receive messages and notifications, and turning a switch off shows the
conversation again straight away.

### DM Details+ (`dev.ketsuyumi.dm-details-plus`)

Changes the details screen of DMs (tap the name at the top of a DM):

- Hides the **New Group** button and the **Members** tab in one-to-one DMs.
- Hides the **Files** tab in DMs and group DMs.
- Shows **Pins** and **Links** as 3-column grids like Media (tap a pin to read it, tap a link to open it).
- Adds a **Stickers** tab (from Discord's `has: sticker` search) and an **Emoji** tab (custom emoji found by scanning
  the conversation, starting instantly from messages Discord already has loaded).

All four grids start loading as soon as the screen opens and are kept in memory until Discord restarts, so switching
tabs or reopening the screen never reloads them. Pull down on a grid to reload it. Each change can be turned off in the
plugin's settings. It works by adjusting the tab list passed to Discord's `useSegmentedControlState` hook, and by
dropping the `RowButton` that `useMemberListAction` creates; `tools/dm-inspector` is the debug plugin used to find
those.

## Building

Requires [Bun](https://bun.com) or Node.js 22.18+.

```sh
bun install
bun run build            # bundle JS into plugins/<name>/build/js/index.js
bun run lint             # Biome
bun run lint:types       # TypeScript
./gradlew packageAllPlugins   # installable ZIPs in build/dist/ (needs JDK 25)
```

Install a ZIP from **Settings > Valenced > Plugins**, tap the gear, then **Install from file**. New plugins install
disabled, so enable it from its card afterwards.

To publish a repository that users can add in the app, see
[Publishing your plugin](https://valenced.app/docs/plugin-development/getting-started/publishing-your-plugin):
bump `version` in a plugin's `manifest.json` and the `release` workflow builds it and publishes it to the `gh-pages`
branch.
