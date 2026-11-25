package app.omnitune.android.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

object LrcLib {
    private val http = OkHttpClient()
    private val STAMP_RE = Regex("""\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?]""")

    fun parseLrc(lrc: String): List<LyricLine> {
        val out = ArrayList<LyricLine>()
        for (raw in lrc.lines()) {
            val matches = STAMP_RE.findAll(raw).toList()
            if (matches.isEmpty()) continue
            val text = STAMP_RE.replace(raw, "").trim()
            for (m in matches) {
                val min = m.groupValues[1].toIntOrNull() ?: 0
                val sec = m.groupValues[2].toIntOrNull() ?: 0
                val frac = m.groupValues[3].padEnd(3, '0').take(3).toIntOrNull() ?: 0
                out.add(LyricLine(min * 60_000 + sec * 1000 + frac, text))
            }
        }
        return out.sortedBy { it.timeMs }
    }

    fun activeIndex(lines: List<LyricLine>, positionMs: Int): Int {
        var lo = 0
        var hi = lines.lastIndex
        var ans = -1
        while (lo <= hi) {
            val mid = (lo + hi) ushr 1
            if (lines[mid].timeMs <= positionMs) {
                ans = mid
                lo = mid + 1
            } else hi = mid - 1
        }
        return ans
    }

    suspend fun fetchLyrics(track: Track): Lyrics? = withContext(Dispatchers.IO) {
        if (track.kind != TrackKind.song) return@withContext null
        fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
        val q = buildString {
            append("artist_name=${enc(track.artistName)}&track_name=${enc(track.title)}")
            track.albumName?.let { append("&album_name=${enc(it)}") }
            if (track.durationMs > 0) append("&duration=${track.durationMs / 1000}")
        }
        runCatching {
            http.newCall(Request.Builder().url("https://lrclib.net/api/get?$q").build()).execute().use { res ->
                if (res.isSuccessful) return@withContext decode(JSONObject(res.body.string()))
            }
            val sq = "artist_name=${enc(track.artistName)}&track_name=${enc(track.title)}"
            http.newCall(Request.Builder().url("https://lrclib.net/api/search?$sq").build()).execute().use { res ->
                if (!res.isSuccessful) return@withContext null
                val arr = JSONArray(res.body.string())
                val items = List(arr.length()) { arr.optJSONObject(it) }.filterNotNull()
                val best = items.firstOrNull { !it.optString("syncedLyrics").isNullOrBlank() } ?: items.firstOrNull()
                return@withContext best?.let(::decode)
            }
        }.getOrNull()
    }

    private fun decode(obj: JSONObject): Lyrics {
        val rawSynced = obj.optString("syncedLyrics").takeIf { it.isNotBlank() && it != "null" }
        val plain = obj.optString("plainLyrics").takeIf { it.isNotBlank() && it != "null" }
        return Lyrics(
            synced = rawSynced?.let(::parseLrc)?.takeIf { it.isNotEmpty() },
            plain = plain,
            instrumental = obj.optBoolean("instrumental", false),
        )
    }
}
