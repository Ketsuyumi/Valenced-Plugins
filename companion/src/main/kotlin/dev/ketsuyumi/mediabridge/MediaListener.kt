package dev.ketsuyumi.mediabridge

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService
import android.support.v4.media.session.MediaControllerCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors

private const val ART_SIZE = 320

/**
 * Follows the media session that is playing (the one in the notification shade) and sends it to
 * every Discord install that said hello. Runs the commands Discord sends on that session.
 */
class MediaListener : NotificationListenerService() {
    companion object {
        @Volatile
        var instance: MediaListener? = null
            private set
    }

    private val main = Handler(Looper.getMainLooper())
    private val artWorker = Executors.newSingleThreadExecutor()
    private lateinit var targets: Targets
    private var sessions: MediaSessionManager? = null
    private var controller: MediaController? = null
    private var compat: MediaControllerCompat? = null

    // The cover of the current track. It can arrive after the title, so it has its own version.
    private var trackKey: String? = null
    private var artBytes: ByteArray? = null
    private var artWebUrl: String? = null
    private var artSource: Any? = null
    private var artVersion = 0

    /** Per Discord package: the cover version it already has, so the image is only sent once. */
    private val artSent = mutableMapOf<String, Int>()

    /** What was last sent, to skip updates where only the expected progress changed. */
    private var lastSignature: String? = null
    private var lastPosition = 0L
    private var lastUpdated = 0L
    private var lastSpeed = 1f

    /** Installed targets, re-checked at most once a minute (package lookups aren't free). */
    private var cachedTargets: Set<String> = emptySet()
    private var targetsCheckedAt = 0L

    private fun liveTargets(): Set<String> {
        val now = android.os.SystemClock.elapsedRealtime()
        if (now - targetsCheckedAt > 60_000 || cachedTargets.isEmpty()) {
            cachedTargets = targets.installed()
            targetsCheckedAt = now
        }
        return cachedTargets
    }

    /** Forces the next [send] through, e.g. when a Discord says hello. */
    private fun forceNextSend() {
        lastSignature = null
        targetsCheckedAt = 0L
    }

    private val component get() = ComponentName(this, MediaListener::class.java)

    /** App label and package of what's followed, for this app's own screen. */
    val nowFollowing: String?
        get() = controller?.let { c ->
            val title = c.metadata?.getString(MediaMetadata.METADATA_KEY_TITLE)
            "${Targets.labelOf(this, c.packageName)}${title?.let { ": $it" } ?: ""}"
        }

    private val commands = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val from = intent.getStringExtra(EXTRA_FROM)
            if (from != null && from != packageName) {
                if (targets.add(from)) targetsCheckedAt = 0L
                if (intent.getStringExtra(EXTRA_COMMAND) in setOf(COMMAND_HELLO, COMMAND_REQUEST)) {
                    artSent.remove(from)
                    forceNextSend()
                }
            }
            run(intent.getStringExtra(EXTRA_COMMAND), intent.getLongExtra(EXTRA_POSITION, 0L))
        }
    }

    private val sessionsChanged = MediaSessionManager.OnActiveSessionsChangedListener { list ->
        choose(list.orEmpty())
    }

    private val callback = object : MediaController.Callback() {
        override fun onMetadataChanged(metadata: MediaMetadata?) = send()
        override fun onPlaybackStateChanged(state: PlaybackState?) {
            // Another session may have started playing; re-pick when this one stops.
            if (state?.state != PlaybackState.STATE_PLAYING) refresh() else send()
        }
        override fun onSessionDestroyed() = refresh()
    }

    private val compatCallback = object : MediaControllerCompat.Callback() {
        override fun onShuffleModeChanged(shuffleMode: Int) = send()
        override fun onRepeatModeChanged(repeatMode: Int) = send()
    }

    override fun onListenerConnected() {
        instance = this
        targets = Targets(this)
        val manager = getSystemService(MediaSessionManager::class.java)
        sessions = manager
        manager.addOnActiveSessionsChangedListener(sessionsChanged, component, main)
        val filter = IntentFilter(ACTION_COMMAND)
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(commands, filter, Context.RECEIVER_EXPORTED)
        else registerReceiver(commands, filter)
        refresh()
    }

    override fun onListenerDisconnected() {
        sessions?.removeOnActiveSessionsChangedListener(sessionsChanged)
        runCatching { unregisterReceiver(commands) }
        follow(null)
        instance = null
        // Some phones disconnect listeners to save battery; ask Android to bind again.
        runCatching { requestRebind(component) }
    }

    fun refresh() {
        val list = runCatching { sessions?.getActiveSessions(component) }.getOrNull().orEmpty()
        choose(list)
    }

    /** The session that is playing wins; otherwise the one Android lists first (most recent). */
    private fun choose(list: List<MediaController>) {
        val best = list.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING }
            ?: list.firstOrNull()
        if (best?.sessionToken != controller?.sessionToken) follow(best)
        send()
    }

    private fun follow(next: MediaController?) {
        controller?.unregisterCallback(callback)
        compat?.unregisterCallback(compatCallback)
        controller = next
        compat = next?.let {
            runCatching { MediaControllerCompat(this, MediaSessionCompat.Token.fromToken(it.sessionToken)) }.getOrNull()
        }
        next?.registerCallback(callback, main)
        compat?.registerCallback(compatCallback, main)
        trackKey = null
    }

    private fun customAction(word: String) = controller?.playbackState?.customActions?.firstOrNull {
        it.action.contains(word, ignoreCase = true) || it.name.toString().contains(word, ignoreCase = true)
    }

    private fun supports(action: Long) = (controller?.playbackState?.actions ?: 0L) and action != 0L

    private fun canShuffle() = supports(PlaybackStateCompat.ACTION_SET_SHUFFLE_MODE) ||
        (compat?.shuffleMode ?: -1) >= 0 || customAction("shuffle") != null

    private fun canRepeat() = supports(PlaybackStateCompat.ACTION_SET_REPEAT_MODE) ||
        (compat?.repeatMode ?: -1) >= 0 || customAction("repeat") != null

    private fun run(command: String?, position: Long) {
        if (command == COMMAND_HELLO || command == COMMAND_REQUEST) {
            refresh()
            return
        }
        val current = controller ?: return
        val controls = current.transportControls
        when (command) {
            "play" -> controls.play()
            "pause" -> controls.pause()
            "playPause" ->
                if (current.playbackState?.state == PlaybackState.STATE_PLAYING) controls.pause() else controls.play()
            "next" -> controls.skipToNext()
            "previous" -> controls.skipToPrevious()
            "seek" -> controls.seekTo(position)
            "shuffle" -> {
                val custom = customAction("shuffle")
                if (custom != null && !supports(PlaybackStateCompat.ACTION_SET_SHUFFLE_MODE)) {
                    controls.sendCustomAction(custom, null)
                } else {
                    val on = compat?.shuffleMode == PlaybackStateCompat.SHUFFLE_MODE_ALL ||
                        compat?.shuffleMode == PlaybackStateCompat.SHUFFLE_MODE_GROUP
                    compat?.transportControls?.setShuffleMode(
                        if (on) PlaybackStateCompat.SHUFFLE_MODE_NONE else PlaybackStateCompat.SHUFFLE_MODE_ALL,
                    )
                }
            }
            "repeat" -> {
                val custom = customAction("repeat")
                if (custom != null && !supports(PlaybackStateCompat.ACTION_SET_REPEAT_MODE)) {
                    controls.sendCustomAction(custom, null)
                } else {
                    // Off -> all -> one -> off, like most players.
                    val next = when (compat?.repeatMode) {
                        PlaybackStateCompat.REPEAT_MODE_ALL, PlaybackStateCompat.REPEAT_MODE_GROUP ->
                            PlaybackStateCompat.REPEAT_MODE_ONE
                        PlaybackStateCompat.REPEAT_MODE_ONE -> PlaybackStateCompat.REPEAT_MODE_NONE
                        else -> PlaybackStateCompat.REPEAT_MODE_ALL
                    }
                    compat?.transportControls?.setRepeatMode(next)
                }
            }
        }
    }

    /** Builds the current state and sends it to every known Discord install. */
    private fun send() {
        if (!::targets.isInitialized) return
        val base = Intent(ACTION_STATE)
            .putExtra("protocol", PROTOCOL_VERSION)
            .putExtra("access", true)
        val current = controller

        if (current == null) {
            if (lastSignature == "inactive") return
            lastSignature = "inactive"
            base.putExtra("active", false)
            for (target in liveTargets()) deliver(base, target)
            return
        }

        val metadata = current.metadata
        val state = current.playbackState
        val title = metadata.text(MediaMetadata.METADATA_KEY_TITLE)
            ?: metadata.text(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)
        val artist = metadata.text(MediaMetadata.METADATA_KEY_ARTIST)
            ?: metadata.text(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)
            ?: metadata.text(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE)
        val album = metadata.text(MediaMetadata.METADATA_KEY_ALBUM)

        val key = listOf(current.packageName, title, artist, album).joinToString("|")
        if (key != trackKey) {
            trackKey = key
            artBytes = null
            artWebUrl = null
            artSource = null
            artVersion++
        }
        loadArt(metadata, key)

        val shuffle = compat?.shuffleMode ?: -1
        val repeat = compat?.repeatMode ?: -1

        // Skip updates that change nothing Discord shows: same track, same state, and the position
        // where the last update said it would be (some players report progress every second).
        val playing = state?.state == PlaybackState.STATE_PLAYING
        val position = state?.position ?: 0L
        val updated = state?.lastPositionUpdateTime ?: 0L
        val speed = state?.playbackSpeed ?: 1f
        val signature = listOf(
            key, playing, speed, metadata?.getLong(MediaMetadata.METADATA_KEY_DURATION),
            shuffle, repeat, artVersion, artWebUrl, canShuffle(), canRepeat(), supports(PlaybackState.ACTION_SEEK_TO),
        ).joinToString("|")
        val expected = if (lastSignature != null && playing) lastPosition + ((updated - lastUpdated) * lastSpeed).toLong() else lastPosition
        val jumped = kotlin.math.abs(position - expected) > 1500
        if (signature == lastSignature && !jumped) return
        lastSignature = signature
        lastPosition = position
        lastUpdated = updated
        lastSpeed = speed
        base
            .putExtra("active", true)
            .putExtra("package", current.packageName)
            .putExtra("app", Targets.labelOf(this, current.packageName))
            .putExtra("title", title)
            .putExtra("artist", artist)
            .putExtra("album", album)
            .putExtra("duration", metadata?.getLong(MediaMetadata.METADATA_KEY_DURATION) ?: 0L)
            .putExtra("playing", state?.state == PlaybackState.STATE_PLAYING)
            .putExtra("position", state?.position ?: 0L)
            // elapsedRealtime of the position: the same clock in every process.
            .putExtra("updated", state?.lastPositionUpdateTime ?: 0L)
            .putExtra("speed", state?.playbackSpeed ?: 1f)
            .putExtra("canSeek", supports(PlaybackState.ACTION_SEEK_TO))
            .putExtra("canShuffle", canShuffle())
            .putExtra("canRepeat", canRepeat())
            .putExtra("shuffle", shuffle == PlaybackStateCompat.SHUFFLE_MODE_ALL || shuffle == PlaybackStateCompat.SHUFFLE_MODE_GROUP)
            .putExtra(
                "repeat",
                when (repeat) {
                    PlaybackStateCompat.REPEAT_MODE_ONE -> "one"
                    PlaybackStateCompat.REPEAT_MODE_ALL, PlaybackStateCompat.REPEAT_MODE_GROUP -> "all"
                    else -> "off"
                },
            )
            .putExtra("trackKey", key)
            .putExtra("artVersion", artVersion)
        artWebUrl?.let { base.putExtra("artUrl", it) }

        for (target in liveTargets()) {
            val intent = Intent(base)
            val bytes = artBytes
            if (bytes != null && artSent[target] != artVersion) {
                intent.putExtra("art", bytes)
                artSent[target] = artVersion
            }
            deliver(intent, target)
        }
    }

    private fun deliver(intent: Intent, target: String) {
        runCatching {
            sendBroadcast(Intent(intent).setPackage(target).addFlags(Intent.FLAG_RECEIVER_FOREGROUND))
        }
    }

    /** Covers come as a bitmap, a content URI (read off the main thread) or a web URL. */
    private fun loadArt(metadata: MediaMetadata?, key: String) {
        val bitmap = metadata?.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART)
            ?: metadata?.getBitmap(MediaMetadata.METADATA_KEY_ART)
            ?: metadata?.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON)
        if (bitmap != null) {
            if (bitmap === artSource) return
            artSource = bitmap
            // Compress off the main thread, then send again with the cover.
            artWorker.execute {
                val bytes = jpeg(bitmap)
                main.post {
                    if (trackKey != key || bytes == null) return@post
                    artBytes = bytes
                    artVersion++
                    send()
                }
            }
            return
        }
        val uri = metadata.text(MediaMetadata.METADATA_KEY_ALBUM_ART_URI)
            ?: metadata.text(MediaMetadata.METADATA_KEY_ART_URI)
            ?: metadata.text(MediaMetadata.METADATA_KEY_DISPLAY_ICON_URI)
            ?: return
        if (uri == artSource) return
        artSource = uri
        if (uri.startsWith("https://") || uri.startsWith("http://")) {
            artWebUrl = uri
            artVersion++
            return
        }
        artWorker.execute {
            val bytes = runCatching {
                contentResolver.openInputStream(Uri.parse(uri))?.use(BitmapFactory::decodeStream)
            }.getOrNull()?.let(::jpeg)
            main.post {
                if (trackKey != key) return@post
                if (bytes == null) {
                    artSource = null // try again with the next update
                    return@post
                }
                artBytes = bytes
                artVersion++
                send()
            }
        }
    }

    private fun MediaMetadata?.text(key: String): String? = this?.getString(key)?.takeIf { it.isNotBlank() }

    private fun jpeg(bitmap: Bitmap): ByteArray? = runCatching {
        val scale = ART_SIZE.toFloat() / maxOf(bitmap.width, bitmap.height)
        val scaled = if (scale < 1f) {
            Bitmap.createScaledBitmap(
                bitmap,
                (bitmap.width * scale).toInt().coerceAtLeast(1),
                (bitmap.height * scale).toInt().coerceAtLeast(1),
                true,
            )
        } else bitmap
        ByteArrayOutputStream().use { out ->
            scaled.compress(Bitmap.CompressFormat.JPEG, 85, out)
            out.toByteArray()
        }
    }.getOrNull()
}
