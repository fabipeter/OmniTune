package app.omnitune.android.audio

import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import app.omnitune.android.OmniTuneApplication

/**
 * Foreground Media3 MediaSessionService enabling background audio, lock-screen controls,
 * Bluetooth headset commands, and system media notification on Android.
 */
class OmniTunePlaybackService : MediaSessionService() {
    private var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val app = application as OmniTuneApplication
        mediaSession = MediaSession.Builder(this, app.audioEngine.exoPlayer).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onDestroy() {
        mediaSession?.release()
        mediaSession = null
        super.onDestroy()
    }
}
