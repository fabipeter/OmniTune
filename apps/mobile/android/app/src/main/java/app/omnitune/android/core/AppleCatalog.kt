package app.omnitune.android.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

interface CatalogProvider {
    suspend fun search(query: String, limit: Int = 20): SearchResults
    suspend fun getTracks(ids: List<String>): List<Track>
    suspend fun getAlbum(id: String): Pair<Album, List<Track>>
    suspend fun getArtist(id: String): Triple<Artist, List<Track>, List<Album>>
    suspend fun getArtistArtwork(id: String): String?
    suspend fun getPodcast(id: String): Pair<Podcast, List<Track>>
    suspend fun getTopSongs(limit: Int = 30): List<Track>
    suspend fun getTopAlbums(limit: Int = 20): List<Album>
    suspend fun getNewReleases(limit: Int = 20): List<Album>
    suspend fun getTopPodcasts(limit: Int = 15): List<Podcast>
    suspend fun getGenreTracks(genre: Genre, limit: Int = 40): List<Track>
}

class AppleCatalog(initialCountry: String = "us") : CatalogProvider {
    @Volatile
    private var country: String = initialCountry.lowercase()
    private val http = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private data class CacheEntry(val at: Long, val body: String)
    private val cache = ConcurrentHashMap<String, CacheEntry>()
    private val ttlMs = 10 * 60_000L

    fun setCountry(code: String) {
        country = code.lowercase()
        cache.clear()
    }

    private suspend fun getJson(url: String): JSONObject = withContext(Dispatchers.IO) {
        val hit = cache[url]
        if (hit != null && System.currentTimeMillis() - hit.at < ttlMs) {
            return@withContext JSONObject(hit.body)
        }
        var lastErr: Exception? = null
        repeat(3) { attempt ->
            try {
                val req = Request.Builder().url(url).build()
                http.newCall(req).execute().use { res ->
                    if (res.code == 429 || res.code >= 500) {
                        lastErr = IllegalStateException("HTTP ${res.code}")
                        delay(500L * (attempt + 1))
                        return@repeat
                    }
                    val body = res.body.string()
                    if (!res.isSuccessful || body.isBlank()) throw IllegalStateException("HTTP ${res.code}")
                    cache[url] = CacheEntry(System.currentTimeMillis(), body)
                    return@withContext JSONObject(body)
                }
            } catch (e: Exception) {
                lastErr = e
                delay(350L * (attempt + 1))
            }
        }
        throw lastErr ?: IllegalStateException("Catalog request failed")
    }

    private fun qs(params: Map<String, String>): String =
        (mapOf("country" to country) + params).entries.joinToString("&") { (k, v) ->
            "${URLEncoder.encode(k, "UTF-8")}=${URLEncoder.encode(v, "UTF-8")}"
        }

    private suspend fun iSearch(params: Map<String, String>): List<JSONObject> =
        getJson("https://itunes.apple.com/search?${qs(params)}").optJSONArray("results").toObjectList()

    private suspend fun iLookup(params: Map<String, String>): List<JSONObject> =
        getJson("https://itunes.apple.com/lookup?${qs(params)}").optJSONArray("results").toObjectList()

    private suspend fun chartIds(path: String): List<String> {
        val feed = getJson("https://rss.marketingtools.apple.com/api/v2/$country/$path.json").optJSONObject("feed")
        return feed?.optJSONArray("results").toObjectList().mapNotNull { it.optString("id").ifBlank { null } }
    }

    override suspend fun search(query: String, limit: Int): SearchResults = coroutineScope {
        val q = query.trim()
        if (q.isEmpty()) return@coroutineScope SearchResults()
        val songsD = async { runCatching { iSearch(mapOf("term" to q, "media" to "music", "entity" to "song", "limit" to "$limit")) }.getOrDefault(emptyList()) }
        val albumsD = async { runCatching { iSearch(mapOf("term" to q, "media" to "music", "entity" to "album", "limit" to "$limit")) }.getOrDefault(emptyList()) }
        val artistsD = async { runCatching { iSearch(mapOf("term" to q, "media" to "music", "entity" to "musicArtist", "limit" to "${minOf(limit, 12)}")) }.getOrDefault(emptyList()) }
        val podsD = async { runCatching { iSearch(mapOf("term" to q, "media" to "podcast", "entity" to "podcast", "limit" to "${minOf(limit, 15)}")) }.getOrDefault(emptyList()) }
        val epsD = async { runCatching { iSearch(mapOf("term" to q, "media" to "podcast", "entity" to "podcastEpisode", "limit" to "${minOf(limit, 15)}")) }.getOrDefault(emptyList()) }
        SearchResults(
            songs = songsD.await().mapNotNull(::mapSong),
            albums = albumsD.await().mapNotNull(::mapAlbum),
            artists = artistsD.await().mapNotNull(::mapArtist),
            podcasts = podsD.await().mapNotNull(::mapPodcast),
            episodes = epsD.await().mapNotNull(::mapEpisode),
        )
    }

    override suspend fun getTracks(ids: List<String>): List<Track> {
        if (ids.isEmpty()) return emptyList()
        val byId = HashMap<String, Track>()
        ids.chunked(100).forEach { chunk ->
            iLookup(mapOf("id" to chunk.joinToString(","), "entity" to "song"))
                .mapNotNull(::mapSong)
                .forEach { byId[it.id] = it }
        }
        return ids.mapNotNull { byId[it] }
    }

    override suspend fun getAlbum(id: String): Pair<Album, List<Track>> {
        val rows = iLookup(mapOf("id" to id, "entity" to "song", "limit" to "200"))
        val head = rows.firstOrNull { it.optString("wrapperType") == "collection" } ?: error("Album not found")
        val album = mapAlbum(head) ?: error("Invalid album")
        val tracks = rows.mapNotNull(::mapSong).sortedWith(compareBy({ it.discNumber ?: 1 }, { it.trackNumber ?: 0 }))
        return album to tracks
    }

    override suspend fun getArtist(id: String): Triple<Artist, List<Track>, List<Album>> = coroutineScope {
        val sD = async { iLookup(mapOf("id" to id, "entity" to "song", "limit" to "25")) }
        val aD = async { iLookup(mapOf("id" to id, "entity" to "album", "limit" to "50")) }
        val sRows = sD.await()
        val aRows = aD.await()
        val head = sRows.firstOrNull { it.optString("wrapperType") == "artist" }
            ?: aRows.firstOrNull { it.optString("wrapperType") == "artist" }
            ?: error("Artist not found")
        val topSongs = sRows.mapNotNull(::mapSong)
        val albums = aRows.mapNotNull(::mapAlbum).sortedByDescending { it.releaseDate.orEmpty() }
        val base = mapArtist(head) ?: error("Invalid artist")
        Triple(base.copy(artworkUrl = albums.firstOrNull()?.artworkUrl ?: topSongs.firstOrNull()?.artworkUrl), topSongs, albums)
    }

    override suspend fun getArtistArtwork(id: String): String? = runCatching {
        iLookup(mapOf("id" to id, "entity" to "album", "limit" to "1"))
            .firstOrNull { it.optString("wrapperType") == "collection" }
            ?.optString("artworkUrl100")
            ?.ifBlank { null }
    }.getOrNull()

    override suspend fun getPodcast(id: String): Pair<Podcast, List<Track>> {
        val rows = iLookup(mapOf("id" to id, "media" to "podcast", "entity" to "podcastEpisode", "limit" to "150"))
        val head = rows.firstOrNull { it.optString("kind") == "podcast" } ?: error("Podcast not found")
        val pod = mapPodcast(head) ?: error("Invalid podcast")
        val episodes = rows.filter { it.optString("kind") == "podcast-episode" }.mapNotNull(::mapEpisode)
        return pod to episodes
    }

    override suspend fun getTopSongs(limit: Int): List<Track> = runCatching {
        val ids = chartIds("music/most-played/$limit/songs")
        if (ids.isNotEmpty()) getTracks(ids) else search("top hits", limit).songs
    }.getOrElse { search("top hits", limit).songs }

    override suspend fun getTopAlbums(limit: Int): List<Album> = runCatching {
        val ids = chartIds("music/most-played/$limit/albums")
        val rows = iLookup(mapOf("id" to ids.joinToString(","), "entity" to "album")).mapNotNull(::mapAlbum).associateBy { it.id }
        ids.mapNotNull { rows[it] }
    }.getOrElse { search("top albums", limit).albums }

    override suspend fun getNewReleases(limit: Int): List<Album> = search("new music 2026", limit).albums

    override suspend fun getTopPodcasts(limit: Int): List<Podcast> = runCatching {
        val ids = chartIds("podcasts/top/$limit/podcasts")
        iLookup(mapOf("id" to ids.joinToString(","), "media" to "podcast")).mapNotNull(::mapPodcast)
    }.getOrElse { search("popular podcasts", limit).podcasts }

    override suspend fun getGenreTracks(genre: Genre, limit: Int): List<Track> = search(genre.term, limit).songs

    companion object {
        private fun JSONArray?.toObjectList(): List<JSONObject> {
            if (this == null) return emptyList()
            return List(length()) { i -> optJSONObject(i) }.filterNotNull()
        }

        private fun JSONObject.strOrNull(k: String): String? = optString(k).takeIf { it.isNotBlank() && it != "null" }
        private fun JSONObject.idOrNull(k: String): String? = if (has(k) && !isNull(k)) opt(k)?.toString() else null

        fun mapSong(r: JSONObject): Track? {
            val kind = r.strOrNull("kind")
            val wrapper = r.strOrNull("wrapperType")
            if ((kind != "song" && wrapper != "track") || kind == "podcast" || kind == "podcast-episode") return null
            val id = r.idOrNull("trackId") ?: return null
            val title = r.strOrNull("trackName") ?: return null
            val artist = r.strOrNull("artistName") ?: return null
            return Track(
                id = id,
                kind = TrackKind.song,
                title = title,
                artistName = artist,
                artistId = r.idOrNull("artistId"),
                albumName = r.strOrNull("collectionName"),
                albumId = r.idOrNull("collectionId"),
                artworkUrl = r.strOrNull("artworkUrl100") ?: r.strOrNull("artworkUrl60").orEmpty(),
                durationMs = r.optInt("trackTimeMillis", 30_000),
                audioUrl = r.strOrNull("previewUrl"),
                isPreview = true,
                genre = r.strOrNull("primaryGenreName"),
                releaseDate = r.strOrNull("releaseDate"),
                explicit = r.strOrNull("trackExplicitness") == "explicit",
                trackNumber = if (r.has("trackNumber")) r.optInt("trackNumber") else null,
                discNumber = if (r.has("discNumber")) r.optInt("discNumber") else null,
                storeUrl = r.strOrNull("trackViewUrl"),
            )
        }

        fun mapAlbum(r: JSONObject): Album? {
            if (r.strOrNull("wrapperType") == "track") return null
            val id = r.idOrNull("collectionId") ?: return null
            val title = r.strOrNull("collectionName") ?: return null
            val artist = r.strOrNull("artistName") ?: return null
            return Album(
                id = id,
                title = title,
                artistName = artist,
                artistId = r.idOrNull("artistId"),
                artworkUrl = r.strOrNull("artworkUrl100") ?: r.strOrNull("artworkUrl60").orEmpty(),
                releaseDate = r.strOrNull("releaseDate"),
                genre = r.strOrNull("primaryGenreName"),
                trackCount = if (r.has("trackCount")) r.optInt("trackCount") else null,
                explicit = r.strOrNull("collectionExplicitness") == "explicit",
                storeUrl = r.strOrNull("collectionViewUrl"),
            )
        }

        fun mapArtist(r: JSONObject): Artist? {
            val id = r.idOrNull("artistId") ?: return null
            val name = r.strOrNull("artistName") ?: return null
            return Artist(id = id, name = name, genre = r.strOrNull("primaryGenreName"), storeUrl = r.strOrNull("artistLinkUrl"))
        }

        fun mapPodcast(r: JSONObject): Podcast? {
            val id = r.idOrNull("collectionId") ?: return null
            val title = r.strOrNull("collectionName") ?: return null
            val author = r.strOrNull("artistName") ?: return null
            return Podcast(
                id = id,
                title = title,
                author = author,
                artworkUrl = r.strOrNull("artworkUrl600") ?: r.strOrNull("artworkUrl100").orEmpty(),
                feedUrl = r.strOrNull("feedUrl"),
                genre = r.strOrNull("primaryGenreName"),
                episodeCount = if (r.has("trackCount")) r.optInt("trackCount") else null,
                storeUrl = r.strOrNull("collectionViewUrl"),
            )
        }

        fun mapEpisode(r: JSONObject): Track? {
            val id = r.idOrNull("trackId") ?: return null
            val title = r.strOrNull("trackName") ?: return null
            val show = r.strOrNull("collectionName") ?: return null
            return Track(
                id = id,
                kind = TrackKind.episode,
                title = title,
                artistName = show,
                podcastId = r.idOrNull("collectionId"),
                artworkUrl = r.strOrNull("artworkUrl160") ?: r.strOrNull("artworkUrl600") ?: r.strOrNull("artworkUrl100").orEmpty(),
                durationMs = r.optInt("trackTimeMillis", 0),
                audioUrl = r.strOrNull("episodeUrl"),
                isPreview = false,
                releaseDate = r.strOrNull("releaseDate"),
                storeUrl = r.strOrNull("trackViewUrl"),
                description = r.strOrNull("description") ?: r.strOrNull("shortDescription"),
            )
        }
    }
}
