buildscript {
    configurations.configureEach {
        resolutionStrategy.eachDependency {
            when ("${requested.group}:${requested.name}") {
                "com.google.guava:guava" -> useVersion("33.8.0-jre")
                "com.google.protobuf:protobuf-java",
                "com.google.protobuf:protobuf-java-util" -> useVersion("3.25.9")
                "org.apache.commons:commons-compress" -> useVersion("1.28.0")
                "org.apache.commons:commons-lang3" -> useVersion("3.22.0")
                "commons-io:commons-io" -> useVersion("2.22.0")
                "commons-codec:commons-codec" -> useVersion("1.23.0")
                "commons-logging:commons-logging" -> useVersion("1.4.0")
                "org.apache.httpcomponents:httpclient",
                "org.apache.httpcomponents:httpmime" -> useVersion("4.5.14")
                "org.bouncycastle:bcprov-jdk18on",
                "org.bouncycastle:bcpkix-jdk18on",
                "org.bouncycastle:bcutil-jdk18on" -> useVersion("1.87")
                "net.java.dev.jna:jna",
                "net.java.dev.jna:jna-platform" -> useVersion("5.19.1")
                "org.jdom:jdom2" -> useVersion("2.0.6.1")
                "org.bitbucket.b_c:jose4j" -> useVersion("0.9.7")
                "org.glassfish.jaxb:jaxb-runtime",
                "org.glassfish.jaxb:txw2" -> useVersion("2.3.9")
                "jakarta.xml.bind:jakarta.xml.bind-api" -> useVersion("2.3.3")
                "com.sun.xml.fastinfoset:FastInfoset" -> useVersion("1.2.18")
                "org.jvnet.staxex:stax-ex" -> useVersion("1.8.3")
                "com.sun.istack:istack-commons-runtime" -> useVersion("3.0.12")
                "com.google.code.gson:gson" -> useVersion("2.15.0")
                "com.google.crypto.tink:tink" -> useVersion("1.24.0")
                "com.google.jimfs:jimfs" -> useVersion("1.3.2")
                "org.apache.groovy:groovy",
                "org.apache.groovy:groovy-bom" -> useVersion("4.0.33")
                "org.slf4j:slf4j-api" -> useVersion("1.7.36")
                "com.squareup.okio:okio",
                "com.squareup.okio:okio-jvm" -> useVersion("3.18.2")
            }
            if (requested.group == "org.jetbrains.kotlin" &&
                (requested.version?.startsWith("1.") == true || requested.version?.startsWith("2.") == true) &&
                requested.name != "kotlin-stdlib-jdk7" && requested.name != "kotlin-stdlib-jdk8"
            ) {
                useVersion("2.4.21")
            }
            if (requested.group == "org.jetbrains.kotlinx" && requested.name.startsWith("kotlinx-coroutines")) {
                useVersion("1.11.0")
            }
            if (requested.group == "org.ow2.asm" && requested.name.startsWith("asm")) {
                useVersion("9.11.1")
            }
            if (requested.group == "io.netty") {
                if (requested.version?.startsWith("4.1.") == true) useVersion("4.1.141.Final")
                else if (requested.version?.startsWith("4.2.") == true) useVersion("4.2.21.Final")
            }
        }
    }
}

plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}

configurations.configureEach {
    resolutionStrategy.eachDependency {
        when ("${requested.group}:${requested.name}") {
            "com.google.guava:guava" -> useVersion("33.8.0-jre")
            "com.google.protobuf:protobuf-java",
            "com.google.protobuf:protobuf-java-util" -> useVersion("3.25.9")
            "org.apache.commons:commons-compress" -> useVersion("1.28.0")
            "org.apache.commons:commons-lang3" -> useVersion("3.22.0")
            "commons-io:commons-io" -> useVersion("2.22.0")
            "commons-codec:commons-codec" -> useVersion("1.23.0")
            "commons-logging:commons-logging" -> useVersion("1.4.0")
            "org.apache.httpcomponents:httpclient",
            "org.apache.httpcomponents:httpmime" -> useVersion("4.5.14")
            "org.bouncycastle:bcprov-jdk18on",
            "org.bouncycastle:bcpkix-jdk18on",
            "org.bouncycastle:bcutil-jdk18on" -> useVersion("1.87")
            "net.java.dev.jna:jna",
            "net.java.dev.jna:jna-platform" -> useVersion("5.19.1")
            "org.jdom:jdom2" -> useVersion("2.0.6.1")
            "org.bitbucket.b_c:jose4j" -> useVersion("0.9.7")
            "org.glassfish.jaxb:jaxb-runtime",
            "org.glassfish.jaxb:txw2" -> useVersion("2.3.9")
            "jakarta.xml.bind:jakarta.xml.bind-api" -> useVersion("2.3.3")
            "com.sun.xml.fastinfoset:FastInfoset" -> useVersion("1.2.18")
            "org.jvnet.staxex:stax-ex" -> useVersion("1.8.3")
            "com.sun.istack:istack-commons-runtime" -> useVersion("3.0.12")
            "com.google.code.gson:gson" -> useVersion("2.15.0")
            "com.google.crypto.tink:tink" -> useVersion("1.24.0")
            "com.google.jimfs:jimfs" -> useVersion("1.3.2")
            "org.apache.groovy:groovy",
            "org.apache.groovy:groovy-bom" -> useVersion("4.0.33")
            "org.slf4j:slf4j-api" -> useVersion("1.7.36")
            "com.squareup.okio:okio",
            "com.squareup.okio:okio-jvm" -> useVersion("3.18.2")
        }
        if (requested.group == "org.jetbrains.kotlin" &&
            (requested.version?.startsWith("1.") == true || requested.version?.startsWith("2.") == true) &&
            requested.name != "kotlin-stdlib-jdk7" && requested.name != "kotlin-stdlib-jdk8"
        ) {
            useVersion("2.4.21")
        }
        if (requested.group == "org.jetbrains.kotlinx" && requested.name.startsWith("kotlinx-coroutines")) {
            useVersion("1.11.0")
        }
        if (requested.group == "org.ow2.asm" && requested.name.startsWith("asm")) {
            useVersion("9.11.1")
        }
        if (requested.group == "io.netty") {
            if (requested.version?.startsWith("4.1.") == true) useVersion("4.1.141.Final")
            else if (requested.version?.startsWith("4.2.") == true) useVersion("4.2.21.Final")
        }
    }
}
