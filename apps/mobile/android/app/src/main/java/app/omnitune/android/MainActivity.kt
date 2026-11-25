package app.omnitune.android

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import app.omnitune.android.core.AppThemeMode
import app.omnitune.android.ui.OmniTuneRootApp
import app.omnitune.android.ui.OmniTuneTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        val app = application as OmniTuneApplication
        setContent {
            val libState by app.library.state.collectAsState()
            val themeMode = libState.settings["main"]?.value?.theme ?: AppThemeMode.dark
            val dark = when (themeMode) {
                AppThemeMode.system -> true
                AppThemeMode.dark -> true
                AppThemeMode.light -> false
            }
            LaunchedEffect(dark) {
                val style = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
                enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
            }
            OmniTuneTheme(darkTheme = dark) {
                OmniTuneRootApp(app = app)
            }
        }
    }
}
