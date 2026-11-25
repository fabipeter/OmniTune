package app.omnitune.android

import app.omnitune.android.core.AudioEngine
import app.omnitune.android.core.AudioEngineEvent
import app.omnitune.android.core.LibraryStore
import app.omnitune.android.core.LrcLib
import app.omnitune.android.core.PlayerController
import app.omnitune.android.core.SmartShuffle
import app.omnitune.android.core.Track
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

private class FakeEngine : AudioEngine {
    override var onEvent: ((AudioEngineEvent) -> Unit)? = null
    var loaded: Track? = null
    override fun load(track: Track, autoplay: Boolean, startMs: Int?, crossfadeMs: Int) {
        loaded = track
        onEvent?.invoke(AudioEngineEvent.State(autoplay, false))
        onEvent?.invoke(AudioEngineEvent.Time(startMs ?: 0, track.durationMs))
    }
    override fun play() = onEvent?.invoke(AudioEngineEvent.State(true, false)) ?: Unit
    override fun pause() = onEvent?.invoke(AudioEngineEvent.State(false, false)) ?: Unit
    override fun seek(ms: Int) = onEvent?.invoke(AudioEngineEvent.Time(ms, loaded?.durationMs ?: 0)) ?: Unit
    override fun setVolume(volume: Float) {}
    override fun setRate(rate: Float) {}
    override fun preload(track: Track) {}
}

class CoreUnitTest {
    private fun mk(id: String, artist: String) =
        Track(id = id, title = "Song $id", artistName = artist, albumId = "alb-$artist", audioUrl = "https://x/$id.m4a")

    @Test
    fun smartShuffleSpreadsArtistsAndPinsStart() {
        val tracks = (0 until 50).map { mk("$it", "Artist ${it % 10}") }
        repeat(15) { seed ->
            val rng = Random(seed + 1)
            val out = SmartShuffle.shuffle(tracks, startWith = tracks[3], rng = { rng.nextDouble() })
            assertEquals(50, out.size)
            assertEquals("3", out.first().id)
            for (i in 1 until out.size) assertNotEquals(out[i].artistName, out[i - 1].artistName)
        }
    }

    @Test
    fun lrcParsesAndFindsActiveLine() {
        val lines = LrcLib.parseLrc("[00:01.50] First\n[00:08.00] Second\n")
        assertEquals(2, lines.size)
        assertEquals(-1, LrcLib.activeIndex(lines, 500))
        assertEquals(0, LrcLib.activeIndex(lines, 1500))
        assertEquals(1, LrcLib.activeIndex(lines, 9500))
    }

    @Test
    fun playerPlaysExplicitQueueBeforeContext() = runTest {
        val engine = FakeEngine()
        val player = PlayerController(engine, backgroundScope)
        val tracks = (0 until 4).map { mk("$it", "A$it") }
        player.play(tracks, startIndex = 0)
        assertEquals("0", player.state.value.current?.id)
        player.addToQueue(mk("q1", "Q"))
        player.playNext(mk("q0", "Q"))
        player.next()
        testScheduler.advanceUntilIdle()
        assertEquals("q0", player.state.value.current?.id)
    }

    @Test
    fun libraryLikesAndPlaylists() {
        val lib = LibraryStore(null)
        val t = mk("1", "Daft Punk")
        assertTrue(lib.toggleLike(t))
        assertTrue(lib.isLiked("1"))
        val pl = lib.createPlaylist("Focus", listOf(t))
        assertEquals(1, lib.playlist(pl.id)?.tracks?.size)
    }
}
