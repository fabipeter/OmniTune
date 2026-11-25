import Foundation

public protocol CatalogProviding: Sendable {
    func search(_ query: String, limit: Int) async throws -> SearchResults
    func getTracks(ids: [String]) async throws -> [Track]
    func getAlbum(id: String) async throws -> (album: Album, tracks: [Track])
    func getArtist(id: String) async throws -> (artist: Artist, topSongs: [Track], albums: [Album])
    func getArtistArtwork(id: String) async -> String?
    func getPodcast(id: String) async throws -> (podcast: Podcast, episodes: [Track])
    func getTopSongs(limit: Int) async throws -> [Track]
    func getTopAlbums(limit: Int) async throws -> [Album]
    func getNewReleases(limit: Int) async throws -> [Album]
    func getTopPodcasts(limit: Int) async throws -> [Podcast]
    func getGenreTracks(_ genre: Genre, limit: Int) async throws -> [Track]
}

private struct ITunesResponse: Decodable, Sendable {
    let results: [ITunesRow]?
}

private struct ITunesRow: Decodable, Sendable {
    let wrapperType: String?
    let kind: String?
    let trackId: Int?
    let collectionId: Int?
    let artistId: Int?
    let trackName: String?
    let collectionName: String?
    let artistName: String?
    let artworkUrl100: String?
    let artworkUrl60: String?
    let artworkUrl160: String?
    let artworkUrl600: String?
    let trackTimeMillis: Int?
    let previewUrl: String?
    let episodeUrl: String?
    let primaryGenreName: String?
    let releaseDate: String?
    let trackExplicitness: String?
    let collectionExplicitness: String?
    let trackNumber: Int?
    let discNumber: Int?
    let trackCount: Int?
    let trackViewUrl: String?
    let collectionViewUrl: String?
    let artistLinkUrl: String?
    let feedUrl: String?
    let description: String?
    let shortDescription: String?
}

private struct RSSResponse: Decodable, Sendable {
    struct Feed: Decodable, Sendable {
        struct Item: Decodable, Sendable {
            let id: String
        }
        let results: [Item]?
    }
    let feed: Feed?
}

/// Apple-backed catalog client (iTunes Search/Lookup API + Apple Marketing Tools RSS charts).
public actor AppleCatalog: CatalogProviding {
    private var country: String
    private let session: URLSession
    private var cache: [String: (at: Date, data: Data)] = [:]
    private let ttl: TimeInterval = 600

    public init(country: String = "us", session: URLSession = .shared) {
        self.country = country.lowercased()
        self.session = session
    }

    public func setCountry(_ code: String) {
        self.country = code.lowercased()
        self.cache.removeAll()
    }

    private func fetchData(_ urlString: String) async throws -> Data {
        if let hit = cache[urlString], Date().timeIntervalSince(hit.at) < ttl {
            return hit.data
        }
        guard let url = URL(string: urlString) else { throw URLError(.badURL) }
        var lastError: Error = URLError(.badServerResponse)
        for attempt in 0..<3 {
            do {
                let (data, response) = try await session.data(from: url)
                if let http = response as? HTTPURLResponse, http.statusCode == 429 || http.statusCode >= 500 {
                    try await Task.sleep(nanoseconds: UInt64(500_000_000 * (attempt + 1)))
                    continue
                }
                cache[urlString] = (Date(), data)
                return data
            } catch {
                lastError = error
                try? await Task.sleep(nanoseconds: UInt64(300_000_000 * (attempt + 1)))
            }
        }
        throw lastError
    }

    private func itunesURL(_ endpoint: String, params: [String: String]) -> String {
        var comps = URLComponents(string: "https://itunes.apple.com/\(endpoint)")!
        var items = [URLQueryItem(name: "country", value: country)]
        for (k, v) in params.sorted(by: { $0.key < $1.key }) {
            items.append(URLQueryItem(name: k, value: v))
        }
        comps.queryItems = items
        return comps.url!.absoluteString
    }

    private func iSearch(_ params: [String: String]) async throws -> [ITunesRow] {
        let data = try await fetchData(itunesURL("search", params: params))
        return (try JSONDecoder().decode(ITunesResponse.self, from: data)).results ?? []
    }

    private func iLookup(_ params: [String: String]) async throws -> [ITunesRow] {
        let data = try await fetchData(itunesURL("lookup", params: params))
        return (try JSONDecoder().decode(ITunesResponse.self, from: data)).results ?? []
    }

    private func chartIds(_ path: String) async throws -> [String] {
        let data = try await fetchData("https://rss.marketingtools.apple.com/api/v2/\(country)/\(path).json")
        return (try JSONDecoder().decode(RSSResponse.self, from: data)).feed?.results?.map(\.id) ?? []
    }

    public func search(_ query: String, limit: Int = 20) async throws -> SearchResults {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return SearchResults() }

        async let songsRaw = (try? iSearch(["term": q, "media": "music", "entity": "song", "limit": "\(limit)"])) ?? []
        async let albumsRaw = (try? iSearch(["term": q, "media": "music", "entity": "album", "limit": "\(limit)"])) ?? []
        async let artistsRaw = (try? iSearch(["term": q, "media": "music", "entity": "musicArtist", "limit": "\(min(limit, 12))"])) ?? []
        async let podsRaw = (try? iSearch(["term": q, "media": "podcast", "entity": "podcast", "limit": "\(min(limit, 15))"])) ?? []
        async let epsRaw = (try? iSearch(["term": q, "media": "podcast", "entity": "podcastEpisode", "limit": "\(min(limit, 15))"])) ?? []

        return await SearchResults(
            songs: songsRaw.compactMap(Self.mapSong),
            albums: albumsRaw.compactMap(Self.mapAlbum),
            artists: artistsRaw.compactMap(Self.mapArtist),
            podcasts: podsRaw.compactMap(Self.mapPodcast),
            episodes: epsRaw.compactMap(Self.mapEpisode)
        )
    }

    public func getTracks(ids: [String]) async throws -> [Track] {
        guard !ids.isEmpty else { return [] }
        var byId: [String: Track] = [:]
        var idx = 0
        while idx < ids.count {
            let chunk = Array(ids[idx..<min(idx + 100, ids.count)])
            idx += 100
            let rows = try await iLookup(["id": chunk.joined(separator: ","), "entity": "song"])
            for r in rows {
                if let t = Self.mapSong(r) { byId[t.id] = t }
            }
        }
        return ids.compactMap { byId[$0] }
    }

    public func getAlbum(id: String) async throws -> (album: Album, tracks: [Track]) {
        let rows = try await iLookup(["id": id, "entity": "song", "limit": "200"])
        guard let head = rows.first(where: { $0.wrapperType == "collection" }),
              let album = Self.mapAlbum(head) else {
            throw URLError(.resourceUnavailable)
        }
        let tracks = rows
            .compactMap(Self.mapSong)
            .sorted { ($0.discNumber ?? 1, $0.trackNumber ?? 0) < ($1.discNumber ?? 1, $1.trackNumber ?? 0) }
        return (album, tracks)
    }

    public func getArtist(id: String) async throws -> (artist: Artist, topSongs: [Track], albums: [Album]) {
        async let songRows = iLookup(["id": id, "entity": "song", "limit": "25"])
        async let albumRows = iLookup(["id": id, "entity": "album", "limit": "50"])
        let (sRows, aRows) = try await (songRows, albumRows)
        guard let head = sRows.first(where: { $0.wrapperType == "artist" })
            ?? aRows.first(where: { $0.wrapperType == "artist" }),
              var artist = Self.mapArtist(head) else {
            throw URLError(.resourceUnavailable)
        }
        let topSongs = sRows.compactMap(Self.mapSong)
        let albums = aRows.compactMap(Self.mapAlbum).sorted { ($0.releaseDate ?? "") > ($1.releaseDate ?? "") }
        artist.artworkUrl = albums.first?.artworkUrl ?? topSongs.first?.artworkUrl
        return (artist, topSongs, albums)
    }

    public func getArtistArtwork(id: String) async -> String? {
        guard let rows = try? await iLookup(["id": id, "entity": "album", "limit": "1"]) else { return nil }
        return rows.first(where: { $0.wrapperType == "collection" })?.artworkUrl100
    }

    public func getPodcast(id: String) async throws -> (podcast: Podcast, episodes: [Track]) {
        let rows = try await iLookup(["id": id, "media": "podcast", "entity": "podcastEpisode", "limit": "150"])
        guard let head = rows.first(where: { $0.kind == "podcast" }),
              let podcast = Self.mapPodcast(head) else {
            throw URLError(.resourceUnavailable)
        }
        let episodes = rows.filter { $0.kind == "podcast-episode" }.compactMap(Self.mapEpisode)
        return (podcast, episodes)
    }

    public func getTopSongs(limit: Int = 30) async throws -> [Track] {
        if let ids = try? await chartIds("music/most-played/\(limit)/songs"), !ids.isEmpty {
            return try await getTracks(ids: ids)
        }
        return try await search("top hits", limit: limit).songs
    }

    public func getTopAlbums(limit: Int = 20) async throws -> [Album] {
        if let ids = try? await chartIds("music/most-played/\(limit)/albums"), !ids.isEmpty {
            let rows = try await iLookup(["id": ids.joined(separator: ","), "entity": "album"])
            let map = Dictionary(uniqueKeysWithValues: rows.compactMap(Self.mapAlbum).map { ($0.id, $0) })
            return ids.compactMap { map[$0] }
        }
        return try await search("top albums", limit: limit).albums
    }

    public func getNewReleases(limit: Int = 20) async throws -> [Album] {
        try await search("new music 2026", limit: limit).albums
    }

    public func getTopPodcasts(limit: Int = 15) async throws -> [Podcast] {
        if let ids = try? await chartIds("podcasts/top/\(limit)/podcasts"), !ids.isEmpty {
            let rows = try await iLookup(["id": ids.joined(separator: ","), "media": "podcast"])
            return rows.compactMap(Self.mapPodcast)
        }
        return try await search("popular podcasts", limit: limit).podcasts
    }

    public func getGenreTracks(_ genre: Genre, limit: Int = 40) async throws -> [Track] {
        try await search(genre.term, limit: limit).songs
    }

    // MARK: - Mappers

    private static func mapSong(_ r: ITunesRow) -> Track? {
        guard (r.kind == "song" || r.wrapperType == "track"), r.kind != "podcast", r.kind != "podcast-episode",
              let id = r.trackId, let title = r.trackName, let artist = r.artistName else { return nil }
        return Track(
            id: String(id),
            kind: .song,
            title: title,
            artistName: artist,
            artistId: r.artistId.map(String.init),
            albumName: r.collectionName,
            albumId: r.collectionId.map(String.init),
            artworkUrl: r.artworkUrl100 ?? r.artworkUrl60 ?? "",
            durationMs: r.trackTimeMillis ?? 30_000,
            audioUrl: r.previewUrl,
            isPreview: true,
            genre: r.primaryGenreName,
            releaseDate: r.releaseDate,
            explicit: r.trackExplicitness == "explicit",
            trackNumber: r.trackNumber,
            discNumber: r.discNumber,
            storeUrl: r.trackViewUrl
        )
    }

    private static func mapAlbum(_ r: ITunesRow) -> Album? {
        guard r.wrapperType != "track",
              let id = r.collectionId, let title = r.collectionName, let artist = r.artistName else { return nil }
        return Album(
            id: String(id),
            title: title,
            artistName: artist,
            artistId: r.artistId.map(String.init),
            artworkUrl: r.artworkUrl100 ?? r.artworkUrl60 ?? "",
            releaseDate: r.releaseDate,
            genre: r.primaryGenreName,
            trackCount: r.trackCount,
            explicit: r.collectionExplicitness == "explicit",
            storeUrl: r.collectionViewUrl
        )
    }

    private static func mapArtist(_ r: ITunesRow) -> Artist? {
        guard let id = r.artistId, let name = r.artistName else { return nil }
        return Artist(id: String(id), name: name, genre: r.primaryGenreName, storeUrl: r.artistLinkUrl)
    }

    private static func mapPodcast(_ r: ITunesRow) -> Podcast? {
        guard let id = r.collectionId, let title = r.collectionName, let author = r.artistName else { return nil }
        return Podcast(
            id: String(id),
            title: title,
            author: author,
            artworkUrl: r.artworkUrl600 ?? r.artworkUrl100 ?? "",
            feedUrl: r.feedUrl,
            genre: r.primaryGenreName,
            episodeCount: r.trackCount,
            storeUrl: r.collectionViewUrl
        )
    }

    private static func mapEpisode(_ r: ITunesRow) -> Track? {
        guard let id = r.trackId, let title = r.trackName, let show = r.collectionName else { return nil }
        return Track(
            id: String(id),
            kind: .episode,
            title: title,
            artistName: show,
            podcastId: r.collectionId.map(String.init),
            artworkUrl: r.artworkUrl160 ?? r.artworkUrl600 ?? r.artworkUrl100 ?? "",
            durationMs: r.trackTimeMillis ?? 0,
            audioUrl: r.episodeUrl,
            isPreview: false,
            releaseDate: r.releaseDate,
            storeUrl: r.trackViewUrl,
            description: r.description ?? r.shortDescription
        )
    }
}
