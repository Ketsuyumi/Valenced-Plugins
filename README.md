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

### Smaller Media (`dev.ketsuyumi.smaller-media`)

Makes images, GIFs and videos in chat 30 to 50% smaller (35% by default), whoever sent them. Only the preview in chat
changes: tapping still opens the full-size image, and videos and GIFs still play. Uploads and link/GIF-picker previews
have separate switches.

A list of servers, channels and DMs can either be left at full size ("Don't shrink in the places below") or be the
only places that are shrunk ("Only shrink in the places below"). Places are added from the server and channel or DM
you last had open, or by ID.

It works on the descriptor Discord builds for each chat row (`RowManager.generate`): the `width` and `height` of media
under the row's `message.attachments` and `message.embeds` are scaled by the same factor, on copies, with the URLs left
alone. The settings page shows whether the row generator was found and how many items were resized, and has a
"Copy debug info" row that lists the fields it saw.

Uploads are drawn in Discord's image grid, which fills the message's width whatever size the images say they are, and
the grid is the only way uploads are drawn (switching it off makes them disappear). So for a message with uploads the
plugin leaves the grid on and scales the width it fills, the row's `constrainedWidth`.

### Multi Select (`dev.ketsuyumi.multi-select`)

Select several messages and delete them at once, like on WhatsApp. Tap the **✓** toggle in the chat bar (left or right
of the input, or hidden) or in a chat's top bar, or long-press a message and choose **Select messages**: a bar appears at the top of the screen with the count, **⋮**
(Delete N, Clear selection) and **✕** to stop. While selecting, tap messages to add or remove them (long-press works
too); each one is highlighted. The top-bar button and tap-to-select can each be turned off in settings. "Double-tap to select" (off by
default) lets double-tap add and remove too. Your own messages can always be deleted; other people's only where you
have Manage Messages. Messages are deleted one at a time through Discord's own action, a third of a second apart.

A selection can span channels: switch to another channel or DM and keep long-pressing; the bar shows the total and how
many channels it covers, and Delete removes them all. Each message's author is kept when it is selected, so it can still
be checked after you leave that channel.

The bar is drawn beside Discord's toast container (`AppToastContainer`), which floats over every screen. A message with
no text shows its highlight the next time its row is redrawn (scroll it off and back).

### Spectators (`dev.ketsuyumi.spectators`)

See who is watching a stream, like on PC: your own stream and the streams you are watching, with avatars, on the
plugin's page. While you stream there are short notices when someone starts or stops watching, and an Android
notification with the count and names ("3 watching your stream"), so you can see it outside Discord too. Both can be
switched off.

The viewers come from Discord's `ApplicationStreamingStore` (`getViewerIds`); Discord only has them for streams you are
streaming or watching. The native part only posts and removes the notification, on a quiet channel (no sound or
vibration).

## Themes

Pick these under **Settings > Valenced > Themes > Colors** after installing the plugin from **Manage theme plugins**
(needs Discord 352.2 or later).

### Aubrey (`dev.ketsuyumi.theme.aubrey`)

A cute, simple OMORI theme inspired by Aubrey: soft plum surfaces from her hair, bow-pink buttons, toggles and reactions,
and mint links and mentions from her dress. Text stays near-white on plum (about 13:1 contrast), so chat is as readable
as Discord's own dark theme. Works on every base (Ash, Dark, Onyx and a pastel Light).

- **Aubrey**: just the colours.
- **Aubrey (Background)**: the same colours over OMORI artwork, kept small and sharp in the middle of the screen and dimmed so text stays readable. The
  Background screen (settings icon on the Colors page) changes opacity, blur and dimming, or swaps in your own image.

### Ame-chan (`dev.ketsuyumi.theme.ame`)

A cute, simple NEEDY STREAMER OVERLOAD theme inspired by Ame-chan: soft plum surfaces, cherry-red buttons and toggles
from her vest, and gold links and mentions from her heart charm and hairpin. Online stays green so it never looks like
an error. Text stays near-white on plum (about 13:1 contrast). Works on every base, including a light version.

- **Ame-chan**: just the colours.
- **Ame-chan (Background)**: the same colours with Ame-chan in the bottom-right corner, sharp and at full resolution,
  fading into the purple above so the top of the chat stays clear.

Both themes recolour every Discord colour with the theme engine from dxckie's themes (GPL-3.0), so nothing is left default grey.

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
