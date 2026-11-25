package app.omnitune.android.core

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface AudioEngineEvent {
    data class Time(val positionMs: Int, val durationMs: Int) : AudioEngineEvent
    data class State(val playing: Boolean, val buffering: Boolean) : AudioEngineEvent
    data object Ended : AudioEngineEvent
    data class Error(val message: String) : AudioEngineEvent
}

interface AudioEngine {
    var onEvent: ((AudioEngineEvent) -> Unit)?
    fun load(track: Track, autoplay: Boolean = true, startMs: Int? = null, crossfadeMs: Int = 0)
    fun play()
    fun pause()
    fun seek(ms: Int)
    fun setVolume(volume: Float)
    fun setRate(rate: Float)
    fun preload(track: Track)
}

data class PlayerUiState(
    val current: Track? = null,
    val context: PlaybackContext? = null,
    val playing: Boolean = false,
    val buffering: Boolean = false,
    val shuffle: Boolean = false,
    val repeatMode: RepeatMode = RepeatMode.off,
    val rate: Float = 1.0f,
    val positionMs: Int = 0,
    val durationMs: Int = 0,
    val userQueue: List<QueueItem> = emptyList(),
    val upNext: List<Track> = emptyList(),
    val sleepActive: Boolean = false,
    val error: String? = null,
)

/** Playback controller matching OmniTune queue semantics + Smart Shuffle + Autoplay Radio. */
class PlayerController(
    private val engine: AudioEngine,
    private val scope: CoroutineScope,
    private val getSettings: () -> AppSettings = { AppSettings() },
    private val getTaste: () -> TasteProfile = { TasteProfile.build(emptyList()) },
    private val autoplayProvider: (suspend (Track, TasteProfile) -> List<Track>)? = null,
    private val onPlayed: ((HistoryEvent) -> Unit)? = null,
    private val getEpisodeProgress: ((String) -> Int)? = null,
    private val onEpisodeProgress: ((String, Int) -> Unit)? = null,
) {
    private val _state = MutableStateFlow(PlayerUiState())
    val state: StateFlow<PlayerUiState> = _state.asStateFlow()

    private var original: List<Track> = emptyList()
    private var order: List<Track> = emptyList()
    private var index: Int = -1
    private val userQueue = ArrayList<QueueItem>()
    private val prevStack = ArrayList<Triple<Track, Int, Boolean>>()
    private var currentFromQueue = false
    private var startedAtMs = 0L
    private var listenedMs = 0
    private var lastPosMs = 0
    private var crossfadeFired = false
    private var sleepEndOfTrack = false
    private var sleepJob: Job? = null

    init {
        engine.onEvent = ::handleEngine
    }

    fun play(tracks: List<Track>, startIndex: Int? = null, context: PlaybackContext? = null, shuffle: Boolean? = null) {
        val settings = getSettings()
        val playable = tracks.filter { it.audioUrl != null && !(settings.explicitFilter && it.explicit) }
        if (playable.isEmpty()) return
        val wanted = startIndex?.let { tracks.getOrNull(it) }
        val start = wanted?.let { w -> playable.firstOrNull { it.id == w.id } } ?: playable.first()
        val useShuffle = shuffle ?: _state.value.shuffle
        original = playable
        order = if (useShuffle) makeShuffled(playable, if (startIndex != null) start else null) else playable
        val idx = if (useShuffle && startIndex == null) 0 else order.indexOfFirst { it.id == start.id }.coerceAtLeast(0)
        _state.value = _state.value.copy(shuffle = useShuffle, context = context)
        startTrack(order[idx], ctxIndex = idx, fromQueue = false)
    }

    fun playTrack(track: Track, context: PlaybackContext? = null) =
        play(listOf(track), startIndex = 0, context = context ?: PlaybackContext("unknown"), shuffle = false)

    private fun makeShuffled(list: List<Track>, startWith: Track?): List<Track> {
        if (getSettings().shuffleMode == ShuffleMode.random) {
            val rest = SmartShuffle.fisherYates(list.filter { it.id != startWith?.id })
            return if (startWith != null) listOf(startWith) + rest else rest
        }
        return SmartShuffle.shuffle(list, taste = getTaste(), startWith = startWith)
    }

    private fun startTrack(track: Track, ctxIndex: Int, fromQueue: Boolean, crossfadeMs: Int = 0) {
        finishCurrent(skipped = false)
        if (!fromQueue) index = ctxIndex
        currentFromQueue = fromQueue
        startedAtMs = System.currentTimeMillis()
        listenedMs = 0
        lastPosMs = 0
        crossfadeFired = false
        val resumeMs = if (track.kind == TrackKind.episode) {
            getEpisodeProgress?.invoke(track.id)?.takeIf { it > 5000 && it < track.durationMs - 15000 }
        } else null
        syncUi(current = track, pos = resumeMs ?: 0, dur = track.durationMs, buffering = true, err = null)
        engine.load(track, autoplay = true, startMs = resumeMs, crossfadeMs = crossfadeMs)
        engine.setRate(_state.value.rate)
        peekNext()?.let(engine::preload)
    }

    fun toggle() {
        if (_state.value.current == null) return
        if (_state.value.playing) engine.pause() else engine.play()
    }

    fun pause() = engine.pause()
    fun resume() { if (_state.value.current != null) engine.play() }

    fun seek(ms: Int) {
        val clamped = ms.coerceIn(0, maxOf(_state.value.durationMs, ms))
        lastPosMs = clamped
        _state.value = _state.value.copy(positionMs = clamped)
        engine.seek(clamped)
    }

    fun seekBy(deltaMs: Int) = seek(_state.value.positionMs + deltaMs)

    fun next() { advance(skipped = true, crossfadeMs = 0) }

    fun previous() {
        val leaving = _state.value.current ?: return
        if (_state.value.positionMs > 3000 || prevStack.isEmpty()) {
            seek(0)
            if (!_state.value.playing) engine.play()
            return
        }
        finishCurrent(skipped = true)
        val (backTrack, backIdx, backFromQueue) = prevStack.removeAt(prevStack.lastIndex)
        if (currentFromQueue) userQueue.add(0, QueueItem(track = leaving))
        index = if (backFromQueue) maxOf(-1, if (currentFromQueue) index else index - 1) else backIdx
        startTrack(backTrack, ctxIndex = index, fromQueue = backFromQueue)
    }

    fun toggleShuffle() {
        val on = !_state.value.shuffle
        if (on && order.isNotEmpty()) {
            val head = order.take(index + 1)
            val rest = order.drop(index + 1)
            order = head + makeShuffled(rest, null)
        } else if (!on && original.isNotEmpty()) {
            val cur = _state.value.current
            order = original
            if (cur != null) index = original.indexOfFirst { it.id == cur.id }.coerceAtLeast(0)
        }
        _state.value = _state.value.copy(shuffle = on)
        syncUi()
    }

    fun cycleRepeat() {
        val next = when (_state.value.repeatMode) {
            RepeatMode.off -> RepeatMode.all
            RepeatMode.all -> RepeatMode.one
            RepeatMode.one -> RepeatMode.off
        }
        _state.value = _state.value.copy(repeatMode = next)
    }

    fun setRate(rate: Float) {
        _state.value = _state.value.copy(rate = rate)
        engine.setRate(rate)
    }

    fun addToQueue(track: Track) {
        if (track.audioUrl == null) return
        userQueue.add(QueueItem(track = track))
        syncUi()
    }

    fun playNext(track: Track) {
        if (track.audioUrl == null) return
        userQueue.add(0, QueueItem(track = track))
        syncUi()
    }

    fun removeQueueItem(uid: String) {
        userQueue.removeAll { it.uid == uid }
        syncUi()
    }

    fun clearQueue() {
        userQueue.clear()
        syncUi()
    }

    fun skipToQueueItem(uid: String) {
        val i = userQueue.indexOfFirst { it.uid == uid }
        val cur = _state.value.current ?: return
        if (i < 0) return
        val item = userQueue[i]
        repeat(i + 1) { userQueue.removeAt(0) }
        prevStack.add(Triple(cur, index, currentFromQueue))
        startTrack(item.track, ctxIndex = index, fromQueue = true)
    }

    fun skipToUpNext(offset: Int) {
        val target = index + 1 + offset
        val cur = _state.value.current ?: return
        if (target !in order.indices) return
        prevStack.add(Triple(cur, index, currentFromQueue))
        startTrack(order[target], ctxIndex = target, fromQueue = false)
    }

    fun setSleepTimer(minutes: Int?) {
        sleepJob?.cancel()
        sleepEndOfTrack = false
        if (minutes == null) {
            _state.value = _state.value.copy(sleepActive = false)
            return
        }
        _state.value = _state.value.copy(sleepActive = true)
        sleepJob = scope.launch {
            delay(minutes * 60_000L)
            engine.pause()
            _state.value = _state.value.copy(sleepActive = false)
        }
    }

    fun setSleepEndOfTrack() {
        sleepJob?.cancel()
        sleepEndOfTrack = true
        _state.value = _state.value.copy(sleepActive = true)
    }

    fun snapshot(): PlayerSession = PlayerSession(
        current = _state.value.current,
        context = _state.value.context,
        order = order,
        original = original,
        index = index,
        userQueue = userQueue.toList(),
        shuffle = _state.value.shuffle,
        repeat = _state.value.repeatMode,
        volume = 1.0,
        positionMs = _state.value.positionMs,
    )

    fun restore(session: PlayerSession, autoplay: Boolean = false) {
        order = session.order.ifEmpty { listOfNotNull(session.current) }
        original = session.original.ifEmpty { order }
        userQueue.clear()
        userQueue.addAll(session.userQueue)
        index = session.index.coerceIn(0, maxOf(0, order.lastIndex))
        _state.value = _state.value.copy(
            shuffle = session.shuffle,
            repeatMode = session.repeat,
            context = session.context,
        )
        val cur = session.current
        if (cur != null) {
            currentFromQueue = false
            lastPosMs = session.positionMs
            syncUi(current = cur, pos = session.positionMs, dur = cur.durationMs, buffering = autoplay, err = null)
            engine.load(cur, autoplay = autoplay, startMs = session.positionMs, crossfadeMs = 0)
        } else {
            syncUi()
        }
    }

    private fun peekNext(): Track? = when {
        _state.value.repeatMode == RepeatMode.one -> _state.value.current
        userQueue.isNotEmpty() -> userQueue.first().track
        index + 1 < order.size -> order[index + 1]
        _state.value.repeatMode == RepeatMode.all -> order.firstOrNull()
        else -> null
    }

    private fun advance(skipped: Boolean, crossfadeMs: Int) {
        val cur = _state.value.current ?: return
        finishCurrent(skipped = skipped)
        if (userQueue.isNotEmpty()) {
            val item = userQueue.removeAt(0)
            prevStack.add(Triple(cur, index, currentFromQueue))
            startTrack(item.track, ctxIndex = index, fromQueue = true, crossfadeMs = crossfadeMs)
            return
        }
        if (index + 1 < order.size) {
            prevStack.add(Triple(cur, index, currentFromQueue))
            startTrack(order[index + 1], ctxIndex = index + 1, fromQueue = false, crossfadeMs = crossfadeMs)
            return
        }
        if (_state.value.repeatMode == RepeatMode.all && order.isNotEmpty()) {
            prevStack.add(Triple(cur, index, currentFromQueue))
            if (_state.value.shuffle) order = makeShuffled(original, null)
            startTrack(order[0], ctxIndex = 0, fromQueue = false, crossfadeMs = crossfadeMs)
            return
        }
        val provider = autoplayProvider
        if (getSettings().autoplay && provider != null) {
            scope.launch {
                val more = runCatching { provider(cur, getTaste()) }.getOrDefault(emptyList())
                if (more.isNotEmpty()) {
                    prevStack.add(Triple(cur, index, currentFromQueue))
                    original = more
                    order = more
                    _state.value = _state.value.copy(context = PlaybackContext("radio", name = "Radio · ${cur.artistName}"))
                    startTrack(more[0], ctxIndex = 0, fromQueue = false, crossfadeMs = crossfadeMs)
                } else {
                    engine.pause()
                    engine.seek(0)
                    _state.value = _state.value.copy(playing = false, positionMs = 0)
                }
            }
            return
        }
        engine.pause()
        engine.seek(0)
        _state.value = _state.value.copy(playing = false, positionMs = 0)
    }

    private fun finishCurrent(skipped: Boolean) {
        val cur = _state.value.current ?: return
        val dur = maxOf(_state.value.durationMs, cur.durationMs)
        if (listenedMs > 1500) {
            val completed = listenedMs >= dur * 0.85
            onPlayed?.invoke(
                HistoryEvent(
                    id = "$startedAtMs-${cur.id}",
                    track = cur,
                    playedAt = startedAtMs,
                    listenedMs = listenedMs,
                    completed = completed,
                    skipped = skipped && !completed && listenedMs < 30_000,
                    contextType = _state.value.context?.type,
                    contextId = _state.value.context?.id,
                )
            )
        }
        listenedMs = 0
    }

    private fun handleEngine(e: AudioEngineEvent) {
        when (e) {
            is AudioEngineEvent.State -> _state.value = _state.value.copy(playing = e.playing, buffering = e.buffering)
            is AudioEngineEvent.Time -> {
                val delta = e.positionMs - lastPosMs
                if (_state.value.playing && delta in 1..2500) listenedMs += delta
                lastPosMs = e.positionMs
                val dur = if (e.durationMs > 0) e.durationMs else _state.value.durationMs
                _state.value = _state.value.copy(positionMs = e.positionMs, durationMs = dur)
                val cf = getSettings().crossfadeMs
                if (cf > 0 && !crossfadeFired && dur > 0 && _state.value.repeatMode != RepeatMode.one && !sleepEndOfTrack) {
                    val rem = dur - e.positionMs
                    if (rem in 1..cf && e.positionMs > cf) {
                        crossfadeFired = true
                        advance(skipped = false, crossfadeMs = cf)
                    }
                }
                val cur = _state.value.current
                if (cur != null && cur.kind == TrackKind.episode && e.positionMs % 5000 < 400) {
                    onEpisodeProgress?.invoke(cur.id, e.positionMs)
                }
            }
            AudioEngineEvent.Ended -> {
                if (crossfadeFired) return
                if (sleepEndOfTrack) {
                    sleepEndOfTrack = false
                    finishCurrent(skipped = false)
                    engine.pause()
                    _state.value = _state.value.copy(playing = false, sleepActive = false)
                    return
                }
                if (_state.value.repeatMode == RepeatMode.one) {
                    finishCurrent(skipped = false)
                    engine.seek(0)
                    engine.play()
                    return
                }
                advance(skipped = false, crossfadeMs = 0)
            }
            is AudioEngineEvent.Error -> _state.value = _state.value.copy(error = e.message, buffering = false)
        }
    }

    private fun syncUi(
        current: Track? = _state.value.current,
        pos: Int = _state.value.positionMs,
        dur: Int = _state.value.durationMs,
        buffering: Boolean = _state.value.buffering,
        err: String? = _state.value.error,
    ) {
        val up = if (index + 1 < order.size) order.subList(index + 1, minOf(order.size, index + 61)) else emptyList()
        _state.value = _state.value.copy(
            current = current,
            positionMs = pos,
            durationMs = dur,
            buffering = buffering,
            error = err,
            userQueue = userQueue.toList(),
            upNext = up,
        )
    }
}
