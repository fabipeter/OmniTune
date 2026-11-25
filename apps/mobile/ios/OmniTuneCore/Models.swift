import Foundation

public enum TrackKind: String, Codable, Sendable, Hashable {
    case song
    case episode
}

public struct Track: Identifiable, Codable, Sendable, Hashable {
    public let id: String
    public let kind: TrackKind
    public let title: String
    public let artistName: String
    public let artistId: String?
    public let albumName: String?
    public let albumId: String?
    public let podcastId: String?
    public let artworkUrl: String
    public let durationMs: Int
    public let audioUrl: String?
    public let isPreview: Bool
    public let genre: String?
    public let releaseDate: String?
    public let explicit: Bool
    public let trackNumber: Int?
    public let discNumber: Int?
    public let storeUrl: String?
    public let description: String?

    public init(
        id: String,
        kind: TrackKind = .song,
        title: String,
        artistName: String,
        artistId: String? = nil,
        albumName: String? = nil,
        albumId: String? = nil,
        podcastId: String? = nil,
        artworkUrl: String = "",
        durationMs: Int = 30_000,
        audioUrl: String? = nil,
        isPreview: Bool = true,
        genre: String? = nil,
        releaseDate: String? = nil,
        explicit: Bool = false,
        trackNumber: Int? = nil,
        discNumber: Int? = nil,
        storeUrl: String? = nil,
        description: String? = nil
    ) {
        self.id = id
        self.kind = kind
        self.title = title
        self.artistName = artistName
        self.artistId = artistId
        self.albumName = albumName
        self.albumId = albumId
        self.podcastId = podcastId
        self.artworkUrl = artworkUrl
        self.durationMs = durationMs
        self.audioUrl = audioUrl
        self.isPreview = isPreview
        self.genre = genre
        self.releaseDate = releaseDate
        self.explicit = explicit
        self.trackNumber = trackNumber
        self.discNumber = discNumber
        self.storeUrl = storeUrl
        self.description = description
    }
}

public struct Album: Identifiable, Codable, Sendable, Hashable {
    public let id: String
    public let title: String
    public let artistName: String
    public let artistId: String?
    public let artworkUrl: String
    public let releaseDate: String?
    public let genre: String?
    public let trackCount: Int?
    public let explicit: Bool
    public let storeUrl: String?

    public init(
        id: String,
        title: String,
        artistName: String,
        artistId: String? = nil,
        artworkUrl: String = "",
        releaseDate: String? = nil,
        genre: String? = nil,
        trackCount: Int? = nil,
        explicit: Bool = false,
        storeUrl: String? = nil
    ) {
        self.id = id
        self.title = title
        self.artistName = artistName
        self.artistId = artistId
        self.artworkUrl = artworkUrl
        self.releaseDate = releaseDate
        self.genre = genre
        self.trackCount = trackCount
        self.explicit = explicit
        self.storeUrl = storeUrl
    }
}

public struct Artist: Identifiable, Codable, Sendable, Hashable {
    public let id: String
    public let name: String
    public let genre: String?
    public let storeUrl: String?
    public var artworkUrl: String?

    public init(id: String, name: String, genre: String? = nil, storeUrl: String? = nil, artworkUrl: String? = nil) {
        self.id = id
        self.name = name
        self.genre = genre
        self.storeUrl = storeUrl
        self.artworkUrl = artworkUrl
    }
}

public struct Podcast: Identifiable, Codable, Sendable, Hashable {
    public let id: String
    public let title: String
    public let author: String
    public let artworkUrl: String
    public let feedUrl: String?
    public let genre: String?
    public let episodeCount: Int?
    public let storeUrl: String?

    public init(
        id: String,
        title: String,
        author: String,
        artworkUrl: String = "",
        feedUrl: String? = nil,
        genre: String? = nil,
        episodeCount: Int? = nil,
        storeUrl: String? = nil
    ) {
        self.id = id
        self.title = title
        self.author = author
        self.artworkUrl = artworkUrl
        self.feedUrl = feedUrl
        self.genre = genre
        self.episodeCount = episodeCount
        self.storeUrl = storeUrl
    }
}

public struct Genre: Identifiable, Sendable, Hashable {
    public let id: String
    public let name: String
    public let hexColor: String
    public let term: String

    public init(id: String, name: String, hexColor: String, term: String) {
        self.id = id
        self.name = name
        self.hexColor = hexColor
        self.term = term
    }
}

public let kOmniTuneGenres: [Genre] = [
    Genre(id: "pop", name: "Pop", hexColor: "#8D67AB", term: "pop hits"),
    Genre(id: "hiphop", name: "Hip-Hop", hexColor: "#BA5D07", term: "hip hop rap"),
    Genre(id: "rock", name: "Rock", hexColor: "#E91429", term: "rock classics"),
    Genre(id: "dance", name: "Dance & Electronic", hexColor: "#0D73EC", term: "electronic dance"),
    Genre(id: "rnb", name: "R&B", hexColor: "#DC148C", term: "r&b soul"),
    Genre(id: "latin", name: "Latin", hexColor: "#E8115B", term: "latin reggaeton"),
    Genre(id: "country", name: "Country", hexColor: "#BC5900", term: "country hits"),
    Genre(id: "indie", name: "Indie & Alternative", hexColor: "#608108", term: "indie alternative"),
    Genre(id: "kpop", name: "K-Pop", hexColor: "#477D95", term: "k-pop"),
    Genre(id: "afro", name: "Afrobeats", hexColor: "#148A08", term: "afrobeats"),
    Genre(id: "jazz", name: "Jazz", hexColor: "#1E3264", term: "jazz"),
    Genre(id: "classical", name: "Classical", hexColor: "#7D4B32", term: "classical piano orchestra"),
    Genre(id: "metal", name: "Metal", hexColor: "#5F4B8B", term: "heavy metal"),
    Genre(id: "chill", name: "Chill", hexColor: "#D84000", term: "chill lofi"),
    Genre(id: "workout", name: "Workout", hexColor: "#4F5D75", term: "workout energy"),
    Genre(id: "focus", name: "Focus", hexColor: "#503750", term: "focus ambient instrumental"),
]

public func findGenre(_ idOrName: String) -> Genre? {
    let lower = idOrName.lowercased()
    return kOmniTuneGenres.first { $0.id == lower || $0.name.lowercased() == lower }
}

public struct SearchResults: Sendable {
    public var songs: [Track] = []
    public var albums: [Album] = []
    public var artists: [Artist] = []
    public var podcasts: [Podcast] = []
    public var episodes: [Track] = []

    public init(songs: [Track] = [], albums: [Album] = [], artists: [Artist] = [], podcasts: [Podcast] = [], episodes: [Track] = []) {
        self.songs = songs
        self.albums = albums
        self.artists = artists
        self.podcasts = podcasts
        self.episodes = episodes
    }
}

public struct Playlist: Identifiable, Codable, Sendable, Hashable {
    public let id: String
    public var name: String
    public var description: String?
    public var tracks: [Track]
    public var pinned: Bool
    public let createdAt: Int64
    public var updatedAt: Int64

    public init(
        id: String,
        name: String,
        description: String? = nil,
        tracks: [Track] = [],
        pinned: Bool = false,
        createdAt: Int64,
        updatedAt: Int64
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.tracks = tracks
        self.pinned = pinned
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public struct Mix: Identifiable, Sendable, Hashable {
    public let id: String
    public let name: String
    public let description: String
    public let tracks: [Track]
    public let artwork: [String]
    public let hexColor: String

    public init(id: String, name: String, description: String, tracks: [Track], artwork: [String], hexColor: String) {
        self.id = id
        self.name = name
        self.description = description
        self.tracks = tracks
        self.artwork = artwork
        self.hexColor = hexColor
    }
}

public enum ShelfItem: Identifiable, Sendable, Hashable {
    case track(Track)
    case album(Album)
    case artist(Artist)
    case podcast(Podcast)
    case mix(Mix)
    case playlist(Playlist)

    public var id: String {
        switch self {
        case .track(let t): return "t-\(t.id)"
        case .album(let a): return "a-\(a.id)"
        case .artist(let a): return "ar-\(a.id)"
        case .podcast(let p): return "p-\(p.id)"
        case .mix(let m): return "m-\(m.id)"
        case .playlist(let p): return "pl-\(p.id)"
        }
    }
}

public struct HomeShelf: Identifiable, Sendable {
    public let id: String
    public let title: String
    public let subtitle: String?
    public let items: [ShelfItem]

    public init(id: String, title: String, subtitle: String? = nil, items: [ShelfItem]) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.items = items
    }
}

public struct HistoryEvent: Identifiable, Codable, Sendable, Hashable {
    public let id: String
    public let track: Track
    public let playedAt: Int64
    public let listenedMs: Int
    public let completed: Bool
    public let skipped: Bool
    public let contextType: String?
    public let contextId: String?

    public init(
        id: String,
        track: Track,
        playedAt: Int64,
        listenedMs: Int,
        completed: Bool,
        skipped: Bool,
        contextType: String? = nil,
        contextId: String? = nil
    ) {
        self.id = id
        self.track = track
        self.playedAt = playedAt
        self.listenedMs = listenedMs
        self.completed = completed
        self.skipped = skipped
        self.contextType = contextType
        self.contextId = contextId
    }
}

public enum AudioQuality: String, Codable, Sendable, CaseIterable {
    case auto, high, lossless
}

public enum ShuffleMode: String, Codable, Sendable, CaseIterable {
    case smart, random
}

public enum AppTheme: String, Codable, Sendable, CaseIterable {
    case system, dark, light
}

public struct AppSettings: Codable, Sendable, Equatable {
    public var country: String = "us"
    public var audioQuality: AudioQuality = .lossless
    public var crossfadeMs: Int = 0
    public var gapless: Bool = true
    public var normalizeVolume: Bool = true
    public var autoplay: Bool = true
    public var shuffleMode: ShuffleMode = .smart
    public var explicitFilter: Bool = false
    public var theme: AppTheme = .system
    public var serverUrl: String = "http://localhost:8787"

    public init() {}
}

public struct LyricLine: Identifiable, Sendable, Equatable {
    public var id: String { "\(timeMs)-\(text)" }
    public let timeMs: Int
    public let text: String

    public init(timeMs: Int, text: String) {
        self.timeMs = timeMs
        self.text = text
    }
}

public struct Lyrics: Sendable, Equatable {
    public let synced: [LyricLine]?
    public let plain: String?
    public let instrumental: Bool

    public init(synced: [LyricLine]?, plain: String?, instrumental: Bool) {
        self.synced = synced
        self.plain = plain
        self.instrumental = instrumental
    }
}

public enum RepeatMode: String, Codable, Sendable {
    case off, all, one
}

public struct PlaybackContext: Codable, Sendable, Equatable {
    public let type: String
    public let id: String?
    public let name: String?

    public init(type: String, id: String? = nil, name: String? = nil) {
        self.type = type
        self.id = id
        self.name = name
    }
}

public struct QueueItem: Identifiable, Codable, Sendable, Equatable {
    public var id: String { uid }
    public let uid: String
    public let track: Track

    public init(uid: String = UUID().uuidString, track: Track) {
        self.uid = uid
        self.track = track
    }
}

// MARK: - Helpers

public func artworkAt(_ url: String?, size: Int = 300) -> URL? {
    guard let url, !url.isEmpty else { return nil }
    let pattern = #"/\d+x\d+(bb|cc|sr)?\.(jpg|png|webp)$"#
    let replaced = url.replacingOccurrences(of: pattern, with: "/\(size)x\(size)bb.jpg", options: [.regularExpression, .caseInsensitive])
    return URL(string: replaced)
}

public func formatDuration(_ ms: Int) -> String {
    let total = max(0, ms / 1000)
    let h = total / 3600
    let m = (total % 3600) / 60
    let s = total % 60
    if h > 0 {
        return String(format: "%d:%02d:%02d", h, m, s)
    }
    return String(format: "%d:%02d", m, s)
}

public func timeGreeting(date: Date = Date()) -> String {
    let hour = Calendar.current.component(.hour, from: date)
    switch hour {
    case 0..<5: return "Good Night"
    case 5..<12: return "Good Morning"
    case 12..<18: return "Good Afternoon"
    default: return "Good Evening"
    }
}
