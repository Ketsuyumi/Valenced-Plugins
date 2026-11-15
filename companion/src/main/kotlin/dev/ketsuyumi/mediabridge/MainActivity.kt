package dev.ketsuyumi.mediabridge

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/** Setup screen: notification access, battery, and what this app currently sees. */
class MainActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var details: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (resources.displayMetrics.density * 20).toInt()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }

        fun text(value: String, size: Float = 15f) = TextView(this).apply {
            text = value
            textSize = size
            setPadding(0, pad / 2, 0, pad / 2)
        }

        fun button(label: String, onClick: () -> Unit) = Button(this).apply {
            text = label
            setOnClickListener { runCatching(onClick) }
        }

        column.addView(text("Media Bridge", 26f))
        column.addView(
            text(
                "Companion app for the Media Controls plugin in Discord (Valenced). It shows and controls " +
                    "whatever is playing on your phone, from any app: the same player as in your notification shade.",
            ),
        )
        column.addView(
            text(
                "It needs notification access, because Android only lets notification listeners read media " +
                    "sessions. It does not read or keep your notifications, has no internet access, and only " +
                    "sends what is playing to Discord.",
            ),
        )
        status = text("", 17f)
        column.addView(status)
        column.addView(button("Open notification access") {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        })
        column.addView(
            text(
                "Android 13 and newer block notification access for apps installed from a file. If Media Bridge " +
                    "is greyed out, open App info, tap ⋮ and choose \"Allow restricted settings\", then try again.",
            ),
        )
        column.addView(button("Open App info") {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        })
        column.addView(
            text("If Discord stops updating after a while, set this app's battery usage to Unrestricted."),
        )
        column.addView(button("Open battery settings") {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        })
        details = text("")
        column.addView(details)
        column.addView(button("Refresh") { update() })

        setContentView(ScrollView(this).apply {
            addView(column, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        })
    }

    override fun onResume() {
        super.onResume()
        update()
    }

    private fun update() {
        val granted = hasAccess()
        status.text = if (granted) "✓ Notification access is on." else "✗ Notification access is off."
        val listener = MediaListener.instance
        if (granted && listener == null) {
            // Granted but not bound (e.g. the phone closed the app): ask Android to bind it again.
            runCatching { NotificationListenerService.requestRebind(ComponentName(this, MediaListener::class.java)) }
        }
        listener?.refresh()

        val discords = Targets(this).installed()
        details.text = buildString {
            append("Listener: ").append(if (listener != null) "running" else "not running").append('\n')
            append("Following: ").append(listener?.nowFollowing ?: "nothing").append('\n')
            append("Discord apps connected: ")
            if (discords.isEmpty()) {
                append("none yet. Open Discord with the Media Controls plugin enabled.")
            } else {
                append(discords.joinToString { "${Targets.labelOf(this@MainActivity, it)} ($it)" })
            }
        }
    }

    private fun hasAccess(): Boolean {
        val enabled = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        val mine = ComponentName(this, MediaListener::class.java)
        return enabled.split(':').mapNotNull(ComponentName::unflattenFromString).any { it == mine }
    }
}
