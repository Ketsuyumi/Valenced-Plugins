@file:JvmName("NoBlackout")

package dev.ketsuyumi.noblackout

import android.os.PowerManager
import app.valenced.plugins.plugin
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedHelpers

/** PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK: turns the screen off while the sensor is covered. */
private const val PROXIMITY_SCREEN_OFF = 0x20

/** The wake lock level is in the low 16 bits; flags are above. */
private const val LEVEL_MASK = 0xffff

@Volatile
private var unhook: XC_MethodHook.Unhook? = null

/**
 * No Blackout: during calls Discord holds a proximity wake lock, so the screen turns off whenever
 * the proximity sensor is covered (e.g. a finger near the top of the screen). In Discord only,
 * proximity wake locks are turned into partial wake locks: the phone stays awake for the call,
 * but the screen is never switched off by the sensor.
 */
val noBlackout = plugin {
    start {
        if (unhook != null) return@start
        unhook = XposedHelpers.findAndHookMethod(
            PowerManager::class.java,
            "newWakeLock",
            Int::class.javaPrimitiveType,
            String::class.java,
            object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam) {
                    val levelAndFlags = param.args[0] as? Int ?: return
                    if (levelAndFlags and LEVEL_MASK == PROXIMITY_SCREEN_OFF) {
                        // Flags such as ACQUIRE_CAUSES_WAKEUP aren't allowed with a partial lock.
                        param.args[0] = PowerManager.PARTIAL_WAKE_LOCK
                        log.i("Replaced proximity wake lock \"${param.args[1]}\" with a partial wake lock")
                    }
                }
            },
        )
        log.i("No Blackout: proximity screen-off disabled in calls")
    }

    stop {
        unhook?.unhook()
        unhook = null
        log.i("No Blackout: stopped")
    }
}
