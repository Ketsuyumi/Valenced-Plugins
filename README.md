# Valenced-Plugins

Plugins for [Valenced](https://valenced.app), built on the official
[Valenced plugin template](https://github.com/Valenced/valenced-plugin-template).

## Plugins

### Better DMs (`dev.ketsuyumi.better-dms`)

Make DMs easier to tell apart. Long-press a DM and choose **DM options** (or pick it in the plugin's settings) to give it a
colour, label, emoji, pin, **careful** mode or a private nickname. Every feature has its own switch in settings.

- **DM list**: tabs above your DMs (All, or DMs and a separate **Groups** tab, plus Unread, Friends, Pinned and one tab
  per label); pinned DMs stay on top.
- **On each row**, as coloured text inside the message preview (so the row's layout never changes): colour dot, label,
  emoji, 👥 member count for group DMs, the mention count in your unread colour, not-a-friend and 🤖 bot markers, mutual
  servers and your note; DMs unused for a chosen time are faded. Optionally on a second line, with how long ago.
- **In a DM**: a "To: name" banner above the message box in its colour, "Send to …?" before each message in careful
  chats (if you don't send, the text is copied back), and private nicknames shown wherever Discord shows friend
  nicknames.

Pins and tabs filter the same list Hide DMs does; the row hints hook `ChannelRowPreview` like Chat Lock; the long-press
row follows Yumistra's Better Channel List (GPL-3.0).

The emoji badge can be a server emoji too, animated ones included and with no Nitro needed (the badge is only drawn
for you): search your servers' emoji in the DM options, or paste `<:name:id>`, `<a:name:id>` or an emoji link.

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

### Bulk Mute (`dev.ketsuyumi.bulk-mute`)

Mute lots of channels at once, like selecting messages on WhatsApp. Tap the bell next to a server's search bar (or
long-press the server and choose **Mute channels**), tap channels to tick them, then **Mute** mutes them all forever.
**All** ticks every channel that isn't muted yet, **Unmute** undoes it, ✕ stops selecting.

Muting goes through Discord's own channel-settings actions (the same as muting from a channel's menu), with Discord's
"until I turn it back on" setting. The server header has no documented hook, so the bell is placed at run time
beside whatever the header's search bar is; the settings page shows where it went.

### Default Typing Indicator (`dev.ketsuyumi.default-typing`)

Shows everyone's typing indicator as Discord's plain "• • •", without custom animated emoji wiggling around. When someone
with a custom typing indicator types, their glyph is swapped for Discord's own dots and the "is typing…" text stays.
It hooks Discord's typing row (`TypingIndicator`'s `renderItem`) the same way Better Typing Indicators does, so the two
work together. Needs a reload when turned on or off, since Discord keeps rows it already drew.

### Profile Widgets (`dev.ketsuyumi.profile-widgets`)

Edit your profile's game widgets on mobile, where Discord says "Widget editing isn't available on mobile yet". Open the
plugin's settings to see Favorite Game (1), Games in Rotation (5), Games I Like (20) and Want to Play (20):

- **Add a game**: search by name or alias (word by word, in any order), pick from your suggested games, or paste a game
  ID. Search covers Discord's PC game list plus games you and your friends are playing right now, so mobile games with
  Discord activity show up while someone plays them. Discord decides which games a widget accepts.
- **Edit a game**: comment, skill tag and other tags (shown on Favorite Game and Games in Rotation), move up or down,
  or remove it.
- **Save to profile**: sends the whole set with `PUT /users/@me/widgets` through Discord's own request helper (the plugin
  never touches your token). Custom app widgets you already have are kept exactly as they are; empty game widgets are
  removed.

Request shapes follow Discord Userdoccers' widgets page. Creating new custom app widgets is not supported (Discord ended
that experiment).

### AO3 Reader (`dev.ketsuyumi.ao3-reader`)

Read AO3 works inside Discord, made for phones. Tap an AO3 work link in any chat (or paste one on the plugin's page)
and it opens in a reader instead of the browser:

- The whole work loads at once (`view_full_work`, adult works included) and is turned into native text, keeping
  italics, bold, underline, strikethrough, centred lines and dividers. A virtualized list keeps long works smooth.
- **Aa**: text size, line spacing, margins, serif or sans, justified text, and themes (Discord, Light, Sepia, Dark,
  AMOLED Black). **☰**: the chapter list; ‹ Prev / Next › and the % read at the bottom. Tap the page to hide the bars.
- Your place is saved, and the plugin's page lists your library with progress.

Works locked to logged-in AO3 users can't be read without logging in; those offer "Open in browser".

### Auto Collapse (`dev.ketsuyumi.auto-collapse`)

Opening a server, new or old, collapses its categories, so only channels with new messages show (Discord keeps
those visible under a collapsed category). Settings:

- **Hide every read channel** (on): collapses all categories. Off: only the categories where everything is read.
- **Open categories with new messages** (on, used when the first is off): expands a category with something unread.
- **Muted channels count as read** (on): mentions still count as new.
- **Hide read channels outside categories** (off): the loose channels at the top are hidden while read. Ones with
  new messages, the one you're in and voice channels with people in them stay.

Servers are collapsed ahead of time (every server shortly after Discord starts, a few at a time, and each server again
when you leave it), so a server is already tidy when you open it.
- **Only once per server** (off): just the first time you open each server after starting Discord.

It uses Discord's own collapse actions, so it's the same as tapping the category headers, and you can open any of
them again by hand.

### Hide Stream Previews (`dev.ketsuyumi.hide-stream-previews`)

Hides the floating call / stream preview tile that stays over the chat after you leave the call screen. Turn it on or
off from the call's own menu (**Hide Stream Previews**, under Change Audio Output) or the plugin's settings.

The tile is `voice_panel/native/pip/VoicePanelPIP` (found by Yumistra for Voice Overlay); the menu row is added the way
il1ll's Mute Bubble adds "Enable Bubble" (GPL-3.0).

### Stream Tools (`dev.ketsuyumi.stream-tools`)

More control when watching streams in a call:

- **Auto-watch** when someone in your call goes live, and **auto-focus** the stream so it's big right away (no tapping,
  also with Only Show Videos). Each stream is focused once, so tapping out of it yourself sticks.
- **Next stream when one ends**, a **"went live" toast**, and **ignore my own stream**.
- A **stream bar** on the focused stream: ◀ ▶ to switch between streams, 🔇 mute, − / + volume (tap the % to reset),
  ⛶ clean view (and a floating "⛶ Exit clean view" button while it's on).
- **Clean view**: only the stream; hides other tiles, the stream's own overlays and the call controls (each optional).

Auto-watch, auto-focus and clean view are also in the call's menu, under Only Show Videos. Stream actions are Discord's
own (as il1ll's Stream Button uses them); the call tiles are the components bleelblep documented for Pronouns. The
call's control bar has no known module, so it's looked for at run time; the settings page shows what was found.

### Meow Picker (`dev.ketsuyumi.meow-picker`)

A cat button by the emoji button in the chat bar opens a picker like the emoji one, with 599 meows in 13 tabs:
Meows, Mrrps, Purrs, Sleepy, Hungry, Grumpy, Actions (`*headbutts*`, `*makes biscuits*`…), Clingy, Flirty, Kaomoji (`ฅ^•ﻌ•^ฅ`,
`/ᐠ｡ꞈ｡ᐟ\`…), Emoji, Puns and Stretchy (meow → meooooooow), plus Recent and a search box. Tap one to add it to your
message, hold one to send it straight away (or switch tap to send in settings).

Adding text at the cursor uses the chat box handle and the sheet's scrolling list the way bleelblep's Pocket
Browser and Character Counter do (GPL-3.0).

### Quick Folders (`dev.ketsuyumi.quick-folders`)

Put servers in folders without dragging. Long-press a server icon and choose **Move to**:

- **Your folders**: tap one and the server moves to the end of it (unnamed folders are shown by their servers' names).
- **New folder…**: a name and a colour; it appears where the server was.
- **Remove from folder**: takes it out, just after its folder. A folder left empty disappears, as when dragging.

For a server in a folder, **Move all to** moves every server in that folder into another folder (merging them), or
takes them all out of folders. It can be turned off in settings, and so can the rows in the long-press popup and in
More Options (off by default).

It saves through Discord's own `saveGuildFolders`, the same path drag-to-reorder uses, so the change syncs to your
other devices.

### Shop Browser (`dev.ketsuyumi.shop-browser`)

The Discord Shop in a compact 3 × 3, 4 × 4 or 5 × 5 grid (5 × 5 hides the price line) with filters. Open the plugin's settings to browse:

- **Filters**: type (decorations, effects, nameplates, frames, bundles), owned or not, Orbs or paid, category, and a
  search over item and category names. **Reset filters** clears them; pull down to reload.
- **Collabs**: show everything, only non-collab items, or only collabs. Collab categories (🤝) are detected from the
  copyright notices (©, ™, ®) or collab wording licensed sets carry; long-press a category chip to mark or unmark it.
- **Sorting**: shop order, cheapest, priciest, or A–Z (items with no price go last).
- **Cards** show a small preview, the name, price (money and/or Orbs) and an **Owned** badge. Tap one for a bigger
  preview, description, Nitro price and **Open in the Shop**.

Data comes from the same endpoints the app uses (`/collectibles-categories/v2` and `/users/@me/collectibles-purchases`,
as documented by Discord Userdoccers), through Discord's own request helper. Buying still happens in Discord's shop.

### Embed Playback (`dev.ketsuyumi.embed-playback`)

Play YouTube videos without leaving Discord, like Aliucord's old inline playback. Tapping a YouTube embed (or a YouTube
link) opens a player over the chat instead of Discord's full-screen viewer or the YouTube app.

- **Open as**: big (across the top), **inside the message** (native: plays in the embed itself and scrolls with the
  message, clipped to the chat like the message is), **on the thumbnail** (a window where the embed's picture is), or a
  small floating window. When an in-message video scrolls off screen it carries on in the floating window from the same
  second (optional).
- **Borderless**: no bar or rounded corners, just the video with small ⠿ (move), ▁/⤢ and ✕ buttons on it.
- The player is a free window: **drag** it by its bar, **resize** it from the ◢ corner (16:9 kept), **▁** jumps to the
  small window and **⤢** to big. It keeps playing while you scroll and switch channels. **↗** opens the video in YouTube,
  **✕** closes it, and Back shrinks a big player. Timestamps (`t=1m5s`, `start=42`) are kept.
- **Ads**: works with Palm's **Block YouTube Ads** (Community Plugins), which adds AdGuard's script to every YouTube frame
  in the app, this player's included. It's an optional dependency; settings say whether it's installed.
- If YouTube says "This video is unavailable" or shows an error code, **↻** in the player tries the next way of loading it
  (Discord-style embed, privacy-enhanced embed, direct embed page) and remembers the one that works.

The player is drawn beside Discord's toast container, which floats over every screen, using Discord's own WebView
(found the way dxckie's Spotify Preview finds it, GPL-3.0). Chat rows are drawn natively, so "on the thumbnail" opens the
player over the thumbnail rather than inside the message, and it stays put when you scroll. It needs Discord to pass the
thumbnail's position to its viewer; if it doesn't, the player opens big, and **Copy debug info** in settings copies what
Discord passed.

### Floating Browser (`dev.ketsuyumi.floating-browser`)

A browser window that floats over Discord, so a video keeps playing while you chat, scroll and switch channels. Open
it with the 🌐 button in the chat bar (or the plugin's page). Drag it by its bar, resize from ◢, or pick Big, Corner or
16:9 from ☰. Tap the title to type an address or a search. ❐ shows your tabs (up to 6, each keeps playing in the
background); ⛶ makes the page's video fill the window. Your window size and position, tabs and bookmarks are
remembered, and ▁ goes back to the size you gave the window. Hold the middle of the page (or long-press the title)
to move the window by dragging anywhere on it; it never goes under the status bar.

**Ad blocking with uBlock Origin's filter lists** (uBlock filters, uBlock Badware risks, EasyList, Peter Lowe's list;
EasyPrivacy optional). The lists are downloaded on your phone, compiled and cached, and refreshed every 4 days. This is
not uBlock Origin itself (an app's web view can't run extensions) but a small engine using its lists:

- requests to ad, tracker and malware hosts are stopped inside pages (scripts, frames, images, fetch, XHR, beacons),
  and the window won't leave a page for one of them (pop-unders and ad redirects);
- each site's own hiding rules apply, and generic ones are added for the classes and ids a page actually has;
- the common `+js()` scriptlets run (set-constant, abort-on-property-read/write, abort-current-script,
  prevent-addEventListener, no-setTimeout/setInterval-if, no-window-open-if, prevent-fetch/xhr, remove-attr/class…).

Procedural filters (`:has-text` and friends), HTML filtering and redirect resources aren't supported.

Extensions (scripts put into pages, each a switch in ☰ and in settings):

- **Fullscreen in the window**: a video's fullscreen button makes the video fill the floating window (over the site's
  header), without resizing the window or taking the whole screen; players inside embedded frames too. ⛶ in the bar
  leaves it. Optional: also turn the window into a full-width landscape box.
- **Pop-up blocker**: no new windows, no jumps to app stores or `intent://` links.
- **Hide ads**: hides common ad boxes.
- **Dark pages**, **Video focus** (the page's main video fills the window) and **Desktop site**.
- **User scripts**: your own JavaScript for the sites you choose, like a small Tampermonkey. A script with a mistake only
  stops itself.

Optional: open web links from chats in it. Sites with DRM video (Netflix, Crunchyroll…) usually won't play in an
app's web view. Finding the web view is from dxckie's Spotify Preview (GPL-3.0).

### Forum Grid (`dev.ketsuyumi.forum-grid`)

See a forum's posts as a grid of cards: the first image (or a text preview), title, tags, replies, reactions, how long
ago, an unread dot and 📌 for pinned posts. Tap a card to open the post.

- **Open it from** (each one a toggle): the forum's long-press menu (**Open as grid**), a grid button in the forum's top
  bar, or **Replace the forum view** so the grid opens by itself (✕ or back shows Discord's list).
- **Filters**: search, forum tags, unread, followed, has image, my posts, date (today / week / month) and minimum
  reactions. **Sort** by latest activity, newest, oldest, most replies or most reactions. Pinned posts first, in place
  or hidden. 2 × 2, 3 × 3, 4 × 4 or 5 × 5 (4 and 5 show just the image and title); the top bar button cycles them.
- **Mark read** marks every loaded unread post read in one request.

Posts come from `GET /channels/{forum}/threads/search` (with paging as you scroll), read states from
`POST /read-states/ack-bulk`, both as documented by Discord Userdoccers. The long-press row follows Yumistra's Better
Channel List (GPL-3.0). The top bar button looks for the forum header's button files by likely names, so it may not show
on every Discord version; Settings → Status says where it attached.

### Friends Export (`dev.ketsuyumi.friends-export`)

Export your friends list, like Equicord's export on desktop. Each person gets their display name, @username, your
nickname for them, the date you became friends and their ID.

- **`/friendslist`**: options `format` (text, csv, json), `include` (friends, or everything: blocked users and incoming
  and outgoing requests too) and `to` (show the list in the chat, copy it, or save a file). Only you see the reply.
- **Plugin settings**: counts of friends, blocked and requests, the same choices, and **Copy** / **Save to a file**.

Files are saved to Downloads (or Discord's documents folder if Downloads can't be written) as
`discord-friends-<date>.txt|csv|json`. The slash command uses bleelblep's command helper (GPL-3.0), which registers it
next to Discord's own built-in commands.

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
- **Ame-chan (Background)**: the same colours with Ame-chan in the top-right corner, framed by the screen edge like the
  original art and sharp at full resolution. Only the bottom of her skirt blends into the purple.
- **Ame-chan (Background, bottom)**: Ame-chan in the bottom-right corner instead, her hair fading into the purple so
  the top of the chat stays clear.
- **Ame-chan Purple** (+ Background): soft purple and slate, from the sketch art; the background drops its
  white frame.
- **Ame-chan Red** (+ Background): deep wine, crimson buttons and rose links; the background pins the red art to the
  bottom of the screen on the same red.
- **Ame-chan Blue** (+ Background): near-black with her blue hair for accents and a touch of red; the art sits at the
  bottom of the screen on black.
- **Ame-chan Noir** (+ Background): charcoal and black with bright swirl red; the art sits at the top and fades into black.
- **Ame-chan Pixel** (+ Background): charcoal with raspberry pink, from the pixel-window art, centred on its own charcoal.
- **Ame-chan Glitch** (+ Background): deep magenta, hot pink and the glitch's cyan for links; the background fades the
  art into grainy magenta.

### Mari (`dev.ketsuyumi.theme.mari`)

A cute, simple OMORI theme inspired by Mari: violet-night surfaces from her hair, her blue vest for buttons and toggles,
and coral links and mentions from her neckerchief, with the art's magenta sparkles for highlights. Text stays near-white
(about 13:1 contrast). Works on every base, including a light version.

- **Mari**: just the colours.
- **Mari (Background)**: the same colours with Mari at the top of the screen, uncut, and the art's purple floor (with
  sparkles) continuing below.

All the themes recolour every Discord colour with the theme engine from dxckie's themes (GPL-3.0), so nothing is left default grey.

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
