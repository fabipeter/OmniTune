import Foundation
import Observation

public struct SyncEntry<T: Codable & Sendable>: Codable, Sendable {
    public let id: String
    public var value: T?
    public var updatedAt: Int64
    public var deleted: Bool?

    public init(id: String, value: T?, updatedAt: Int64, deleted: Bool? = nil) {
        self.id = id
        self.value = value
        self.updatedAt = updatedAt
        self.deleted = deleted
    }
}

public struct LibraryStateFile: Codable, Sendable {
    public var likedTracks: [String: SyncEntry<Track>] = [:]
    public var savedAlbums: [String: SyncEntry<Album>] = [:]
    public var followedArtists: [String: SyncEntry<Artist>] = [:]
    public var followedPodcasts: [String: SyncEntry<Podcast>] = [:]
    public var playlists: [String: SyncEntry<Playlist>] = [:]
    public var history: [String: SyncEntry<HistoryEvent>] = [:]
    public var episodeProgress: [String: SyncEntry<Int>] = [:]
    public var settings: [String: SyncEntry<AppSettings>] = [:]
    public var recentSearches: [String] = []
}

public struct SessionUser: Codable, Sendable, Equatable {
    public let id: String
    public let email: String
    public let displayName: String
}

/// Local-first observable store persisted as JSON; supports LWW sync with apps/server.
@MainActor
@Observable
public final class LibraryStore {
    public private(set) var version: Int = 0
    private var state = LibraryStateFile()
    private let fileURL: URL?
    public var user: SessionUser?
    public var authToken: String?
    private var syncCursor: Int = 0
    private var lastPushedMs: Int64 = 0

    public init(fileURL: URL? = LibraryStore.defaultFileURL()) {
        self.fileURL = fileURL
        load()
    }

    public static func defaultFileURL() -> URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent("OmniTune", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("library.v1.json")
    }

    private func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

    private func touch() {
        version += 1
        save()
    }

    private func load() {
        guard let fileURL, let data = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder().decode(LibraryStateFile.self, from: data) else { return }
        state = decoded
    }

    private func save() {
        guard let fileURL, let data = try? JSONEncoder().encode(state) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    // MARK: - Liked Songs
    public func isLiked(_ id: String) -> Bool {
        guard let e = state.likedTracks[id] else { return false }
        return e.deleted != true && e.value != nil
    }
    public var likedTracks: [Track] {
        state.likedTracks.values.filter { $0.deleted != true }.sorted { $0.updatedAt > $1.updatedAt }.compactMap(\.value)
    }
    @discardableResult
    public func toggleLike(_ track: Track) -> Bool {
        let now = nowMs()
        let next = !isLiked(track.id)
        if next {
            state.likedTracks[track.id] = SyncEntry(id: track.id, value: track, updatedAt: now)
        } else {
            state.likedTracks[track.id] = SyncEntry(id: track.id, value: track, updatedAt: now, deleted: true)
        }
        touch()
        return next
    }

    // MARK: - Albums, Artists, Podcasts
    public func isAlbumSaved(_ id: String) -> Bool { state.savedAlbums[id]?.deleted != true && state.savedAlbums[id]?.value != nil }
    public var savedAlbums: [Album] {
        state.savedAlbums.values.filter { $0.deleted != true }.sorted { $0.updatedAt > $1.updatedAt }.compactMap(\.value)
    }
    public func toggleAlbum(_ album: Album) {
        let now = nowMs()
        state.savedAlbums[album.id] = isAlbumSaved(album.id)
            ? SyncEntry(id: album.id, value: album, updatedAt: now, deleted: true)
            : SyncEntry(id: album.id, value: album, updatedAt: now)
        touch()
    }

    public func isArtistFollowed(_ id: String) -> Bool { state.followedArtists[id]?.deleted != true && state.followedArtists[id]?.value != nil }
    public var followedArtists: [Artist] {
        state.followedArtists.values.filter { $0.deleted != true }.sorted { $0.updatedAt > $1.updatedAt }.compactMap(\.value)
    }
    public func toggleArtist(_ artist: Artist) {
        let now = nowMs()
        state.followedArtists[artist.id] = isArtistFollowed(artist.id)
            ? SyncEntry(id: artist.id, value: artist, updatedAt: now, deleted: true)
            : SyncEntry(id: artist.id, value: artist, updatedAt: now)
        touch()
    }

    public func isPodcastFollowed(_ id: String) -> Bool { state.followedPodcasts[id]?.deleted != true && state.followedPodcasts[id]?.value != nil }
    public var followedPodcasts: [Podcast] {
        state.followedPodcasts.values.filter { $0.deleted != true }.sorted { $0.updatedAt > $1.updatedAt }.compactMap(\.value)
    }
    public func togglePodcast(_ p: Podcast) {
        let now = nowMs()
        state.followedPodcasts[p.id] = isPodcastFollowed(p.id)
            ? SyncEntry(id: p.id, value: p, updatedAt: now, deleted: true)
            : SyncEntry(id: p.id, value: p, updatedAt: now)
        touch()
    }

    // MARK: - Playlists
    public var playlists: [Playlist] {
        state.playlists.values.filter { $0.deleted != true }.compactMap(\.value).sorted {
            if $0.pinned != $1.pinned { return $0.pinned }
            return $0.updatedAt > $1.updatedAt
        }
    }
    public func playlist(id: String) -> Playlist? {
        guard let e = state.playlists[id], e.deleted != true else { return nil }
        return e.value
    }
    @discardableResult
    public func createPlaylist(name: String, tracks: [Track] = [], description: String? = nil) -> Playlist {
        let now = nowMs()
        let pl = Playlist(id: "pl_\(UUID().uuidString.prefix(12))", name: name.trimmingCharacters(in: .whitespaces).isEmpty ? "New Playlist" : name, description: description, tracks: dedupe(tracks), pinned: false, createdAt: now, updatedAt: now)
        state.playlists[pl.id] = SyncEntry(id: pl.id, value: pl, updatedAt: now)
        touch()
        return pl
    }
    public func renamePlaylist(id: String, name: String, description: String? = nil) {
        guard var pl = playlist(id: id) else { return }
        let now = nowMs()
        if !name.trimmingCharacters(in: .whitespaces).isEmpty { pl.name = name.trimmingCharacters(in: .whitespaces) }
        if let description { pl.description = description }
        pl.updatedAt = now
        state.playlists[id] = SyncEntry(id: id, value: pl, updatedAt: now)
        touch()
    }
    public func togglePinPlaylist(id: String) {
        guard var pl = playlist(id: id) else { return }
        let now = nowMs()
        pl.pinned.toggle()
        pl.updatedAt = now
        state.playlists[id] = SyncEntry(id: id, value: pl, updatedAt: now)
        touch()
    }
    public func deletePlaylist(id: String) {
        state.playlists[id] = SyncEntry(id: id, value: nil, updatedAt: nowMs(), deleted: true)
        touch()
    }
    public func addToPlaylist(id: String, tracks: [Track]) {
        guard var pl = playlist(id: id) else { return }
        let now = nowMs()
        pl.tracks = dedupe(pl.tracks + tracks)
        pl.updatedAt = now
        state.playlists[id] = SyncEntry(id: id, value: pl, updatedAt: now)
        touch()
    }
    public func removeFromPlaylist(id: String, trackId: String) {
        guard var pl = playlist(id: id) else { return }
        let now = nowMs()
        pl.tracks.removeAll { $0.id == trackId }
        pl.updatedAt = now
        state.playlists[id] = SyncEntry(id: id, value: pl, updatedAt: now)
        touch()
    }
    public func moveInPlaylist(id: String, fromOffsets: IndexSet, toOffset: Int) {
        guard var pl = playlist(id: id) else { return }
        let now = nowMs()
        let items = fromOffsets.map { pl.tracks[$0] }
        for idx in fromOffsets.sorted(by: >) { pl.tracks.remove(at: idx) }
        let dest = min(toOffset - fromOffsets.filter { $0 < toOffset }.count, pl.tracks.count)
        pl.tracks.insert(contentsOf: items, at: max(0, dest))
        pl.updatedAt = now
        state.playlists[id] = SyncEntry(id: id, value: pl, updatedAt: now)
        touch()
    }

    // MARK: - History & Taste
    public func recordPlay(_ event: HistoryEvent) {
        state.history[event.id] = SyncEntry(id: event.id, value: event, updatedAt: event.playedAt)
        touch()
    }
    public var history: [HistoryEvent] {
        state.history.values.filter { $0.deleted != true }.compactMap(\.value).sorted { $0.playedAt > $1.playedAt }
    }
    public func recentlyPlayed(limit: Int = 25) -> [Track] {
        var seen = Set<String>()
        var out: [Track] = []
        for e in history where !e.skipped {
            if seen.insert(e.track.id).inserted {
                out.append(e.track)
                if out.count >= limit { break }
            }
        }
        return out
    }
    public func clearHistory() {
        let now = nowMs()
        for id in state.history.keys {
            state.history[id] = SyncEntry(id: id, value: nil, updatedAt: now, deleted: true)
        }
        touch()
    }
    public func taste() -> TasteProfile {
        TasteProfile.build(history: history, liked: likedTracks)
    }

    // MARK: - Podcast progress & Recent searches
    public func episodeProgress(_ id: String) -> Int { state.episodeProgress[id]?.value ?? 0 }
    public func setEpisodeProgress(_ id: String, ms: Int) {
        state.episodeProgress[id] = SyncEntry(id: id, value: ms, updatedAt: nowMs())
        touch()
    }
    public var recentSearches: [String] { state.recentSearches }
    public func addRecentSearch(_ q: String) {
        let t = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        state.recentSearches.removeAll { $0.lowercased() == t.lowercased() }
        state.recentSearches.insert(t, at: 0)
        if state.recentSearches.count > 10 { state.recentSearches = Array(state.recentSearches.prefix(10)) }
        touch()
    }
    public func clearRecentSearches() {
        state.recentSearches.removeAll()
        touch()
    }

    // MARK: - Settings
    public var settings: AppSettings {
        state.settings["main"]?.value ?? AppSettings()
    }
    public func updateSettings(_ mutate: (inout AppSettings) -> Void) {
        var s = settings
        mutate(&s)
        state.settings["main"] = SyncEntry(id: "main", value: s, updatedAt: nowMs())
        touch()
    }

    // MARK: - LWW merge & Sync with apps/server
    public func mergeRemote(_ remote: LibraryStateFile) -> Int {
        var changed = 0
        func merge<T>(_ local: inout [String: SyncEntry<T>], _ incoming: [String: SyncEntry<T>]) {
            for (k, e) in incoming {
                if local[k] == nil || local[k]!.updatedAt < e.updatedAt {
                    local[k] = e
                    changed += 1
                }
            }
        }
        merge(&state.likedTracks, remote.likedTracks)
        merge(&state.savedAlbums, remote.savedAlbums)
        merge(&state.followedArtists, remote.followedArtists)
        merge(&state.followedPodcasts, remote.followedPodcasts)
        merge(&state.playlists, remote.playlists)
        merge(&state.history, remote.history)
        merge(&state.episodeProgress, remote.episodeProgress)
        merge(&state.settings, remote.settings)
        if changed > 0 { touch() }
        return changed
    }

    public func login(email: String, password: String) async throws {
        try await authRequest(path: "/auth/login", body: ["email": email, "password": password])
    }
    public func register(email: String, password: String, displayName: String) async throws {
        try await authRequest(path: "/auth/register", body: ["email": email, "password": password, "displayName": displayName])
    }
    public func logout() {
        user = nil
        authToken = nil
        syncCursor = 0
        lastPushedMs = 0
    }

    private func authRequest(path: String, body: [String: String]) async throws {
        let base = settings.serverUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: base + path) else { throw URLError(.badURL) }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        struct AuthResp: Codable { let token: String; let user: SessionUser }
        if let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            let err = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw NSError(domain: "OmniTuneSync", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: err ?? "Auth failed"])
        }
        let decoded = try JSONDecoder().decode(AuthResp.self, from: data)
        self.authToken = decoded.token
        self.user = decoded.user
        _ = try? await syncNow()
    }

    @discardableResult
    public func syncNow() async throws -> Int {
        guard let token = authToken else { return 0 }
        let base = settings.serverUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: base + "/sync") else { throw URLError(.badURL) }
        let started = nowMs()
        struct Payload: Codable {
            let cursor: Int
            let entries: [String: [SyncEntry<Track>]]
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        let liked = state.likedTracks.values.filter { $0.updatedAt > lastPushedMs }
        req.httpBody = try JSONEncoder().encode(Payload(cursor: syncCursor, entries: liked.isEmpty ? [:] : ["likedTracks": Array(liked)]))
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw URLError(.badServerResponse) }
        struct SyncResp: Codable {
            let cursor: Int
            let entries: [String: [SyncEntry<Track>]]?
        }
        let decoded = try JSONDecoder().decode(SyncResp.self, from: data)
        var pulled = 0
        if let incoming = decoded.entries?["likedTracks"] {
            var remote = LibraryStateFile()
            for e in incoming { remote.likedTracks[e.id] = e }
            pulled = mergeRemote(remote)
        }
        syncCursor = decoded.cursor
        lastPushedMs = started
        return pulled
    }

    private func dedupe(_ list: [Track]) -> [Track] {
        var seen = Set<String>()
        return list.filter { seen.insert($0.id).inserted }
    }
}
