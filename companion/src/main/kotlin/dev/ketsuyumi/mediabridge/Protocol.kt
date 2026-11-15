package dev.ketsuyumi.mediabridge

/**
 * The messages between Media Bridge and the Media Controls plugin inside Discord.
 *
 * - Discord -> Media Bridge: [ACTION_COMMAND] (implicit broadcast, since Discord can't see this
 *   app on Android 11+). Extras: [EXTRA_COMMAND], [EXTRA_POSITION], and [EXTRA_FROM], the
 *   sender's package name, so this app learns where to send updates whatever Discord is called.
 * - Media Bridge -> Discord: [ACTION_STATE], sent to each known Discord package and protected by
 *   [SEND_PERMISSION], which only this app holds.
 */
const val ACTION_STATE = "dev.ketsuyumi.mediabridge.STATE"
const val ACTION_COMMAND = "dev.ketsuyumi.mediabridge.COMMAND"
const val SEND_PERMISSION = "dev.ketsuyumi.mediabridge.permission.SEND_STATE"

const val EXTRA_COMMAND = "command"
const val EXTRA_POSITION = "position"
const val EXTRA_FROM = "from"

/** Commands: "hello" (Discord started), "request" (send everything again), and the controls. */
const val COMMAND_HELLO = "hello"
const val COMMAND_REQUEST = "request"

/** Bumped when the state format changes, so the plugin can tell an outdated app apart. */
const val PROTOCOL_VERSION = 1
