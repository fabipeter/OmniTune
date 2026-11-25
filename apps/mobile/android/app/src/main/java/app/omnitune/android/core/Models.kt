package app.omnitune.android.core

import kotlinx.serialization.Serializable
import java.util.Calendar
import java.util.UUID

@Serializable
enum class TrackKind { song, episode }

@Serializable
data class Track(
    val id: String,
    val kind: TrackKind = TrackKind.song,
    val title: String,
    val artistName: String,
    val artistId: String? = null,
    val albumName: String? = null,
    val albumId: String? = null,
    val podcastId: String? = null,
    val artworkUrl: String = "",
    val durationMs: Int = 30_000,
    val audioUrl: String? = null,
    val isPreview: Boolean = true,
    val genre: String? = null,
    val releaseDate: String? = null,
    val explicit: Boolean = false,
    val trackNumber: Int? = null,
    val discNumber: Int? = null,
    val storeUrl: String? = null,
    val description: String? = null,
)

@Serializable
data class Album(
    val id: String,
    val title: String,
    val artistName: String,
    val artistId: String? = null,
    val artworkUrl: String = "",
    val releaseDate: String? = null,
    val genre: String? = null,
    val trackCount: Int? = null,
    val explicit: Boolean = false,
    val storeUrl: String? = null,
)

@Serializable
data class Artist(
    val id: String,
    val name: String,
    val genre: String? = null,
    val storeUrl: String? = null,
    val artworkUrl: String? = null,
)

@Serializable
data class Podcast(
    val id: String,
    val title: String,
    val author: String,
    val artworkUrl: String = "",
    val feedUrl: String? = null,
    val genre: String? = null,
    val episodeCount: Int? = null,
    val storeUrl: String? = null,
)

data class Genre(
    val id: String,
    val name: String,
    val colorHex: Long,
    val term: String,
)

val OMNITUNE_GENRES = listOf(
    Genre("pop", "Pop", 0xFF8D67AB, "pop hits"),
    Genre("hiphop", "Hip-Hop", 0xFFBA5D07, "hip hop rap"),
    Genre("rock", "Rock", 0xFFE91429, "rock classics"),
    Genre("dance", "Dance & Electronic", 0xFF0D73EC, "electronic dance"),
    Genre("rnb", "R&B", 0xFFDC148C, "r&b soul"),
    Genre("latin", "Latin", 0xFFE8115B, "latin reggaeton"),
    Genre("country", "Country", 0xFFBC5900, "country hits"),
    Genre("indie", "Indie & Alternative", 0xFF608108, "indie alternative"),
    Genre("kpop", "K-Pop", 0xFF477D95, "k-pop"),
    Genre("afro", "Afrobeats", 0xFF148A08, "afrobeats"),
    Genre("jazz", "Jazz", 0xFF1E3264, "jazz"),
    Genre("classical", "Classical", 0xFF7D4B32, "classical piano orchestra"),
    Genre("metal", "Metal", 0xFF5F4B8B, "heavy metal"),
    Genre("chill", "Chill", 0xFFD84000, "chill lofi"),
    Genre("workout", "Workout", 0xFF4F5D75, "workout energy"),
    Genre("focus", "Focus", 0xFF503750, "focus ambient instrumental"),
)

fun findGenre(idOrName: String): Genre? {
    val k = idOrName.lowercase()
    return OMNITUNE_GENRES.firstOrNull { it.id == k || it.name.lowercase() == k }
}

data class SearchResults(
    val songs: List<Track> = emptyList(),
    val albums: List<Album> = emptyList(),
    val artists: List<Artist> = emptyList(),
    val podcasts: List<Podcast> = emptyList(),
    val episodes: List<Track> = emptyList(),
)

@Serializable
data class Playlist(
    val id: String,
    val name: String,
    val description: String? = null,
    val tracks: List<Track> = emptyList(),
    val pinned: Boolean = false,
    val createdAt: Long,
    val updatedAt: Long,
)

data class Mix(
    val id: String,
    val name: String,
    val description: String,
    val tracks: List<Track>,
    val artwork: List<String>,
    val colorHex: Long,
)

sealed interface ShelfItem {
    val key: String
    data class TrackItem(val track: Track) : ShelfItem { override val key = "t-${track.id}" }
    data class AlbumItem(val album: Album) : ShelfItem { override val key = "a-${album.id}" }
    data class ArtistItem(val artist: Artist) : ShelfItem { override val key = "ar-${artist.id}" }
    data class PodcastItem(val podcast: Podcast) : ShelfItem { override val key = "p-${podcast.id}" }
    data class MixItem(val mix: Mix) : ShelfItem { override val key = "m-${mix.id}" }
    data class PlaylistItem(val playlist: Playlist) : ShelfItem { override val key = "pl-${playlist.id}" }
}

data class HomeShelf(
    val id: String,
    val title: String,
    val subtitle: String? = null,
    val items: List<ShelfItem>,
)

@Serializable
data class HistoryEvent(
    val id: String,
    val track: Track,
    val playedAt: Long,
    val listenedMs: Int,
    val completed: Boolean,
    val skipped: Boolean,
    val contextType: String? = null,
    val contextId: String? = null,
)

@Serializable enum class AudioQuality { auto, high, lossless }
@Serializable enum class ShuffleMode { smart, random }
@Serializable enum class AppThemeMode { system, dark, light }
@Serializable enum class RepeatMode { off, all, one }

@Serializable
data class AppSettings(
    val country: String = "us",
    val audioQuality: AudioQuality = AudioQuality.high,
    val crossfadeMs: Int = 0,
    val gapless: Boolean = true,
    val normalizeVolume: Boolean = true,
    val autoplay: Boolean = true,
    val shuffleMode: ShuffleMode = ShuffleMode.smart,
    val explicitFilter: Boolean = false,
    val theme: AppThemeMode = AppThemeMode.system,
    val serverUrl: String = "http://10.0.2.2:8787",
)

data class LyricLine(val timeMs: Int, val text: String)
data class Lyrics(val synced: List<LyricLine>?, val plain: String?, val instrumental: Boolean)

@Serializable
data class PlaybackContext(val type: String, val id: String? = null, val name: String? = null)

@Serializable
data class QueueItem(val uid: String = UUID.randomUUID().toString(), val track: Track)

@Serializable
data class SessionUser(val id: String, val email: String, val displayName: String)

private val ARTWORK_SIZE_RE = Regex("""/\d+x\d+(bb|cc|sr)?\.(jpg|png|webp)$""", RegexOption.IGNORE_CASE)

fun artworkAt(url: String?, size: Int = 300): String {
    if (url.isNullOrBlank()) return ""
    return ARTWORK_SIZE_RE.replace(url, "/${size}x${size}bb.jpg")
}

fun formatDuration(ms: Int): String {
    val total = (ms / 1000).coerceAtLeast(0)
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}

fun timeGreeting(): String = when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
    in 0..4 -> "Good Night"
    in 5..11 -> "Good Morning"
    in 12..17 -> "Good Afternoon"
    else -> "Good Evening"
}
