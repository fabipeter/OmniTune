package app.omnitune.android.audio

import android.content.Context
import android.net.Uri
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import app.omnitune.android.core.AudioEngine
import app.omnitune.android.core.AudioEngineEvent
import app.omnitune.android.core.Track
import app.omnitune.android.core.artworkAt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Native Android audio engine backed by AndroidX Media3 ExoPlayer.
 * Connects to [OmniTunePlaybackService] for persistent media notification & lock-screen controls.
 */
class ExoAudioEngine(
    context: Context,
    private val scope: CoroutineScope,
) : AudioEngine {
    override var onEvent: ((AudioEngineEvent) -> Unit)? = null

    val exoPlayer: ExoPlayer = ExoPlayer.Builder(context)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build(),
            true,
        )
        .setHandleAudioBecomingNoisy(true)
        .build()

    private var desiredVolume = 1.0f
    private var desiredRate = 1.0f
    private var tickJob: Job? = null
    private var fadeJob: Job? = null

    init {
        exoPlayer.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                when (state) {
                    Player.STATE_BUFFERING -> onEvent?.invoke(AudioEngineEvent.State(exoPlayer.isPlaying, buffering = true))
                    Player.STATE_READY -> onEvent?.invoke(AudioEngineEvent.State(exoPlayer.isPlaying, buffering = false))
                    Player.STATE_ENDED -> onEvent?.invoke(AudioEngineEvent.Ended)
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                onEvent?.invoke(
                    AudioEngineEvent.State(
                        playing = isPlaying,
                        buffering = exoPlayer.playbackState == Player.STATE_BUFFERING,
                    )
                )
            }

            override fun onPlayerError(error: PlaybackException) {
                onEvent?.invoke(AudioEngineEvent.Error(error.message ?: "Playback error"))
            }
        })

        tickJob = scope.launch(Dispatchers.Main) {
            while (isActive) {
                delay(250)
                if (exoPlayer.mediaItemCount > 0) {
                    val pos = exoPlayer.currentPosition.coerceAtLeast(0L).toInt()
                    val dur = exoPlayer.duration.takeIf { it != C.TIME_UNSET && it > 0 }?.toInt() ?: 0
                    onEvent?.invoke(AudioEngineEvent.Time(pos, dur))
                }
            }
        }
    }

    override fun load(track: Track, autoplay: Boolean, startMs: Int?, crossfadeMs: Int) {
        val url = track.audioUrl ?: run {
            onEvent?.invoke(AudioEngineEvent.Error("No playable audio URL"))
            return
        }
        val meta = MediaMetadata.Builder()
            .setTitle(track.title)
            .setArtist(track.artistName)
            .setAlbumTitle(track.albumName)
            .setArtworkUri(artworkAt(track.artworkUrl, 500).takeIf { it.isNotBlank() }?.let(Uri::parse))
            .build()
        val item = MediaItem.Builder()
            .setMediaId(track.id)
            .setUri(url)
            .setMediaMetadata(meta)
            .build()

        scope.launch(Dispatchers.Main) {
            fadeJob?.cancel()
            exoPlayer.setMediaItem(item)
            exoPlayer.prepare()
            if (startMs != null && startMs > 0) exoPlayer.seekTo(startMs.toLong())
            exoPlayer.playbackParameters = PlaybackParameters(desiredRate)
            if (crossfadeMs > 0 && autoplay) {
                exoPlayer.volume = 0f
                exoPlayer.playWhenReady = true
                fadeJob = launch {
                    val steps = 16
                    val stepDelay = (crossfadeMs / steps).coerceAtLeast(25).toLong()
                    for (i in 1..steps) {
                        delay(stepDelay)
                        exoPlayer.volume = desiredVolume * (i.toFloat() / steps)
                    }
                    exoPlayer.volume = desiredVolume
                }
            } else {
                exoPlayer.volume = desiredVolume
                exoPlayer.playWhenReady = autoplay
            }
        }
    }

    override fun play() {
        scope.launch(Dispatchers.Main) { exoPlayer.play() }
    }

    override fun pause() {
        scope.launch(Dispatchers.Main) { exoPlayer.pause() }
    }

    override fun seek(ms: Int) {
        scope.launch(Dispatchers.Main) { exoPlayer.seekTo(ms.toLong()) }
    }

    override fun setVolume(volume: Float) {
        desiredVolume = volume.coerceIn(0f, 1f)
        scope.launch(Dispatchers.Main) { exoPlayer.volume = desiredVolume }
    }

    override fun setRate(rate: Float) {
        desiredRate = rate
        scope.launch(Dispatchers.Main) { exoPlayer.playbackParameters = PlaybackParameters(rate) }
    }

    override fun preload(track: Track) {
        // ExoPlayer dynamically buffers ahead on transition; metadata is already cached in memory.
    }

    fun release() {
        tickJob?.cancel()
        fadeJob?.cancel()
        exoPlayer.release()
    }
}
