package app.omnitune.android.core

import android.content.Context
import android.os.Build
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder
import java.util.UUID
import java.util.concurrent.TimeUnit

@Serializable
data class PlayerSession(
    val current: Track? = null,
    val context: PlaybackContext? = null,
    val order: List<Track> = emptyList(),
    val original: List<Track> = emptyList(),
    val index: Int = 0,
    val userQueue: List<QueueItem> = emptyList(),
    val shuffle: Boolean = false,
    val repeat: RepeatMode = RepeatMode.off,
    val volume: Double = 1.0,
    val positionMs: Int = 0,
)

@Serializable
data class ConnectTrackSummary(
    val id: String,
    val title: String,
    val artistName: String,
    val artworkUrl: String = "",
)

@Serializable
data class ConnectDevice(
    val id: String,
    val name: String,
    val type: String,
    val isActive: Boolean = false,
    val volume: Double = 1.0,
    val playing: Boolean = false,
    val positionMs: Int = 0,
    val durationMs: Int = 0,
    val currentTrack: ConnectTrackSummary? = null,
    val lastSeen: Long = 0L,
)

data class ConnectUiState(
    val connected: Boolean = false,
    val thisDeviceId: String = "",
    val thisDeviceName: String = "",
    val activeDeviceId: String? = null,
    val devices: List<ConnectDevice> = emptyList(),
    val roomCode: String = "local",
) {
    val remoteActiveDevice: ConnectDevice?
        get() = activeDeviceId?.takeIf { it != thisDeviceId }?.let { id -> devices.firstOrNull { it.id == id } }
}

/** OmniTune Connect real-time device switching & remote control client for native Android. */
class ConnectClient(
    context: Context,
    private val scope: CoroutineScope,
    private val library: LibraryStore,
    private val player: PlayerController,
) {
    private val prefs = context.getSharedPreferences("omnitune_connect", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS) // infinite read timeout for SSE stream
        .build()

    private val deviceId: String = prefs.getString("deviceId", null) ?: "and_${UUID.randomUUID().toString().take(10)}".also {
        prefs.edit().putString("deviceId", it).apply()
    }
    private val deviceName: String = "${Build.MANUFACTURER} ${Build.MODEL}".trim().ifBlank { "Android Phone" }

    private val _state = MutableStateFlow(
        ConnectUiState(
            thisDeviceId = deviceId,
            thisDeviceName = deviceName,
            roomCode = prefs.getString("room", "local") ?: "local",
        )
    )
    val state: StateFlow<ConnectUiState> = _state.asStateFlow()

    private var streamJob: Job? = null
    private var heartbeatJob: Job? = null

    init {
        start()
    }

    fun setRoomCode(code: String) {
        val clean = code.trim().lowercase().replace(Regex("[^a-z0-9_-]"), "").ifEmpty { "local" }
        prefs.edit().putString("room", clean).apply()
        _state.value = _state.value.copy(roomCode = clean)
        reconnect()
    }

    fun reconnect() {
        streamJob?.cancel()
        heartbeatJob?.cancel()
        start()
    }

    private fun baseUrl(): String = library.settings().serverUrl.trimEnd('/')

    private fun start() {
        streamJob = scope.launch(Dispatchers.IO) {
            while (isActive) {
                runCatching { streamOnce() }
                _state.value = _state.value.copy(connected = false)
                delay(5000)
            }
        }
        heartbeatJob = scope.launch(Dispatchers.IO) {
            while (isActive) {
                delay(3000)
                if (_state.value.connected && player.state.value.playing) {
                    pushState(claimActive = false)
                }
            }
        }
    }

    private suspend fun streamOnce() {
        fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
        val tok = library.token()
        val qs = "deviceId=${enc(deviceId)}&name=${enc(deviceName)}&type=android&room=${enc(_state.value.roomCode)}"
        val reqBuilder = Request.Builder().url("${baseUrl()}/connect/events?$qs")
        if (!tok.isNullOrBlank()) reqBuilder.header("Authorization", "Bearer $tok")
        val req = reqBuilder.build()
        http.newCall(req).execute().use { res ->
            if (!res.isSuccessful) return
            _state.value = _state.value.copy(connected = true)
            if (player.state.value.current != null) pushState(claimActive = player.state.value.playing)

            val source = res.body.source()
            var eventName = ""
            while (!source.exhausted()) {
                val line = source.readUtf8Line() ?: break
                when {
                    line.startsWith("event:") -> eventName = line.removePrefix("event:").trim()
                    line.startsWith("data:") -> {
                        handleEvent(eventName, line.removePrefix("data:").trim())
                        eventName = ""
                    }
                }
            }
        }
    }

    @Serializable private data class DevicesEvent(val devices: List<ConnectDevice> = emptyList(), val activeDeviceId: String? = null)
    @Serializable private data class TransferInEvent(val session: PlayerSession? = null, val autoplay: Boolean = true)
    @Serializable private data class CommandEvent(val command: String, val value: Double? = null)

    private suspend fun handleEvent(event: String, data: String) {
        when (event) {
            "devices" -> runCatching {
                val parsed = json.decodeFromString<DevicesEvent>(data)
                _state.value = _state.value.copy(connected = true, devices = parsed.devices, activeDeviceId = parsed.activeDeviceId)
            }
            "transfer-in" -> runCatching {
                val parsed = json.decodeFromString<TransferInEvent>(data)
                if (parsed.session != null) {
                    withContext(Dispatchers.Main) { player.restore(parsed.session, autoplay = parsed.autoplay) }
                }
            }
            "pause-handoff" -> withContext(Dispatchers.Main) { player.pause() }
            "command" -> runCatching {
                val c = json.decodeFromString<CommandEvent>(data)
                withContext(Dispatchers.Main) {
                    when (c.command) {
                        "toggle" -> player.toggle()
                        "play" -> player.resume()
                        "pause" -> player.pause()
                        "next" -> player.next()
                        "previous" -> player.previous()
                        "seek" -> c.value?.let { player.seek(it.toInt()) }
                        "shuffle" -> player.toggleShuffle()
                        "repeat" -> player.cycleRepeat()
                    }
                }
                pushState(claimActive = false)
            }
        }
    }

    @Serializable
    private data class StatePayload(
        val deviceId: String,
        val room: String,
        val name: String,
        val type: String,
        val playing: Boolean,
        val positionMs: Int,
        val durationMs: Int,
        val volume: Double,
        val currentTrack: ConnectTrackSummary?,
        val session: PlayerSession?,
        val claimActive: Boolean,
    )

    suspend fun pushState(claimActive: Boolean) = withContext(Dispatchers.IO) {
        if (!_state.value.connected) return@withContext
        val ps = player.state.value
        val cur = ps.current
        val body = StatePayload(
            deviceId = deviceId,
            room = _state.value.roomCode,
            name = deviceName,
            type = "android",
            playing = ps.playing,
            positionMs = ps.positionMs,
            durationMs = ps.durationMs,
            volume = 1.0,
            currentTrack = cur?.let { ConnectTrackSummary(it.id, it.title, it.artistName, it.artworkUrl) },
            session = if (cur != null) player.snapshot() else null,
            claimActive = claimActive,
        )
        postJson("/connect/state", json.encodeToString(body))
    }

    @Serializable
    private data class TransferPayload(
        val fromDeviceId: String,
        val targetDeviceId: String,
        val room: String,
        val session: PlayerSession?,
        val autoplay: Boolean,
    )

    suspend fun transferTo(targetDeviceId: String, autoplay: Boolean = true) = withContext(Dispatchers.IO) {
        val localSnap = if (_state.value.activeDeviceId == deviceId && player.state.value.current != null) player.snapshot() else null
        val payload = TransferPayload(deviceId, targetDeviceId, _state.value.roomCode, localSnap, autoplay)
        postJson("/connect/transfer", json.encodeToString(payload))
    }

    @Serializable
    private data class CommandPayload(val targetDeviceId: String, val room: String, val command: String, val value: Double? = null)

    suspend fun sendCommand(targetDeviceId: String, command: String, value: Double? = null) = withContext(Dispatchers.IO) {
        postJson("/connect/command", json.encodeToString(CommandPayload(targetDeviceId, _state.value.roomCode, command, value)))
    }

    private fun postJson(path: String, jsonBody: String) {
        val builder = Request.Builder()
            .url("${baseUrl()}$path")
            .post(jsonBody.toRequestBody("application/json".toMediaType()))
        library.token()?.let { builder.header("Authorization", "Bearer $it") }
        runCatching { http.newCall(builder.build()).execute().close() }
    }
}
