import Foundation

public struct SeededRNG: Sendable {
    private var state: UInt32
    public init(seed: UInt32) { self.state = seed }
    public mutating func nextDouble() -> Double {
        state = state &+ 0x6D2B_79F5
        var t = state
        t = (t ^ (t >> 15)) &* (t | 1)
        t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
        return Double(t ^ (t >> 14)) / 4_294_967_296.0
    }
}

public struct TasteProfile: Sendable {
    public let artists: [String: Double]
    public let genres: [String: Double]
    public let skipRate: [String: Double]
    public let recentIds: [String]
    public let likedIds: Set<String>
    public let playCounts: [String: Int]
    public let isEmpty: Bool

    public func topArtists(_ n: Int = 5) -> [String] {
        artists.sorted { $0.value > $1.value }.prefix(n).map(\.key)
    }
    public func topGenres(_ n: Int = 3) -> [String] {
        genres.sorted { $0.value > $1.value }.prefix(n).map(\.key)
    }

    public static func build(history: [HistoryEvent], liked: [Track] = [], nowMs: Int64 = Int64(Date().timeIntervalSince1970 * 1000)) -> TasteProfile {
        let dayMs = 86_400_000.0
        var artistScores: [String: Double] = [:]
        var genreScores: [String: Double] = [:]
        var plays: [String: (n: Int, skips: Int)] = [:]
        var playCounts: [String: Int] = [:]

        let sorted = history.sorted { $0.playedAt > $1.playedAt }
        for e in sorted {
            let ageDays = max(0, Double(nowMs - e.playedAt) / dayMs)
            let decay = pow(0.5, ageDays / 30.0)
            let cap = Double(min(max(e.track.durationMs, 1), 180_000))
            let ratio = min(1.0, Double(e.listenedMs) / cap)
            let signal = e.skipped ? -0.6 : (e.completed ? 1.0 : max(0.2, ratio))
            let a = e.track.artistName.lowercased()
            artistScores[a, default: 0] += signal * decay
            if let g = e.track.genre?.lowercased() {
                genreScores[g, default: 0] += signal * decay
            }
            var p = plays[e.track.id] ?? (0, 0)
            p.n += 1
            if e.skipped { p.skips += 1 }
            plays[e.track.id] = p
            if !e.skipped { playCounts[e.track.id, default: 0] += 1 }
        }
        for t in liked {
            artistScores[t.artistName.lowercased(), default: 0] += 2.0
            if let g = t.genre?.lowercased() { genreScores[g, default: 0] += 1.5 }
        }

        func norm(_ map: [String: Double]) -> [String: Double] {
            guard let m = map.values.max(), m > 0 else { return [:] }
            var out: [String: Double] = [:]
            for (k, v) in map where v > 0 { out[k] = v / m }
            return out
        }

        var skipRate: [String: Double] = [:]
        for (id, p) in plays { skipRate[id] = Double(p.skips) / Double(p.n) }

        return TasteProfile(
            artists: norm(artistScores),
            genres: norm(genreScores),
            skipRate: skipRate,
            recentIds: sorted.map(\.track.id),
            likedIds: Set(liked.map(\.id)),
            playCounts: playCounts,
            isEmpty: history.isEmpty && liked.isEmpty
        )
    }
}

/// OmniTune Smart Shuffle (Efraimidis–Spirakis weighted shuffle + artist/album gap spreading).
public enum SmartShuffle {
    public static func fisherYates<T>(_ items: [T], rng: () -> Double = { Double.random(in: 0..<1) }) -> [T] {
        var a = items
        if a.count <= 1 { return a }
        for i in stride(from: a.count - 1, through: 1, by: -1) {
            let j = Int(rng() * Double(i + 1))
            if i != j { a.swapAt(i, j) }
        }
        return a
    }

    public static func shuffle(
        _ tracks: [Track],
        taste: TasteProfile? = nil,
        startWith: Track? = nil,
        minArtistGap: Int = 4,
        rng: () -> Double = { Double.random(in: 0..<1) }
    ) -> [Track] {
        var seen = Set<String>()
        let unique = tracks.filter { seen.insert($0.id).inserted }
        let pinned = startWith.map { sw in unique.first(where: { $0.id == sw.id }) ?? sw }
        let pool = unique.filter { $0.id != pinned?.id }

        var recentRank: [String: Int] = [:]
        if let rec = taste?.recentIds.prefix(30) {
            for (i, id) in rec.enumerated() where recentRank[id] == nil { recentRank[id] = i }
        }

        let keyed: [(track: Track, key: Double)] = pool.map { track in
            var boost = 0.0
            if let taste, !taste.isEmpty {
                boost += 0.7 * (taste.artists[track.artistName.lowercased()] ?? 0)
                boost += 0.2 * (track.genre.flatMap { taste.genres[$0.lowercased()] } ?? 0)
                if taste.likedIds.contains(track.id) { boost += 0.4 }
                boost += min(0.3, Double(taste.playCounts[track.id] ?? 0) * 0.05)
                if let r = recentRank[track.id] { boost -= 0.9 * (1.0 - Double(r) / 30.0) }
                boost -= 1.2 * (taste.skipRate[track.id] ?? 0)
            }
            let w = exp(boost)
            let u = max(rng(), 1e-12)
            return (track, pow(u, 1.0 / w))
        }.sorted { $0.key > $1.key }

        let ordered = spread(keyed.map(\.track), minGap: minArtistGap, first: pinned)
        return pinned.map { [$0] + ordered } ?? ordered
    }

    private static func artistKey(_ t: Track) -> String { t.artistName.lowercased() }

    private static func spread(_ pool: [Track], minGap: Int, first: Track?) -> [Track] {
        let artists = Set(pool.map(artistKey))
        let gap = min(minGap, max(0, artists.count - 1))
        var out: [Track] = []
        var remaining = pool
        var recent: [Track] = first.map { [$0] } ?? []
        var counts: [String: Int] = [:]
        for t in pool { counts[artistKey(t), default: 0] += 1 }

        while !remaining.isEmpty {
            let maxCount = counts.values.max() ?? 0
            let tight = maxCount * (gap + 1) > remaining.count
            var pickIdx = -1

            var g = gap
            while g >= 0 && pickIdx == -1 {
                let window = g > 0 ? Array(recent.suffix(g)) : []
                let last = recent.last
                var best = -1
                for i in 0..<remaining.count {
                    let t = remaining[i]
                    if let last, let aid = t.albumId, aid == last.albumId, artists.count > 1, g > 0 { continue }
                    if window.contains(where: { artistKey($0) == artistKey(t) }) { continue }
                    if !tight {
                        best = i
                        break
                    }
                    if best == -1 || (counts[artistKey(t)] ?? 0) > (counts[artistKey(remaining[best])] ?? 0) {
                        best = i
                    }
                }
                pickIdx = best
                g -= 1
            }

            if pickIdx == -1 { pickIdx = 0 }
            let pick = remaining.remove(at: pickIdx)
            counts[artistKey(pick), default: 1] -= 1
            out.append(pick)
            recent.append(pick)
            if recent.count > 12 { recent.removeFirst() }
        }
        return out
    }
}

public enum RadioEngine {
    public static func buildRadio(seed: Track, catalog: CatalogProviding, taste: TasteProfile?, explicitFilter: Bool = false, limit: Int = 35) async -> [Track] {
        if seed.kind == .episode {
            guard let pid = seed.podcastId,
                  let res = try? await catalog.getPodcast(id: pid) else { return [] }
            return Array(res.episodes.filter { $0.id != seed.id }.prefix(limit))
        }

        var pools: [[Track]] = []
        if let aid = seed.artistId, let res = try? await catalog.getArtist(id: aid) {
            pools.append(res.topSongs)
        }
        if let gName = seed.genre {
            if let g = findGenre(gName) {
                if let list = try? await catalog.getGenreTracks(g, limit: 35) { pools.append(list) }
            } else if let res = try? await catalog.search(gName, limit: 35) {
                pools.append(res.songs)
            }
        }
        for artist in taste?.topArtists(2) ?? [] where artist != seed.artistName.lowercased() {
            if let res = try? await catalog.search(artist, limit: 15) { pools.append(res.songs) }
        }

        var seen: Set<String> = [seed.id]
        var candidates: [Track] = []
        for t in pools.flatMap({ $0 }) {
            guard seen.insert(t.id).inserted, t.kind == .song, t.audioUrl != nil else { continue }
            if explicitFilter && t.explicit { continue }
            candidates.append(t)
        }

        let scored: [(Track, Double)] = candidates.map { t in
            var s = 0.0
            if let a = seed.artistId, t.artistId == a { s += 0.8 }
            if let g = seed.genre, t.genre == g { s += 0.6 }
            if let taste {
                s += 0.8 * (taste.artists[t.artistName.lowercased()] ?? 0)
                if taste.likedIds.contains(t.id) { s += 0.3 }
                if let rec = taste.recentIds.firstIndex(of: t.id), rec < 50 { s -= 0.7 }
                else if taste.playCounts[t.id] == nil { s += 0.25 }
                s -= (taste.skipRate[t.id] ?? 0)
            }
            return (t, s + Double.random(in: 0...0.6))
        }.sorted { $0.1 > $1.1 }

        let top = scored.prefix(limit * 2).map(\.0)
        return Array(SmartShuffle.shuffle(top, minArtistGap: 3).prefix(limit))
    }

    public static func buildMixes(catalog: CatalogProviding, taste: TasteProfile, recent: [Track], explicitFilter: Bool = false) async -> [Mix] {
        func ok(_ t: Track) -> Bool { t.kind == .song && t.audioUrl != nil && !(explicitFilter && t.explicit) }
        func mosaic(_ tracks: [Track]) -> [String] {
            var seen = Set<String>()
            return tracks.compactMap { $0.artworkUrl.isEmpty ? nil : $0.artworkUrl }.filter { seen.insert($0).inserted }.prefix(4).map { $0 }
        }

        var mixes: [Mix] = []
        if !taste.isEmpty {
            let byId = Dictionary(recent.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            let onRepeat = taste.playCounts.sorted { $0.value > $1.value }.prefix(25).compactMap { byId[$0.key] }.filter(ok)
            if onRepeat.count >= 5 {
                let list = SmartShuffle.shuffle(onRepeat)
                mixes.append(Mix(id: "on-repeat", name: "On Repeat", description: "Songs you can’t stop playing", tracks: list, artwork: mosaic(list), hexColor: "#FA2D48"))
            }

            let genres = taste.topGenres(3)
            let colors = ["#FA2D48", "#5E5CE6", "#FF9F0A"]
            for (i, g) in genres.enumerated() {
                let tracks: [Track]
                if let match = findGenre(g), let list = try? await catalog.getGenreTracks(match, limit: 35) {
                    tracks = list.filter(ok)
                } else {
                    tracks = ((try? await catalog.search(g, limit: 35).songs) ?? []).filter(ok)
                }
                let shuffled = Array(SmartShuffle.shuffle(tracks, taste: taste).prefix(30))
                if shuffled.count >= 6 {
                    let artists = Array(NSOrderedSet(array: shuffled.map(\.artistName)).compactMap { $0 as? String }.prefix(3)).joined(separator: ", ")
                    mixes.append(Mix(id: "daily-\(i + 1)", name: "Daily Mix \(i + 1)", description: "\(artists) and more", tracks: shuffled, artwork: mosaic(shuffled), hexColor: colors[i % colors.count]))
                }
            }
        } else {
            let starters = Array(kOmniTuneGenres.prefix(4))
            for (i, g) in starters.enumerated() {
                if let list = try? await catalog.getGenreTracks(g, limit: 30) {
                    let filtered = Array(SmartShuffle.shuffle(list.filter(ok)).prefix(25))
                    if filtered.count >= 6 {
                        mixes.append(Mix(id: "starter-\(i + 1)", name: "\(g.name) Mix", description: "Start here: the best of \(g.name)", tracks: filtered, artwork: mosaic(filtered), hexColor: g.hexColor))
                    }
                }
            }
        }
        return mixes
    }

    @MainActor
    public static func buildHomeFeed(catalog: CatalogProviding, library: LibraryStore) async -> [HomeShelf] {
        let taste = library.taste()
        let recent = library.recentlyPlayed(limit: 20)
        let settings = library.settings
        var shelves: [HomeShelf] = []

        if !recent.isEmpty {
            shelves.append(HomeShelf(id: "recent", title: "Jump Back In", items: recent.prefix(12).map { .track($0) }))
        }
        let playlists = library.playlists
        if !playlists.isEmpty {
            shelves.append(HomeShelf(id: "playlists", title: "Your Playlists", items: playlists.prefix(12).map { .playlist($0) }))
        }

        async let mixes = buildMixes(catalog: catalog, taste: taste, recent: recent, explicitFilter: settings.explicitFilter)
        async let songs = (try? catalog.getTopSongs(limit: 25)) ?? []
        async let albums = (try? catalog.getTopAlbums(limit: 18)) ?? []
        async let releases = (try? catalog.getNewReleases(limit: 18)) ?? []
        async let podcasts = (try? catalog.getTopPodcasts(limit: 14)) ?? []

        let (m, s, a, r, p) = await (mixes, songs, albums, releases, podcasts)
        if !m.isEmpty {
            shelves.append(HomeShelf(id: "mixes", title: taste.isEmpty ? "Start Listening" : "Made for You", subtitle: taste.isEmpty ? "Play a few songs to personalize your mixes" : "Built from what you play, like and skip", items: m.map { .mix($0) }))
        }
        if !s.isEmpty {
            shelves.append(HomeShelf(id: "top-songs", title: "Top Songs Right Now", items: s.map { .track($0) }))
        }
        if !r.isEmpty {
            shelves.append(HomeShelf(id: "new", title: "New Releases", items: r.map { .album($0) }))
        }
        if !a.isEmpty {
            shelves.append(HomeShelf(id: "top-albums", title: "Popular Albums", items: a.map { .album($0) }))
        }
        if !p.isEmpty {
            shelves.append(HomeShelf(id: "podcasts", title: "Popular Podcasts", items: p.map { .podcast($0) }))
        }
        return shelves
    }
}
