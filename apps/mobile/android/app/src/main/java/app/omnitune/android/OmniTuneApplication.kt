package app.omnitune.android

import android.app.Application
import android.content.Intent
import app.omnitune.android.audio.ExoAudioEngine
import app.omnitune.android.audio.OmniTunePlaybackService
import app.omnitune.android.core.AppleCatalog
import app.omnitune.android.core.ConnectClient
import app.omnitune.android.core.LibraryStore
import app.omnitune.android.core.Mix
import app.omnitune.android.core.PlayerController
import app.omnitune.android.core.RadioEngine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import java.io.File

class OmniTuneApplication : Application() {
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    lateinit var library: LibraryStore
        private set
    lateinit var catalog: AppleCatalog
        private set
    lateinit var audioEngine: ExoAudioEngine
        private set
    lateinit var player: PlayerController
        private set
    lateinit var connect: ConnectClient
        private set

    val mixesById = LinkedHashMap<String, Mix>()

    override fun onCreate() {
        super.onCreate()
        library = LibraryStore(File(filesDir, "omnitune_library.v1.json"))
        catalog = AppleCatalog(library.settings().country)
        audioEngine = ExoAudioEngine(this, appScope)
        player = PlayerController(
            engine = audioEngine,
            scope = appScope,
            getSettings = { library.settings() },
            getTaste = { library.taste() },
            autoplayProvider = { seed, taste ->
                RadioEngine.buildRadio(seed, catalog, taste, explicitFilter = library.settings().explicitFilter)
            },
            onPlayed = { event -> library.recordPlay(event) },
            getEpisodeProgress = { id -> library.episodeProgress(id) },
            onEpisodeProgress = { id, ms -> library.setEpisodeProgress(id, ms) },
        )
        connect = ConnectClient(this, appScope, library, player)
        runCatching { startService(Intent(this, OmniTunePlaybackService::class.java)) }
    }
}
