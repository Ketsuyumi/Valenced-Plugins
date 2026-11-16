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

When you paste an ID, the page shows that person's profile picture and name before you block. Everyone you block here
goes on **your block list**, which is shared by every account on the device. Each row's button shows the account you
are on right now: **Unblock** if they're blocked on it; otherwise **✕** (take them off the list), **Ignore** (Discord's
Ignore: hide their messages and mute notifications without blocking; becomes **Unignore**) and **Block**. So after switching accounts you can block the same people with one tap each. Unblocking only affects the current
account and keeps them on the list.

**Block automatically on every account** (off by default) does it for you: whenever an account connects, anyone on the
list it hasn't blocked yet is blocked, one at a time and spaced out for Discord's rate limit. Each person is checked
once per account, so a later manual unblock is respected; friends and your own signed-in accounts are never blocked.

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
- **Still previews** (on by default): the grids load the first frame of GIFs, animated stickers and animated emoji
  instead of the animation, which downloads less and loads faster. If a still version fails to load, that tile falls
  back to the original.

All four grids start loading as soon as the screen opens and are kept in memory until Discord restarts, so switching
tabs or reopening the screen never reloads them. Pull down on a grid to reload it. Each change can be turned off in the
plugin's settings. It works by adjusting the tab list passed to Discord's `useSegmentedControlState` hook, and by
dropping the `RowButton` that `useMemberListAction` creates; `tools/dm-inspector` is the debug plugin used to find
those.

### Hide Server Banners (`dev.ketsuyumi.hide-server-banners`)

Hides the banner image at the top of a server's channel list, so every server uses the compact header. It patches
`GuildStore` so servers are handed out without their `banner` field (using the record's own `set`, so nothing else
about the server changes). Turn the plugin off to bring banners back straight away.

### Skip Confirmations (`dev.ketsuyumi.skip-confirmations`)

Skip the confirmation dialogs you choose: deleting messages, embeds or attachments, leaving group DMs, ignoring
users and any other confirmation Discord shows as an alert. Every confirmation you see is added to a list in the
plugin's settings with its title and confirm button; turn **Skip** on for the ones you want, and next time the plugin
presses that button for you instead of showing the dialog. Nothing is skipped until you turn it on, and if a skip
fails the dialog is shown as usual.

It also covers dialogs that have no confirm button to press: leaving a server, removing a friend or cancelling a
friend request, and the Block and Ignore action sheets. For those, skipping does the action through Discord's API
(an error toast shows if it fails).

It hooks only Discord's `openAlert` and `openLazy` (and only reacts to confirmation sheets there), so it does nothing
until a dialog is about to open, and its HTTP helper is found once at start rather than while a dialog opens.

### Instant Actions+ (`dev.ketsuyumi.instant-actions`)

A fork of [Instant Actions](https://github.com/k1ng0p/Valenced-Plugins-by-k1ng0p) by **k1ng_op** (GPL-3.0; this fork
is GPL-3.0 too). Skips "Are you sure?" prompts for deleting messages, embeds and attachments, masked links, channels,
leaving servers and groups, roles, unfriending, blocking, ignoring, cancelling friend requests, voice calls and
pins, each with its own switch. Same features and settings as the original.

Changed in this fork: the original looked translated dialog titles up by scanning every Discord module while a
dialog was opening, which made Discord hitch for up to ~100 ms. Here the translation modules are found once, every
title is resolved in a warm-up shortly after start, template patterns are compiled once, and the HTTP helper is
fetched up front. Switch the original off if you install this one.

### Read All Servers+ (`dev.ketsuyumi.read-all`)

A fork of [Read All Servers](https://github.com/aeongdesu/slimplugins) by **sapphire** (GPL-3.0; this fork is GPL-3.0
too). Long press the Messages icon at the top of the server list to mark every unread server as read.

Changed in this fork: the original intercepted every element Discord creates (`before jsx`/`jsxs`, ~240,000 calls in
four minutes) to find the Messages icon. This one patches `GuildsBarAnimatedItemWrapper` directly, so it only runs
when that component renders. Switch the original off if you install this one.

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
