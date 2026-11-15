@file:JvmName("MediaControls")

package dev.ketsuyumi.mediacontrols

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Build
import android.os.SystemClock
import android.util.Base64
import android.view.KeyEvent
import app.valenced.plugins.plugin
import app.valenced.xposed.api.callJSMethod
import app.valenced.xposed.api.registerNativeMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// Must match the Media Bridge app (companion/src/main/kotlin/.../Protocol.kt).
private const val BRIDGE = "dev.ketsuyumi.mediabridge"
private const val ACTION_STATE = "$BRIDGE.STATE"
private const val ACTION_COMMAND = "$BRIDGE.COMMAND"

/** Signature permission of Media Bridge: only that app can send Discord a state. */
private const val SEND_PERMISSION = "$BRIDGE.permission.SEND_STATE"

private val MEDIA_KEYS = mapOf(
    "playPause" to KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
    "next" to KeyEvent.KEYCODE_MEDIA_NEXT,
    "previous" to KeyEvent.KEYCODE_MEDIA_PREVIOUS,
)

@Volatile private var appContext: Context? = null
@Volatile private var receiver: BroadcastReceiver? = null
@Volatile private var lastState: Intent? = null
@Volatile private var heardAt = 0L
@Volatile private var helloAt = 0L
@Volatile private var trackKey: String? = null
@Volatile private var art: String? = null
/**
 * Media Bridge's reply envelope, from its latest state: a PendingIntent addressed to it. Sending
 * commands through it works even though Discord can't see Media Bridge (Android 11+), unlike a
 * plain broadcast, which newer Android versions may drop.
 */
@Volatile private var commandIntent: PendingIntent? = null

/** How the last command was sent, for Diagnostics: "envelope" or "broadcast". */
@Volatile private var lastRoute: String? = null

/** Commands sent to Media Bridge (not counting hello/request), for Diagnostics. */
@Volatile private var commandsSent = 0

/** Tells JavaScript a new state arrived, so it doesn't have to poll. Set while the plugin runs. */
@Volatile private var onChange: (() -> Unit)? = null
@Volatile private var pushPending = false
private val pushScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

/**
 * Discord's application context. Normally set in [mediaControls]' start through withAppContext;
 * if that didn't happen (e.g. the plugin was updated and restarted without restarting Discord),
 * it's taken from Android directly and the receiver is registered then.
 */
private fun context(): Context? {
    appContext?.let { return it }
    val app = runCatching {
        Class.forName("android.app.ActivityThread").getMethod("currentApplication").invoke(null) as? Context
    }.getOrNull() ?: return null
    attach(app)
    return app
}

/** Remembers the context, listens for Media Bridge and says hello. Safe to call more than once. */
private fun attach(context: Context) {
    val app = context.applicationContext ?: context
    appContext = app
    if (receiver == null) {
        val listener = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) = onState(intent)
        }
        val filter = IntentFilter(ACTION_STATE)
        if (Build.VERSION.SDK_INT >= 33) {
            app.registerReceiver(listener, filter, SEND_PERMISSION, null, Context.RECEIVER_EXPORTED)
        } else {
            app.registerReceiver(listener, filter, SEND_PERMISSION, null)
        }
        receiver = listener
    }
    sendCommand("hello")
}

private fun audio() = context()?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

/** Tells Media Bridge this Discord's package name, so it knows where to send updates. */
private fun sendCommand(command: String, position: Long = 0L): Boolean {
    val context = appContext ?: context() ?: return false
    val extras = Intent()
        .putExtra("command", command)
        .putExtra("position", position)
        .putExtra("from", context.packageName)

    // Preferred: through Media Bridge's own PendingIntent, delivered as if it sent it itself.
    val envelope = commandIntent
    val sent = envelope != null && runCatching { envelope.send(context, 0, extras) }.isSuccess
    if (sent) {
        lastRoute = "envelope"
    } else {
        // Before the first state (e.g. the very first hello): a plain implicit broadcast.
        context.sendBroadcast(Intent(ACTION_COMMAND).putExtras(extras))
        lastRoute = "broadcast"
    }
    if (command == "hello" || command == "request") helloAt = SystemClock.elapsedRealtime()
    else commandsSent++
    return true
}

/** Sends a media key to whatever is playing, like headphone buttons. Works without Media Bridge. */
private fun pressKey(name: String?): Boolean {
    val code = MEDIA_KEYS[name] ?: return false
    val manager = audio() ?: return false
    val now = SystemClock.uptimeMillis()
    manager.dispatchMediaKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0))
    manager.dispatchMediaKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_UP, code, 0))
    return true
}

private fun onState(intent: Intent) {
    lastState = intent
    @Suppress("DEPRECATION")
    val envelope: PendingIntent? = intent.getParcelableExtra("commandIntent")
    if (envelope != null) commandIntent = envelope
    heardAt = SystemClock.elapsedRealtime()
    val key = intent.getStringExtra("trackKey")
    if (key != trackKey) {
        trackKey = key
        art = null
    }
    intent.getByteArrayExtra("art")?.let {
        art = "data:image/jpeg;base64," + Base64.encodeToString(it, Base64.NO_WRAP)
    }
    onChange?.invoke()
}

/** The last state for JavaScript, with the position moved forward to now. Numbers are doubles for React Native. */
private fun stateMap(): Map<String, Any?> {
    val now = SystemClock.elapsedRealtime()
    val intent = lastState
        ?: return mapOf(
            "heard" to false,
            "sinceHello" to if (helloAt == 0L) -1.0 else (now - helloAt).toDouble(),
            "discordPackage" to context()?.packageName,
            "commandsSent" to commandsSent.toDouble(),
        )
    val playing = intent.getBooleanExtra("playing", false)
    val position = intent.getLongExtra("position", 0L)
    val updated = intent.getLongExtra("updated", 0L)
    val speed = intent.getFloatExtra("speed", 1f)
    val duration = intent.getLongExtra("duration", 0L)
    var current = if (playing && updated > 0) position + ((now - updated) * speed).toLong() else position
    if (duration > 0) current = current.coerceIn(0L, duration)
    return mapOf(
        "heard" to true,
        "protocol" to intent.getIntExtra("protocol", 0).toDouble(),
        "access" to intent.getBooleanExtra("access", false),
        "active" to intent.getBooleanExtra("active", false),
        "app" to intent.getStringExtra("app"),
        "package" to intent.getStringExtra("package"),
        "title" to intent.getStringExtra("title"),
        "artist" to intent.getStringExtra("artist"),
        "album" to intent.getStringExtra("album"),
        "playing" to playing,
        "position" to current.toDouble(),
        "duration" to duration.toDouble(),
        "canSeek" to intent.getBooleanExtra("canSeek", false),
        "canShuffle" to intent.getBooleanExtra("canShuffle", false),
        "canRepeat" to intent.getBooleanExtra("canRepeat", false),
        "shuffle" to intent.getBooleanExtra("shuffle", false),
        "repeat" to (intent.getStringExtra("repeat") ?: "off"),
        "trackKey" to trackKey,
        "artVersion" to intent.getIntExtra("artVersion", 0).toDouble(),
        "artUrl" to intent.getStringExtra("artUrl"),
        "age" to (now - heardAt).toDouble(),
        "discordPackage" to appContext?.packageName,
        "commandsSent" to commandsSent.toDouble(),
        "commandsReceived" to intent.getIntExtra("commandCount", -1).toDouble(),
        "lastCommand" to intent.getStringExtra("lastCommand"),
        "commandRoute" to (lastRoute ?: if (commandIntent != null) "envelope" else "broadcast"),
    )
}

/**
 * Media Controls: shows and controls what any app is playing. With the Media Bridge app (which
 * has notification access) it gets the song, cover and progress; without it, media keys only.
 */
val mediaControls = plugin {
    start {
        withAppContext { context -> attach(context) }

        // Push: one JavaScript call per burst of updates (merged within 50 ms).
        onChange = {
            if (!pushPending) {
                pushPending = true
                pushScope.launch {
                    delay(50)
                    pushPending = false
                    if (bridge.isReady) runCatching { callJSMethod("mediaControls.changed") }
                }
            }
        }

        registerNativeMethod("mediaControls.state") { stateMap() }
        registerNativeMethod("mediaControls.art") { art }
        registerNativeMethod("mediaControls.playing") { audio()?.isMusicActive == true }
        registerNativeMethod("mediaControls.press") { args -> pressKey(args.firstOrNull() as? String) }
        registerNativeMethod("mediaControls.command") { args ->
            val name = args.getOrNull(0) as? String ?: return@registerNativeMethod false
            val position = (args.getOrNull(1) as? Number)?.toLong() ?: 0L
            sendCommand(name, position)
        }
    }

    stop {
        onChange = null
        receiver?.let { runCatching { appContext?.unregisterReceiver(it) } }
        receiver = null
        lastState = null
        commandIntent = null
        art = null
        trackKey = null
    }
}
