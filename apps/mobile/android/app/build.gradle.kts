import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

configurations.configureEach {
    val isAndroidConfig = name.contains("CompileClasspath", ignoreCase = true) ||
        name.contains("RuntimeClasspath", ignoreCase = true)
    resolutionStrategy.eachDependency {
        when ("${requested.group}:${requested.name}") {
            "com.google.guava:guava" -> {
                val ver = requested.version.orEmpty()
                useVersion(if (ver.endsWith("-android") || isAndroidConfig) "33.8.0-android" else "33.8.0-jre")
            }
            "com.google.protobuf:protobuf-java",
            "com.google.protobuf:protobuf-java-util" -> useVersion("3.25.9")
            "org.apache.commons:commons-compress" -> useVersion("1.28.0")
            "org.apache.commons:commons-lang3" -> useVersion("3.22.0")
            "commons-io:commons-io" -> useVersion("2.22.0")
            "commons-codec:commons-codec" -> useVersion("1.23.0")
            "org.apache.httpcomponents:httpclient",
            "org.apache.httpcomponents:httpmime" -> useVersion("4.5.14")
            "org.bouncycastle:bcprov-jdk18on",
            "org.bouncycastle:bcpkix-jdk18on",
            "org.bouncycastle:bcutil-jdk18on" -> useVersion("1.87")
            "net.java.dev.jna:jna",
            "net.java.dev.jna:jna-platform" -> useVersion("5.19.1")
            "org.jdom:jdom2" -> useVersion("2.0.6.1")
            "org.bitbucket.b_c:jose4j" -> useVersion("0.9.7")
            "com.squareup.okio:okio",
            "com.squareup.okio:okio-jvm" -> useVersion("3.18.1")
        }
        if (requested.group == "io.netty" && requested.version?.startsWith("4.1.") == true) {
            useVersion("4.1.141.Final")
        }
    }
}

android {
    namespace = "app.omnitune.android"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.omnitune.android"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
    }
    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.session)
    implementation(libs.androidx.media3.ui)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}
