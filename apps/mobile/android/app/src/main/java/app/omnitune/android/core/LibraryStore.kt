package app.omnitune.android.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File
import java.util.UUID

@Serializable
data class SyncEntry<T>(
    val id: String,
    val value: T? = null,
    val updatedAt: Long,
    val deleted: Boolean? = null,
)

@Serializable
data class LibrarySnapshotFile(
    val likedTracks: Map<String, SyncEntry<Track>> = emptyMap(),
    val savedAlbums: Map<String, SyncEntry<Album>> = emptyMap(),
    val followedArtists: Map<String, SyncEntry<Artist>> = emptyMap(),
    val followedPodcasts: Map<String, SyncEntry<Podcast>> = emptyMap(),
    val playlists: Map<String, SyncEntry<Playlist>> = emptyMap(),
    val history: Map<String, SyncEntry<HistoryEvent>> = emptyMap(),
    val episodeProgress: Map<String, SyncEntry<Int>> = emptyMap(),
    val settings: Map<String, SyncEntry<AppSettings>> = emptyMap(),
    val recentSearches: List<String> = emptyList(),
)

/** Local-first library persisted as JSON on disk + LWW sync against apps/server. */
class LibraryStore(private val storageFile: File? = null) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val http = OkHttpClient()

    private val _state = MutableStateFlow(loadInitial())
    val state: StateFlow<LibrarySnapshotFile> = _state.asStateFlow()

    private val _user = MutableStateFlow<SessionUser?>(null)
    val user: StateFlow<SessionUser?> = _user.asStateFlow()
    private var authToken: String? = null
    fun token(): String? = authToken
    private var syncCursor: Int = 0
    private var lastPushedMs: Long = 0L

    private fun loadInitial(): LibrarySnapshotFile {
        val f = storageFile ?: return LibrarySnapshotFile()
        return runCatching {
            if (f.exists()) json.decodeFromString<LibrarySnapshotFile>(f.readText()) else LibrarySnapshotFile()
        }.getOrDefault(LibrarySnapshotFile())
    }

    private fun update(transform: (LibrarySnapshotFile) -> LibrarySnapshotFile) {
        val next = transform(_state.value)
        _state.value = next
        storageFile?.let { f ->
            runCatching {
                f.parentFile?.mkdirs()
                f.writeText(json.encodeToString(next))
            }
        }
    }

    private fun now() = System.currentTimeMillis()

    // Liked songs
    fun isLiked(id: String): Boolean = _state.value.likedTracks[id]?.let { it.deleted != true && it.value != null } == true
    fun likedTracks(): List<Track> = _state.value.likedTracks.values.filter { it.deleted != true }.sortedByDescending { it.updatedAt }.mapNotNull { it.value }
    fun toggleLike(track: Track): Boolean {
        val next = !isLiked(track.id)
        update { s ->
            val e = if (next) SyncEntry(track.id, track, now()) else SyncEntry(track.id, track, now(), deleted = true)
            s.copy(likedTracks = s.likedTracks + (track.id to e))
        }
        return next
    }

    // Albums, Artists, Podcasts
    fun isAlbumSaved(id: String): Boolean = _state.value.savedAlbums[id]?.let { it.deleted != true && it.value != null } == true
    fun savedAlbums(): List<Album> = _state.value.savedAlbums.values.filter { it.deleted != true }.sortedByDescending { it.updatedAt }.mapNotNull { it.value }
    fun toggleAlbum(album: Album) = update { s ->
        val e = if (isAlbumSaved(album.id)) SyncEntry(album.id, album, now(), true) else SyncEntry(album.id, album, now())
        s.copy(savedAlbums = s.savedAlbums + (album.id to e))
    }

    fun isArtistFollowed(id: String): Boolean = _state.value.followedArtists[id]?.let { it.deleted != true && it.value != null } == true
    fun followedArtists(): List<Artist> = _state.value.followedArtists.values.filter { it.deleted != true }.sortedByDescending { it.updatedAt }.mapNotNull { it.value }
    fun toggleArtist(artist: Artist) = update { s ->
        val e = if (isArtistFollowed(artist.id)) SyncEntry(artist.id, artist, now(), true) else SyncEntry(artist.id, artist, now())
        s.copy(followedArtists = s.followedArtists + (artist.id to e))
    }

    fun isPodcastFollowed(id: String): Boolean = _state.value.followedPodcasts[id]?.let { it.deleted != true && it.value != null } == true
    fun followedPodcasts(): List<Podcast> = _state.value.followedPodcasts.values.filter { it.deleted != true }.sortedByDescending { it.updatedAt }.mapNotNull { it.value }
    fun togglePodcast(p: Podcast) = update { s ->
        val e = if (isPodcastFollowed(p.id)) SyncEntry(p.id, p, now(), true) else SyncEntry(p.id, p, now())
        s.copy(followedPodcasts = s.followedPodcasts + (p.id to e))
    }

    // Playlists
    fun playlists(): List<Playlist> = _state.value.playlists.values.filter { it.deleted != true }.mapNotNull { it.value }
        .sortedWith(compareByDescending<Playlist> { it.pinned }.thenByDescending { it.updatedAt })
    fun playlist(id: String): Playlist? = _state.value.playlists[id]?.takeIf { it.deleted != true }?.value

    fun createPlaylist(name: String, tracks: List<Track> = emptyList(), description: String? = null): Playlist {
        val ts = now()
        val pl = Playlist(
            id = "pl_${UUID.randomUUID().toString().take(12)}",
            name = name.trim().ifEmpty { "New Playlist" },
            description = description,
            tracks = tracks.distinctBy { it.id },
            createdAt = ts,
            updatedAt = ts,
        )
        update { s -> s.copy(playlists = s.playlists + (pl.id to SyncEntry(pl.id, pl, ts))) }
        return pl
    }

    fun renamePlaylist(id: String, name: String) {
        val pl = playlist(id) ?: return
        val ts = now()
        val next = pl.copy(name = name.trim().ifEmpty { pl.name }, updatedAt = ts)
        update { s -> s.copy(playlists = s.playlists + (id to SyncEntry(id, next, ts))) }
    }

    fun togglePinPlaylist(id: String) {
        val pl = playlist(id) ?: return
        val ts = now()
        val next = pl.copy(pinned = !pl.pinned, updatedAt = ts)
        update { s -> s.copy(playlists = s.playlists + (id to SyncEntry(id, next, ts))) }
    }

    fun deletePlaylist(id: String) = update { s ->
        s.copy(playlists = s.playlists + (id to SyncEntry(id, null, now(), deleted = true)))
    }

    fun addToPlaylist(id: String, tracks: List<Track>) {
        val pl = playlist(id) ?: return
        val ts = now()
        val next = pl.copy(tracks = (pl.tracks + tracks).distinctBy { it.id }, updatedAt = ts)
        update { s -> s.copy(playlists = s.playlists + (id to SyncEntry(id, next, ts))) }
    }

    fun removeFromPlaylist(id: String, trackId: String) {
        val pl = playlist(id) ?: return
        val ts = now()
        val next = pl.copy(tracks = pl.tracks.filterNot { it.id == trackId }, updatedAt = ts)
        update { s -> s.copy(playlists = s.playlists + (id to SyncEntry(id, next, ts))) }
    }

    // History & Taste
    fun recordPlay(event: HistoryEvent) = update { s ->
        s.copy(history = s.history + (event.id to SyncEntry(event.id, event, event.playedAt)))
    }

    fun history(): List<HistoryEvent> = _state.value.history.values.filter { it.deleted != true }.mapNotNull { it.value }.sortedByDescending { it.playedAt }

    fun recentlyPlayed(limit: Int = 25): List<Track> = history().filterNot { it.skipped }.map { it.track }.distinctBy { it.id }.take(limit)

    fun clearHistory() = update { s ->
        val ts = now()
        s.copy(history = s.history.mapValues { (id, _) -> SyncEntry(id, null, ts, deleted = true) })
    }

    fun taste(): TasteProfile = TasteProfile.build(history(), likedTracks())

    // Podcast progress & Recent searches
    fun episodeProgress(id: String): Int = _state.value.episodeProgress[id]?.value ?: 0
    fun setEpisodeProgress(id: String, ms: Int) = update { s ->
        s.copy(episodeProgress = s.episodeProgress + (id to SyncEntry(id, ms, now())))
    }

    fun recentSearches(): List<String> = _state.value.recentSearches
    fun addRecentSearch(q: String) {
        val t = q.trim()
        if (t.isEmpty()) return
        update { s ->
            val next = (listOf(t) + s.recentSearches.filterNot { it.equals(t, ignoreCase = true) }).take(10)
            s.copy(recentSearches = next)
        }
    }
    fun clearRecentSearches() = update { it.copy(recentSearches = emptyList()) }

    // Settings
    fun settings(): AppSettings = _state.value.settings["main"]?.value ?: AppSettings()
    fun updateSettings(transform: (AppSettings) -> AppSettings) = update { s ->
        val next = transform(s.settings["main"]?.value ?: AppSettings())
        s.copy(settings = s.settings + ("main" to SyncEntry("main", next, now())))
    }

    // Auth & Sync with apps/server
    suspend fun login(email: String, password: String) = auth("/auth/login", mapOf("email" to email, "password" to password))
    suspend fun register(email: String, password: String, displayName: String) =
        auth("/auth/register", mapOf("email" to email, "password" to password, "displayName" to displayName))

    fun logout() {
        _user.value = null
        authToken = null
        syncCursor = 0
        lastPushedMs = 0L
    }

    private suspend fun auth(path: String, fields: Map<String, String>) = withContext(Dispatchers.IO) {
        val base = settings().serverUrl.trimEnd('/')
        val body = JSONObject(fields).toString().toRequestBody("application/json".toMediaType())
        val req = Request.Builder().url("$base$path").post(body).build()
        http.newCall(req).execute().use { res ->
            val text = res.body.string()
            val obj = JSONObject(text.ifBlank { "{}" })
            if (!res.isSuccessful) error(obj.optString("error").ifBlank { "Auth failed (${res.code})" })
            authToken = obj.getString("token")
            val u = obj.getJSONObject("user")
            _user.value = SessionUser(u.getString("id"), u.getString("email"), u.getString("displayName"))
        }
        runCatching { syncNow() }
    }

    suspend fun syncNow(): Int = withContext(Dispatchers.IO) {
        val token = authToken ?: return@withContext 0
        val base = settings().serverUrl.trimEnd('/')
        val started = now()
        val pushedLikes = _state.value.likedTracks.values.filter { it.updatedAt > lastPushedMs }
        val payload = """{"cursor":$syncCursor,"entries":{"likedTracks":${json.encodeToString(pushedLikes)}}}"""
        val req = Request.Builder()
            .url("$base/sync")
            .header("Authorization", "Bearer $token")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(req).execute().use { res ->
            if (!res.isSuccessful) error("Sync failed (${res.code})")
            val root = JSONObject(res.body.string())
            syncCursor = root.optInt("cursor", syncCursor)
            val entriesObj = root.optJSONObject("entries")
            val incomingLikes = entriesObj?.optJSONArray("likedTracks")
            var pulled = 0
            if (incomingLikes != null) {
                val decoded = json.decodeFromString<List<SyncEntry<Track>>>(incomingLikes.toString())
                update { s ->
                    val merged = s.likedTracks.toMutableMap()
                    for (e in decoded) {
                        val mine = merged[e.id]
                        if (mine == null || mine.updatedAt < e.updatedAt) {
                            merged[e.id] = e
                            pulled++
                        }
                    }
                    s.copy(likedTracks = merged)
                }
            }
            lastPushedMs = started
            pulled
        }
    }
}
