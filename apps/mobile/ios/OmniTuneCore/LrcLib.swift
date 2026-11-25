import Foundation

public enum LrcLib {
    public static func parseLrc(_ lrc: String) -> [LyricLine] {
        var lines: [LyricLine] = []
        let regex = try? NSRegularExpression(pattern: #"\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]"#)
        for raw in lrc.components(separatedBy: .newlines) {
            let ns = raw as NSString
            let matches = regex?.matches(in: raw, range: NSRange(location: 0, length: ns.length)) ?? []
            if matches.isEmpty { continue }
            let text = regex?.stringByReplacingMatches(in: raw, range: NSRange(location: 0, length: ns.length), withTemplate: "").trimmingCharacters(in: .whitespaces) ?? ""
            for m in matches {
                let min = Int(ns.substring(with: m.range(at: 1))) ?? 0
                let sec = Int(ns.substring(with: m.range(at: 2))) ?? 0
                var ms = 0
                if m.range(at: 3).location != NSNotFound {
                    let frac = ns.substring(with: m.range(at: 3)).padding(toLength: 3, withPad: "0", startingAt: 0)
                    ms = Int(frac.prefix(3)) ?? 0
                }
                lines.append(LyricLine(timeMs: min * 60_000 + sec * 1000 + ms, text: text))
            }
        }
        return lines.sorted { $0.timeMs < $1.timeMs }
    }

    public static func activeIndex(in lines: [LyricLine], positionMs: Int) -> Int {
        var lo = 0
        var hi = lines.count - 1
        var ans = -1
        while lo <= hi {
            let mid = (lo + hi) >> 1
            if lines[mid].timeMs <= positionMs {
                ans = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        return ans
    }

    public static func fetchLyrics(for track: Track, session: URLSession = .shared) async -> Lyrics? {
        guard track.kind == .song else { return nil }
        var comps = URLComponents(string: "https://lrclib.net/api/get")!
        var items = [
            URLQueryItem(name: "artist_name", value: track.artistName),
            URLQueryItem(name: "track_name", value: track.title),
        ]
        if let alb = track.albumName { items.append(URLQueryItem(name: "album_name", value: alb)) }
        if track.durationMs > 0 { items.append(URLQueryItem(name: "duration", value: "\(track.durationMs / 1000)")) }
        comps.queryItems = items

        if let url = comps.url, let (data, resp) = try? await session.data(from: url),
           (resp as? HTTPURLResponse)?.statusCode == 200,
           let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            return decodeLyrics(obj)
        }

        var searchComps = URLComponents(string: "https://lrclib.net/api/search")!
        searchComps.queryItems = [
            URLQueryItem(name: "artist_name", value: track.artistName),
            URLQueryItem(name: "track_name", value: track.title),
        ]
        if let url = searchComps.url, let (data, resp) = try? await session.data(from: url),
           (resp as? HTTPURLResponse)?.statusCode == 200,
           let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            let best = arr.first(where: { $0["syncedLyrics"] is String }) ?? arr.first
            return best.map(decodeLyrics)
        }
        return nil
    }

    private static func decodeLyrics(_ obj: [String: Any]) -> Lyrics {
        let synced = (obj["syncedLyrics"] as? String).map(parseLrc)
        return Lyrics(
            synced: synced?.isEmpty == true ? nil : synced,
            plain: obj["plainLyrics"] as? String,
            instrumental: (obj["instrumental"] as? Bool) ?? false
        )
    }
}
