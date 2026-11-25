package app.omnitune.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import app.omnitune.android.core.AppThemeMode
import app.omnitune.android.ui.OmniTuneRootApp
import app.omnitune.android.ui.OmniTuneTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as OmniTuneApplication
        setContent {
            val libState by app.library.state.collectAsState()
            val themeMode = libState.settings["main"]?.value?.theme ?: AppThemeMode.system
            val dark = when (themeMode) {
                AppThemeMode.system -> isSystemInDarkTheme()
                AppThemeMode.dark -> true
                AppThemeMode.light -> false
            }
            OmniTuneTheme(darkTheme = dark) {
                OmniTuneRootApp(app = app)
            }
        }
    }
}
