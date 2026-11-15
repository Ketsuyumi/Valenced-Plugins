// Media Bridge: companion app for the Media Controls Valenced plugin.
// It has notification access, follows the media session that is playing and relays it to Discord.

plugins {
    id("com.android.application") version "9.1.1"
    // AGP 9 compiles Kotlin itself; this only puts the Kotlin Gradle plugin on the classpath.
    id("org.jetbrains.kotlin.android") version "2.4.10" apply false
}

val javaVersion = 25

android {
    namespace = "dev.ketsuyumi.mediabridge"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.ketsuyumi.mediabridge"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    // Release signing comes from the environment (CI secrets). Without it, the debug key is used,
    // which changes between machines: then the app must be uninstalled before an update.
    val keystore = System.getenv("MEDIA_BRIDGE_KEYSTORE")
    signingConfigs {
        if (keystore != null) {
            create("release") {
                storeFile = file(keystore)
                storePassword = System.getenv("MEDIA_BRIDGE_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("MEDIA_BRIDGE_KEY_ALIAS")
                keyPassword = System.getenv("MEDIA_BRIDGE_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.toVersion(javaVersion)
        targetCompatibility = JavaVersion.toVersion(javaVersion)
    }

    sourceSets {
        named("main") { kotlin.directories += "src/main/kotlin" }
    }

    // QUERY_ALL_PACKAGES is deliberate (sideloaded app; it needs to reach any Discord build).
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

kotlin {
    jvmToolchain(javaVersion)
}

dependencies {
    // MediaControllerCompat: shuffle and repeat modes, which the platform controller doesn't expose.
    implementation("androidx.media:media:1.7.0")
}
