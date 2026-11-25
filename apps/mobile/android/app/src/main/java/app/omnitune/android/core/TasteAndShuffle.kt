package app.omnitune.android.core

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.random.Random

class TasteProfile(
    val artists: Map<String, Double>,
    val genres: Map<String, Double>,
    val skipRate: Map<String, Double>,
    val recentIds: List<String>,
    val likedIds: Set<String>,
    val playCounts: Map<String, Int>,
    val isEmpty: Boolean,
) {
    fun topArtists(n: Int = 5): List<String> = artists.entries.sortedByDescending { it.value }.take(n).map { it.key }
    fun topGenres(n: Int = 3): List<String> = genres.entries.sortedByDescending { it.value }.take(n).map { it.key }

    companion object {
        fun build(history: List<HistoryEvent>, liked: List<Track> = emptyList(), nowMs: Long = System.currentTimeMillis()): TasteProfile {
            val dayMs = 86_400_000.0
            val artistScores = HashMap<String, Double>()
            val genreScores = HashMap<String, Double>()
            val plays = HashMap<String, IntArray>() // [count, skips]
            val playCounts = HashMap<String, Int>()

            val sorted = history.sortedByDescending { it.playedAt }
            for (e in sorted) {
                val ageDays = max(0.0, (nowMs - e.playedAt) / dayMs)
                val decay = 0.5.pow(ageDays / 30.0)
                val cap = min(max(e.track.durationMs, 1), 180_000).toDouble()
                val ratio = min(1.0, e.listenedMs / cap)
                val signal = if (e.skipped) -0.6 else if (e.completed) 1.0 else max(0.2, ratio)
                val a = e.track.artistName.lowercase()
                artistScores[a] = (artistScores[a] ?: 0.0) + signal * decay
                e.track.genre?.lowercase()?.let { g -> genreScores[g] = (genreScores[g] ?: 0.0) + signal * decay }
                val pair = plays.getOrPut(e.track.id) { intArrayOf(0, 0) }
                pair[0]++
                if (e.skipped) pair[1]++ else playCounts[e.track.id] = (playCounts[e.track.id] ?: 0) + 1
            }
            for (t in liked) {
                val a = t.artistName.lowercase()
                artistScores[a] = (artistScores[a] ?: 0.0) + 2.0
                t.genre?.lowercase()?.let { g -> genreScores[g] = (genreScores[g] ?: 0.0) + 1.5 }
            }

            fun norm(map: Map<String, Double>): Map<String, Double> {
                val m = map.values.maxOrNull() ?: 0.0
                if (m <= 0.0) return emptyMap()
                return map.filterValues { it > 0.0 }.mapValues { it.value / m }
            }

            return TasteProfile(
                artists = norm(artistScores),
                genres = norm(genreScores),
                skipRate = plays.mapValues { it.value[1].toDouble() / it.value[0].toDouble() },
                recentIds = sorted.map { it.track.id },
                likedIds = liked.map { it.id }.toSet(),
                playCounts = playCounts,
                isEmpty = history.isEmpty() && liked.isEmpty(),
            )
        }
    }
}

/** OmniTune Smart Shuffle (Efraimidis–Spirakis weighted random + artist/album gap spreading). */
object SmartShuffle {
    fun <T> fisherYates(items: List<T>, rng: () -> Double = { Random.nextDouble() }): List<T> {
        val a = items.toMutableList()
        for (i in a.lastIndex downTo 1) {
            val j = (rng() * (i + 1)).toInt().coerceIn(0, i)
            val tmp = a[i]
            a[i] = a[j]
            a[j] = tmp
        }
        return a
    }

    fun shuffle(
        tracks: List<Track>,
        taste: TasteProfile? = null,
        startWith: Track? = null,
        minArtistGap: Int = 4,
        rng: () -> Double = { Random.nextDouble() },
    ): List<Track> {
        val unique = tracks.distinctBy { it.id }
        val pinned = startWith?.let { sw -> unique.firstOrNull { it.id == sw.id } ?: sw }
        val pool = if (pinned != null) unique.filter { it.id != pinned.id } else unique

        val recentRank = HashMap<String, Int>()
        taste?.recentIds?.take(30)?.forEachIndexed { idx, id -> recentRank.putIfAbsent(id, idx) }

        val keyed = pool.map { track ->
            var boost = 0.0
            if (taste != null && !taste.isEmpty) {
                boost += 0.7 * (taste.artists[track.artistName.lowercase()] ?: 0.0)
                boost += 0.2 * (track.genre?.lowercase()?.let { taste.genres[it] } ?: 0.0)
                if (track.id in taste.likedIds) boost += 0.4
                boost += min(0.3, (taste.playCounts[track.id] ?: 0) * 0.05)
                recentRank[track.id]?.let { r -> boost -= 0.9 * (1.0 - r / 30.0) }
                boost -= 1.2 * (taste.skipRate[track.id] ?: 0.0)
            }
            val w = exp(boost)
            val u = max(rng(), 1e-12)
            track to u.pow(1.0 / w)
        }.sortedByDescending { it.second }.map { it.first }

        val ordered = spread(keyed, minArtistGap, pinned)
        return if (pinned != null) listOf(pinned) + ordered else ordered
    }

    private fun key(t: Track) = t.artistName.lowercase()

    private fun spread(pool: List<Track>, minGap: Int, first: Track?): List<Track> {
        val artists = pool.map(::key).toSet()
        val gap = min(minGap, max(0, artists.size - 1))
        val out = ArrayList<Track>(pool.size)
        val remaining = pool.toMutableList()
        val recent = ArrayDeque<Track>()
        if (first != null) recent.addLast(first)

        val counts = HashMap<String, Int>()
        pool.forEach { t -> counts[key(t)] = (counts[key(t)] ?: 0) + 1 }

        while (remaining.isNotEmpty()) {
            val maxCount = counts.values.maxOrNull() ?: 0
            val tight = maxCount * (gap + 1) > remaining.size
            var pickIdx = -1
            var g = gap
            while (g >= 0 && pickIdx == -1) {
                val window = if (g > 0) recent.takeLast(g) else emptyList()
                val last = recent.lastOrNull()
                var best = -1
                for (i in remaining.indices) {
                    val t = remaining[i]
                    if (last != null && t.albumId != null && t.albumId == last.albumId && artists.size > 1 && g > 0) continue
                    if (window.any { key(it) == key(t) }) continue
                    if (!tight) {
                        best = i
                        break
                    }
                    if (best == -1 || (counts[key(t)] ?: 0) > (counts[key(remaining[best])] ?: 0)) best = i
                }
                pickIdx = best
                g--
            }
            if (pickIdx == -1) pickIdx = 0
            val pick = remaining.removeAt(pickIdx)
            counts[key(pick)] = (counts[key(pick)] ?: 1) - 1
            out.add(pick)
            recent.addLast(pick)
            if (recent.size > 12) recent.removeFirst()
        }
        return out
    }
}

object RadioEngine {
    suspend fun buildRadio(
        seed: Track,
        catalog: CatalogProvider,
        taste: TasteProfile?,
        explicitFilter: Boolean = false,
        limit: Int = 35,
    ): List<Track> {
        if (seed.kind == TrackKind.episode) {
            val pid = seed.podcastId ?: return emptyList()
            return runCatching { catalog.getPodcast(pid).second }.getOrDefault(emptyList())
                .filter { it.id != seed.id }.take(limit)
        }
        val pools = ArrayList<List<Track>>()
        seed.artistId?.let { aid -> runCatching { catalog.getArtist(aid).second }.getOrNull()?.let(pools::add) }
        seed.genre?.let { gName ->
            val genre = findGenre(gName)
            val list = if (genre != null) runCatching { catalog.getGenreTracks(genre, 35) }.getOrNull()
            else runCatching { catalog.search(gName, 35).songs }.getOrNull()
            list?.let(pools::add)
        }
        taste?.topArtists(2)?.filter { it != seed.artistName.lowercase() }?.forEach { a ->
            runCatching { catalog.search(a, 15).songs }.getOrNull()?.let(pools::add)
        }
        val seen = hashSetOf(seed.id)
        val candidates = pools.flatten().filter {
            seen.add(it.id) && it.kind == TrackKind.song && it.audioUrl != null && !(explicitFilter && it.explicit)
        }
        val ranked = candidates.sortedByDescending { t ->
            var s = 0.0
            if (t.artistId != null && t.artistId == seed.artistId) s += 0.8
            if (t.genre != null && t.genre == seed.genre) s += 0.6
            if (taste != null) {
                s += 0.8 * (taste.artists[t.artistName.lowercase()] ?: 0.0)
                if (t.id in taste.likedIds) s += 0.3
                val rec = taste.recentIds.indexOf(t.id)
                if (rec in 0..49) s -= 0.7 else if (t.id !in taste.playCounts) s += 0.25
                s -= (taste.skipRate[t.id] ?: 0.0)
            }
            s + Random.nextDouble() * 0.6
        }.take(limit * 2)
        return SmartShuffle.shuffle(ranked, minArtistGap = 3).take(limit)
    }

    suspend fun buildMixes(catalog: CatalogProvider, taste: TasteProfile, recent: List<Track>, explicitFilter: Boolean = false): List<Mix> {
        fun ok(t: Track) = t.kind == TrackKind.song && t.audioUrl != null && !(explicitFilter && t.explicit)
        fun mosaic(list: List<Track>) = list.mapNotNull { it.artworkUrl.ifBlank { null } }.distinct().take(4)

        val mixes = ArrayList<Mix>()
        if (!taste.isEmpty) {
            val byId = recent.associateBy { it.id }
            val onRepeat = taste.playCounts.entries.sortedByDescending { it.value }.take(25).mapNotNull { byId[it.key] }.filter(::ok)
            if (onRepeat.size >= 5) {
                val list = SmartShuffle.shuffle(onRepeat)
                mixes.add(Mix("on-repeat", "On Repeat", "Songs you can’t stop playing", list, mosaic(list), 0xFFFA2D48))
            }
            val palette = listOf(0xFFFA2D48L, 0xFF5E5CE6L, 0xFFFF9F0AL)
            taste.topGenres(3).forEachIndexed { i, g ->
                val match = findGenre(g)
                val tracks = (if (match != null) runCatching { catalog.getGenreTracks(match, 35) }.getOrDefault(emptyList())
                else runCatching { catalog.search(g, 35).songs }.getOrDefault(emptyList())).filter(::ok)
                val shuffled = SmartShuffle.shuffle(tracks, taste).take(30)
                if (shuffled.size >= 6) {
                    val names = shuffled.map { it.artistName }.distinct().take(3).joinToString(", ")
                    mixes.add(Mix("daily-${i + 1}", "Daily Mix ${i + 1}", "$names and more", shuffled, mosaic(shuffled), palette[i % palette.size]))
                }
            }
        } else {
            OMNITUNE_GENRES.take(4).forEachIndexed { i, g ->
                val list = runCatching { catalog.getGenreTracks(g, 30) }.getOrDefault(emptyList()).filter(::ok)
                val shuffled = SmartShuffle.shuffle(list).take(25)
                if (shuffled.size >= 6) {
                    mixes.add(Mix("starter-${i + 1}", "${g.name} Mix", "Start here: the best of ${g.name}", shuffled, mosaic(shuffled), g.colorHex))
                }
            }
        }
        return mixes
    }

    suspend fun buildHomeFeed(catalog: CatalogProvider, library: LibraryStore): List<HomeShelf> = coroutineScope {
        val taste = library.taste()
        val recent = library.recentlyPlayed(20)
        val settings = library.settings()
        val shelves = ArrayList<HomeShelf>()
        if (recent.isNotEmpty()) {
            shelves.add(HomeShelf("recent", "Jump Back In", items = recent.take(12).map { ShelfItem.TrackItem(it) }))
        }
        val playlists = library.playlists()
        if (playlists.isNotEmpty()) {
            shelves.add(HomeShelf("playlists", "Your Playlists", items = playlists.take(12).map { ShelfItem.PlaylistItem(it) }))
        }
        val mixesD = async { runCatching { buildMixes(catalog, taste, recent, settings.explicitFilter) }.getOrDefault(emptyList()) }
        val songsD = async { runCatching { catalog.getTopSongs(25) }.getOrDefault(emptyList()) }
        val relD = async { runCatching { catalog.getNewReleases(18) }.getOrDefault(emptyList()) }
        val albD = async { runCatching { catalog.getTopAlbums(18) }.getOrDefault(emptyList()) }
        val podD = async { runCatching { catalog.getTopPodcasts(14) }.getOrDefault(emptyList()) }

        val mixes = mixesD.await()
        if (mixes.isNotEmpty()) {
            shelves.add(HomeShelf(
                "mixes",
                if (taste.isEmpty) "Start Listening" else "Made for You",
                if (taste.isEmpty) "Play a few songs to personalize your mixes" else "Built from what you play, like and skip",
                mixes.map { ShelfItem.MixItem(it) },
            ))
        }
        val songs = songsD.await()
        if (songs.isNotEmpty()) shelves.add(HomeShelf("top-songs", "Top Songs Right Now", items = songs.map { ShelfItem.TrackItem(it) }))
        val releases = relD.await()
        if (releases.isNotEmpty()) shelves.add(HomeShelf("new", "New Releases", items = releases.map { ShelfItem.AlbumItem(it) }))
        val albums = albD.await()
        if (albums.isNotEmpty()) shelves.add(HomeShelf("top-albums", "Popular Albums", items = albums.map { ShelfItem.AlbumItem(it) }))
        val podcasts = podD.await()
        if (podcasts.isNotEmpty()) shelves.add(HomeShelf("podcasts", "Popular Podcasts", items = podcasts.map { ShelfItem.PodcastItem(it) }))
        shelves
    }
}
