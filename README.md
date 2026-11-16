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

### Quick Access (`dev.ketsuyumi.quick-reload`)

Formerly Quick Reload (the ID is unchanged, so existing installs update in place). Shortcut buttons next to the bell
on the bar with your name, each with its own switch in the plugin's settings:

- **Reload** (on by default): restarts Discord's JavaScript (`BundleUpdaterManager.reload()`), like the reload in older
  clients; it also applies waiting plugin updates. There is a "Reload Discord" row at the top of Discord's settings too.
- **Friends** (off by default): opens your Friends list.
- **Plugins** (off by default): opens Valenced's Plugins page.
- **Performance Monitor** (off by default): opens the page of dariussbezy's Performance Monitor plugin
  (`dariuss.performance-monitor`), which has to be installed and on.

The buttons are copies of the bell's own button, so they match the rest of the bar. Order: Performance Monitor,
Reload, Friends, Plugins, then the bell. Buttons that are switched off take no space, so the others close up.

**Hide the Favorites button** (off by default): takes the star that YouBar+ or Better You Bar adds off the bar, so
the Plugins button sits in its place. It works on what those plugins render, so it needs their button to be one of the
things rendered with the bell (the usual case).

### No Blackout (`dev.ketsuyumi.no-blackout`)

Stops the screen going black during calls when the proximity sensor is covered, for example when a finger moves
near the top of the screen. During calls Discord holds a proximity wake lock; this native plugin hooks
`PowerManager.newWakeLock` inside Discord only and turns proximity wake locks into partial ones, so the phone stays
awake for the call but the sensor never switches the screen off. Turn the plugin off to get the normal behaviour back.
Android only.

### Fake Nickname+ (`dev.ketsuyumi.fake-nickname`)

A fork of [Fake Nickname](https://github.com/il1ll/ValencedPlugins) by **coder.gg** (GPL-3.0; this fork is GPL-3.0
too). Give anyone a nickname that only you see, without being friends: long-press a profile's menu, or add them by ID
in the settings. Same features and settings as the original.

Changed in this fork: the original's name hooks (`getMember`, `getGlobalName`, `getName` and others) ran tens of
thousands of times, each reading storage, trimming the saved name and creating a new function. Here the saved
nicknames become a lookup table once when they change, each hook is a single lookup that goes straight to Discord's
function for everyone without a fake nickname, and the hooks are only installed while at least one nickname is saved.
Nicknames are stored separately from the original plugin, so add them again after switching.

**Fast mode** (on by default, switch in the plugin's settings): instead of intercepting `getMember`, one of Discord's
most-called functions, the nickname is written into the member records of the server you are viewing and written again
when Discord refreshes a member. Real nicknames are put back when a fake one is removed or the plugin stops. If
Discord's member data is read-only, it falls back to the hook automatically.

### Staff Tags+ (`dev.ketsuyumi.staff-tags`)

A fork of [Staff Tags](https://github.com/bleelblep/bleel-bazinga-repo) by **bleelblep** (with Fiery and シグマ siguma;
GPL-3.0, this fork is GPL-3.0 too). Shows OWNER, ADMIN, STAFF, MOD, VC Mod, Chat Mod and WEBHOOK tags in chat, member
lists and profiles, with the original's per-tag editor (text, colour, gradient, icon).

New in this fork:

- **Compact mode**: just the icon when a tag has one, otherwise a short label (ADM, MOD, VC...).
- **Show tags in**: separate switches for chat, member list and profiles.
- **Servers**: turn staff tags off in specific servers, with search.
- **Your own tags**: give a specific person a tag (text and colour) by user ID. Only you see it; it shows in every
  server and in DMs.

Faster: the original worked out a member's permissions from all their roles again for every message row. Here each
person's tag is cached per server and channel and cleared when members, roles, channels, permissions or settings
change; settings are merged once per change, row colours are converted once per tag, Discord's own tags skip the
painter, and member/profile rows check the cached tag before walking the rendered tree. The original's changelog popup
is left out. Settings are separate from the original plugin, so turn the original off.

### Ghost Log+ (`dev.ketsuyumi.ghost-log`)

A fork of [Ghost Log Next Gen](https://github.com/bleelblep/bleel-bazinga-repo) by **bleelblep** (CC0-1.0 with parts
under BSD-3-Clause; see the plugin's `NOTICE.md`). An encrypted log of deleted messages, edit history and saved media,
with deleted messages kept visible in chat. The native half is unchanged.

New in this fork:

- **Ignore list**: servers, channels and people that are never logged, added by ID.
- **Keyword alerts**: a notice when a deleted message contains one of your words, even with catch toasts off.
- **Better search**: every word has to match, in any order; IDs match; `from:`, `in:` and `server:` filters.

Faster: opening a channel used to build a full message record for every logged deletion in it, then drop the ones
outside the loaded messages. With a few hundred logged deletions in one channel that froze Discord for hundreds of
milliseconds. Records are now built only for deletions inside the loaded window; older ones appear as you scroll back.

It has its own ID, so its log is separate from the original's. To move a log over: in the original, Backup &
encryption > set a recovery password > Export bundle; then in Ghost Log+, Backup & encryption > Import bundle. Turn the
original off afterwards: two message loggers at once fight over the same messages.

### Better Channel List+ (`dev.ketsuyumi.better-channel-list`)

A fork of [Better Channel List](https://github.com/Yumistra/Freestyle-Valenced) by **Yumistra** (GPL-3.0; this fork is
GPL-3.0 too). Shows the last message under each channel and gives channels emoji icons, with the original's settings
and per-channel emoji picker.

New in this fork:

- **Message age**: how long ago the last message was sent (5m, 3h, 2d) after the author's name.
- **Only unread channels**: channels you've read show no last message.
- **Skip muted channels**: no last message under channels you've muted.

Faster: the original rebuilt each channel's preview (text clean-up, name style, role colours, and searches through
Discord's modules) every time a row's height was measured, again when it was drawn and a third time inside the row.
Previews are now built once per message and cached per channel, module lookups are remembered, settings are merged once
per change, and the settings page no longer re-renders every second. Settings are separate from the original, so turn
the original off and re-pick any custom channel emojis.

### Smaller Media (`dev.ketsuyumi.smaller-media`)

Makes images, GIFs and videos in chat 30 to 50% smaller (35% by default), whoever sent them. Only the preview in chat
changes: tapping still opens the full-size image, and videos and GIFs still play. Uploads and link/GIF-picker previews
have separate switches.

It works on the descriptor Discord builds for each chat row (`RowManager.generate`): the `width` and `height` of media
under the row's `message.attachments` and `message.embeds` are scaled by the same factor, on copies, with the URLs left
alone. The settings page shows whether the row generator was found and how many items were resized, and has a
"Copy debug info" row that lists the fields it saw.

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
