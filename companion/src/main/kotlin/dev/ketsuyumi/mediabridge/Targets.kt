package dev.ketsuyumi.mediabridge

import android.content.Context
import android.content.pm.PackageManager

/** The Discord installs that said hello, remembered across restarts of this app. */
class Targets(private val context: Context) {
    private val prefs = context.getSharedPreferences("targets", Context.MODE_PRIVATE)

    fun all(): Set<String> = prefs.getStringSet(KEY, emptySet()).orEmpty().toSet()

    /** Returns true if the package is new. */
    fun add(packageName: String): Boolean {
        val current = all()
        if (packageName in current) return false
        prefs.edit().putStringSet(KEY, current + packageName).apply()
        return true
    }

    fun remove(packageName: String) {
        prefs.edit().putStringSet(KEY, all() - packageName).apply()
    }

    /** Known targets that are still installed; uninstalled ones are forgotten. */
    fun installed(): Set<String> {
        val result = mutableSetOf<String>()
        for (target in all()) {
            val present = runCatching { context.packageManager.getPackageInfo(target, 0) }.isSuccess
            if (present) result += target else remove(target)
        }
        return result
    }

    companion object {
        private const val KEY = "packages"

        fun labelOf(context: Context, packageName: String): String = runCatching {
            val pm = context.packageManager
            pm.getApplicationLabel(pm.getApplicationInfo(packageName, PackageManager.GET_META_DATA)).toString()
        }.getOrDefault(packageName)
    }
}
