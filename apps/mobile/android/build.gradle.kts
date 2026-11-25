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
                "org.apache.httpcomponents:httpclient",
                "org.apache.httpcomponents:httpmime" -> useVersion("4.5.14")
                "org.bouncycastle:bcprov-jdk18on",
                "org.bouncycastle:bcpkix-jdk18on",
                "org.bouncycastle:bcutil-jdk18on" -> useVersion("1.87")
                "net.java.dev.jna:jna",
                "net.java.dev.jna:jna-platform" -> useVersion("5.19.1")
                "org.jdom:jdom2" -> useVersion("2.0.6.1")
                "org.bitbucket.b_c:jose4j" -> useVersion("0.9.7")
            }
            if (requested.group == "io.netty" && requested.version?.startsWith("4.1.") == true) {
                useVersion("4.1.141.Final")
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
            "org.apache.httpcomponents:httpclient",
            "org.apache.httpcomponents:httpmime" -> useVersion("4.5.14")
            "org.bouncycastle:bcprov-jdk18on",
            "org.bouncycastle:bcpkix-jdk18on",
            "org.bouncycastle:bcutil-jdk18on" -> useVersion("1.87")
            "net.java.dev.jna:jna",
            "net.java.dev.jna:jna-platform" -> useVersion("5.19.1")
            "org.jdom:jdom2" -> useVersion("2.0.6.1")
            "org.bitbucket.b_c:jose4j" -> useVersion("0.9.7")
        }
        if (requested.group == "io.netty" && requested.version?.startsWith("4.1.") == true) {
            useVersion("4.1.141.Final")
        }
    }
}
