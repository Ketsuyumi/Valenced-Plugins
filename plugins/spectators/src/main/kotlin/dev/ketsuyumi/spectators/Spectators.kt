@file:JvmName("Spectators")

package dev.ketsuyumi.spectators

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod

private const val CHANNEL_ID = "dev.ketsuyumi.spectators"
private const val NOTIFICATION_ID = 0x5bec7a

@Volatile private var appContext: Context? = null

/** Discord's context: from start, or from Android directly if the plugin restarted on its own. */
private fun context(): Context? {
    appContext?.let { return it }
    val app = runCatching {
        Class.forName("android.app.ActivityThread").getMethod("currentApplication").invoke(null) as? Context
    }.getOrNull()
    appContext = app?.applicationContext ?: app
    return appContext
}

private fun manager(): NotificationManager? =
    context()?.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager

/** A quiet channel: no sound, no vibration, no pop-up. Created once; Android ignores repeats. */
private fun ensureChannel(manager: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(CHANNEL_ID, "Stream spectators", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Who is watching your stream"
        setShowBadge(false)
        enableVibration(false)
        setSound(null, null)
    }
    manager.createNotificationChannel(channel)
}

/** Shows or updates the notification. False when it could not be posted. */
private fun show(title: String, text: String): Boolean {
    val ctx = context() ?: return false
    val manager = manager() ?: return false
    return runCatching {
        ensureChannel(manager)
        val open = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.let {
            PendingIntent.getActivity(
                ctx, NOTIFICATION_ID, it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }
        @Suppress("DEPRECATION")
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            Notification.Builder(ctx, CHANNEL_ID)
        else Notification.Builder(ctx)
        val notification = builder
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setShowWhen(false)
            .apply { if (open != null) setContentIntent(open) }
            .build()
        manager.notify(NOTIFICATION_ID, notification)
        true
    }.getOrDefault(false)
}

private fun hide() {
    runCatching { manager()?.cancel(NOTIFICATION_ID) }
}

/** Spectators: the native half only posts and removes the "N watching your stream" notification. */
val spectators = plugin {
    start {
        withAppContext { ctx -> appContext = ctx.applicationContext ?: ctx }
        registerNativeMethod("spectators.show") { args ->
            show(args.getOrNull(0) as? String ?: "", args.getOrNull(1) as? String ?: "")
        }
        registerNativeMethod("spectators.hide") {
            hide()
            true
        }
    }
    stop {
        hide()
    }
}
