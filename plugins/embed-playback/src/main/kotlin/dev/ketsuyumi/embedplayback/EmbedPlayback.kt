@file:JvmName("EmbedPlayback")

package dev.ketsuyumi.embedplayback

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeAsyncMethod
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONObject
import java.lang.ref.WeakReference
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Embed Playback's native half: a YouTube player inside the message.
 *
 * Discord's chat is drawn by Android views, so a JavaScript plugin can't put anything inside a
 * message. Here a real WebView is placed over the embed's thumbnail view and moved with it on every
 * frame (a pre-draw listener), so the video scrolls with the message. It is clipped to the chat
 * list, so it slides under the header and the message box like the message does.
 *
 * The thumbnail view is found from the rectangle Discord gave its media viewer (JavaScript passes
 * it in dp): the view that overlaps it best. The WebView is added to the activity's content frame
 * (a plain FrameLayout holding React Native's root, never managed by React), not inside Discord's
 * views, so their layout is never disturbed.
 *
 * It stops when the message leaves the screen (the thumbnail view detaches, or stays scrolled out
 * of the list), when the row is reused for another message (its text changes), or when closed.
 * Before stopping it reads the video's current time from the page (window.__ytTime) so JavaScript
 * can carry on in the floating window from the same second.
 */
private object Inline {
	var activity = WeakReference<Activity>(null)
	private val main = Handler(Looper.getMainLooper())

	private var container: FrameLayout? = null
	private var web: WebView? = null
	private var target: View? = null
	private var list: View? = null
	private var row: View? = null
	private var rowKey: String? = null
	private var listener: ViewTreeObserver.OnPreDrawListener? = null
	private var observed: View? = null
	private var frames = 0
	private var hiddenFrames = 0
	private var stopping = false

	var videoId: String? = null
	var stopped: String? = null
	var lastTime = 0.0

	val active get() = container != null

	fun stateJson(): String = JSONObject().apply {
		put("active", active)
		videoId?.let { put("videoId", it) }
		stopped?.let { put("stopped", it) }
		put("time", lastTime)
	}.toString()

	private fun windowRect(view: View): Rect {
		val loc = IntArray(2)
		view.getLocationInWindow(loc)
		return Rect(loc[0], loc[1], loc[0] + view.width, loc[1] + view.height)
	}

	private fun area(r: Rect) = r.width().toLong() * r.height().toLong()

	/** The view overlapping [want] best (intersection over union), skipping our own. */
	private fun findTarget(root: View, want: Rect): Pair<View?, Double> {
		var best: View? = null
		var bestScore = 0.0
		fun visit(view: View) {
			if (view === container || view.visibility != View.VISIBLE) return
			val r = windowRect(view)
			if (!Rect.intersects(r, want)) return
			val inter = Rect(r)
			if (inter.intersect(want)) {
				val i = area(inter).toDouble()
				val union = area(r) + area(want) - i
				val score = if (union > 0) i / union else 0.0
				if (score > bestScore && view.width > 0 && view.height > 0) {
					best = view
					bestScore = score
				}
			}
			if (view is ViewGroup) for (index in 0 until view.childCount) visit(view.getChildAt(index))
		}
		visit(root)
		return best to bestScore
	}

	/** The nearest ancestor that scrolls up or down: the chat list. */
	private fun scrollingAncestor(view: View): View? {
		var parent = view.parent
		while (parent is View) {
			if (parent.canScrollVertically(1) || parent.canScrollVertically(-1)) return parent
			parent = parent.parent
		}
		return null
	}

	/** The list's direct child that holds [view]: the message row. */
	private fun rowOf(view: View, list: View?): View? {
		if (list == null) return null
		var current: View = view
		var parent = current.parent
		while (parent is View) {
			if (parent === list) return current
			current = parent
			parent = current.parent
		}
		return null
	}

	/** What the row shows (texts and descriptions), to notice when it's reused for another message. */
	private fun keyOf(view: View?): String? {
		if (view == null) return null
		val parts = ArrayList<String>()
		fun visit(v: View) {
			if (parts.size >= 8) return
			if (v is TextView && v.text.isNotBlank()) parts.add(v.text.toString())
			v.contentDescription?.let { if (it.isNotBlank()) parts.add(it.toString()) }
			if (v is ViewGroup) for (i in 0 until v.childCount) visit(v.getChildAt(i))
		}
		visit(view)
		return if (parts.isEmpty()) null else parts.joinToString("\u0001")
	}

	private fun dp(activity: Activity, value: Float) =
		TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, activity.resources.displayMetrics).toInt()

	@SuppressLint("SetJavaScriptEnabled")
	fun start(id: String, sourceJson: String, x: Double, y: Double, w: Double, h: Double): String {
		val activity = activity.get() ?: return "no activity"
		val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return "no content view"
		val decor = activity.window?.decorView ?: return "no window"
		teardown(null)
		stopped = null
		lastTime = 0.0

		val density = activity.resources.displayMetrics.density
		val want = Rect((x * density).toInt(), (y * density).toInt(), ((x + w) * density).toInt(), ((y + h) * density).toInt())
		// JavaScript's coordinates may or may not count the status bar: try both, keep the better match.
		val statusBar = windowRect(content).top
		val (plain, plainScore) = findTarget(decor, want)
		val shifted = Rect(want).apply { offset(0, statusBar) }
		val (moved, movedScore) = if (statusBar != 0) findTarget(decor, shifted) else (null to 0.0)
		val found = if (movedScore > plainScore) moved else plain
		val score = maxOf(plainScore, movedScore)
		if (found == null || score < 0.55) return "not found (best match ${(score * 100).toInt()}%)"

		target = found
		list = scrollingAncestor(found)
		row = rowOf(found, list)
		rowKey = keyOf(row)
		videoId = id

		val webView = WebView(activity).apply {
			setBackgroundColor(Color.BLACK)
			settings.javaScriptEnabled = true
			settings.domStorageEnabled = true
			settings.mediaPlaybackRequiresUserGesture = false
			webChromeClient = WebChromeClient()
			webViewClient = WebViewClient()
		}
		val close = TextView(activity).apply {
			text = "✕"
			setTextColor(Color.WHITE)
			textSize = 14f
			gravity = Gravity.CENTER
			background = GradientDrawable().apply {
				shape = GradientDrawable.OVAL
				setColor(Color.argb(115, 0, 0, 0))
			}
			contentDescription = "Close the video"
			setOnClickListener { stop("closed") }
		}
		val frame = FrameLayout(activity).apply {
			setBackgroundColor(Color.BLACK)
			elevation = dp(activity, 6f).toFloat()
			addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
			val size = dp(activity, 28f)
			addView(close, FrameLayout.LayoutParams(size, size, Gravity.TOP or Gravity.END).apply {
				val margin = dp(activity, 6f)
				setMargins(margin, margin, margin, margin)
			})
		}
		val start = windowRect(found)
		content.addView(frame, FrameLayout.LayoutParams(start.width(), start.height()))
		container = frame
		web = webView
		follow()

		val source = JSONObject(sourceJson)
		if (source.has("html")) {
			webView.loadDataWithBaseURL(source.optString("baseUrl", "https://discord.com/"), source.getString("html"), "text/html", "utf-8", null)
		} else {
			val headers = HashMap<String, String>()
			source.optJSONObject("headers")?.let { h -> h.keys().forEach { k -> headers[k] = h.getString(k) } }
			webView.loadUrl(source.getString("uri"), headers)
		}

		frames = 0
		hiddenFrames = 0
		val decorView = decor
		val preDraw = ViewTreeObserver.OnPreDrawListener {
			follow()
			true
		}
		decorView.viewTreeObserver.addOnPreDrawListener(preDraw)
		listener = preDraw
		observed = decorView
		return "ok"
	}

	/** Moves and clips the player to the thumbnail; stops when the message is gone. */
	private fun follow() {
		val frame = container ?: return
		val view = target ?: return
		if (stopping) return
		if (!view.isAttachedToWindow || !view.isShown) {
			main.post { stop("scrolled") }
			return
		}
		frames++
		if (frames % 12 == 0 && rowKey != null && keyOf(row) != rowKey) {
			main.post { stop("replaced") }
			return
		}
		val parent = frame.parent as? View ?: return
		val r = windowRect(view)
		val p = windowRect(parent)
		frame.translationX = (r.left - p.left).toFloat()
		frame.translationY = (r.top - p.top).toFloat()
		val params = frame.layoutParams
		if (params.width != r.width() || params.height != r.height()) {
			params.width = r.width()
			params.height = r.height()
			frame.layoutParams = params
		}
		// Only the part inside the chat list shows, like the message itself.
		val bounds = list?.let { windowRect(it) } ?: p
		val visible = Rect(r)
		if (!visible.intersect(bounds)) {
			frame.visibility = View.INVISIBLE
			if (++hiddenFrames > 90) main.post { stop("scrolled") }
			return
		}
		hiddenFrames = 0
		frame.visibility = View.VISIBLE
		visible.offset(-r.left, -r.top)
		frame.clipBounds = visible
	}

	/** Reads the video's time, then removes the player. */
	fun stop(reason: String) {
		val webView = web ?: return teardown(reason)
		if (stopping) return
		stopping = true
		var done = false
		val finish = {
			if (!done) {
				done = true
				teardown(reason)
			}
		}
		runCatching {
			webView.evaluateJavascript("(window.__ytTime||0)") { value ->
				lastTime = value?.trim('"')?.toDoubleOrNull() ?: lastTime
				finish()
			}
		}.onFailure { finish() }
		main.postDelayed({ finish() }, 400)
	}

	fun teardown(reason: String?) {
		listener?.let { l -> runCatching { observed?.viewTreeObserver?.removeOnPreDrawListener(l) } }
		listener = null
		observed = null
		web?.let { w ->
			runCatching {
				w.stopLoading()
				w.loadUrl("about:blank")
				(w.parent as? ViewGroup)?.removeView(w)
				w.destroy()
			}
		}
		web = null
		container?.let { c -> (c.parent as? ViewGroup)?.removeView(c) }
		container = null
		target = null
		list = null
		row = null
		rowKey = null
		stopping = false
		if (reason != null) stopped = reason
	}
}

/** Runs [block] on the main thread and returns its result to the calling coroutine. */
private suspend fun <T> onMain(block: () -> T): T = suspendCancellableCoroutine { cont ->
	Handler(Looper.getMainLooper()).post {
		try {
			cont.resume(block())
		} catch (error: Throwable) {
			cont.resumeWithException(error)
		}
	}
}

private fun number(args: List<Any?>, at: Int): Double = (args.getOrNull(at) as? Number)?.toDouble() ?: 0.0

@Suppress("UNUSED")
val embedPlayback = plugin {
	start {
		withAppActivity { activity -> Inline.activity = WeakReference(activity) }
		registerNativeAsyncMethod("embedPlayback.inline") { args ->
			onMain {
				runCatching {
					Inline.start(
						args.getOrNull(0) as? String ?: return@onMain "no video",
						args.getOrNull(1) as? String ?: return@onMain "no source",
						number(args, 2),
						number(args, 3),
						number(args, 4),
						number(args, 5),
					)
				}.getOrElse { "error: ${it.message}" }
			}
		}
		registerNativeAsyncMethod("embedPlayback.state") { _ -> onMain { Inline.stateJson() } }
		registerNativeAsyncMethod("embedPlayback.stop") { _ ->
			onMain {
				Inline.stop("closed")
				true
			}
		}
	}
	stop {
		Handler(Looper.getMainLooper()).post { Inline.teardown("closed") }
	}
}
