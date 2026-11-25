import Foundation
import Observation

public struct PlayerSession: Codable, Sendable {
    public let current: Track?
    public let context: PlaybackContext?
    public let order: [Track]
    public let original: [Track]
    public let index: Int
    public let userQueue: [QueueItem]
    public let shuffle: Bool
    public let `repeat`: RepeatMode
    public let volume: Double
    public let positionMs: Int

    public init(
        current: Track?,
        context: PlaybackContext?,
        order: [Track],
        original: [Track],
        index: Int,
        userQueue: [QueueItem],
        shuffle: Bool,
        `repeat`: RepeatMode,
        volume: Double,
        positionMs: Int
    ) {
        self.current = current
        self.context = context
        self.order = order
        self.original = original
        self.index = index
        self.userQueue = userQueue
        self.shuffle = shuffle
        self.repeat = `repeat`
        self.volume = volume
        self.positionMs = positionMs
    }
}

public struct ConnectTrackSummary: Codable, Sendable, Equatable {
    public let id: String
    public let title: String
    public let artistName: String
    public let artworkUrl: String
}

public struct ConnectDevice: Identifiable, Codable, Sendable, Equatable {
    public let id: String
    public let name: String
    public let type: String
    public let isActive: Bool
    public let volume: Double
    public let playing: Bool
    public let positionMs: Int
    public let durationMs: Int
    public let currentTrack: ConnectTrackSummary?
    public let lastSeen: Int64
}

/// OmniTune Connect real-time device switching & remote control client for native iOS.
@MainActor
@Observable
public final class ConnectClient {
    public private(set) var connected = false
    public let thisDeviceId: String
    public let thisDeviceName: String
    public private(set) var activeDeviceId: String?
    public private(set) var devices: [ConnectDevice] = []
    public var roomCode: String = "local"

    public var remoteActiveDevice: ConnectDevice? {
        guard let activeId = activeDeviceId, activeId != thisDeviceId else { return nil }
        return devices.first(where: { $0.id == activeId })
    }

    private let library: LibraryStore
    private let player: PlayerController
    private var sseTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    public var onToast: ((String) -> Void)?

    public init(deviceName: String, library: LibraryStore, player: PlayerController) {
        let key = "omnitune.connect.deviceId"
        if let saved = UserDefaults.standard.string(forKey: key), !saved.isEmpty {
            self.thisDeviceId = saved
        } else {
            let fresh = "ios_\(UUID().uuidString.prefix(10))"
            UserDefaults.standard.set(fresh, forKey: key)
            self.thisDeviceId = fresh
        }
        self.thisDeviceName = deviceName
        self.roomCode = UserDefaults.standard.string(forKey: "omnitune.connect.room") ?? "local"
        self.library = library
        self.player = player
        start()
    }

    public func setRoomCode(_ code: String) {
        let clean = code.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        roomCode = clean.isEmpty ? "local" : clean
        UserDefaults.standard.set(roomCode, forKey: "omnitune.connect.room")
        reconnect()
    }

    public func reconnect() {
        sseTask?.cancel()
        heartbeatTask?.cancel()
        start()
    }

    private func baseURL() -> String {
        library.settings.serverUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    private func start() {
        sseTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { break }
                await self.runStreamOnce()
                self.connected = false
                try? await Task.sleep(nanoseconds: 5_000_000_000)
            }
        }
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                guard let self, self.connected, self.player.playing else { continue }
                await self.pushState(claimActive: false)
            }
        }
    }

    private func runStreamOnce() async {
        var comps = URLComponents(string: "\(baseURL())/connect/events")
        comps?.queryItems = [
            URLQueryItem(name: "deviceId", value: thisDeviceId),
            URLQueryItem(name: "name", value: thisDeviceName),
            URLQueryItem(name: "type", value: "ios"),
            URLQueryItem(name: "room", value: roomCode),
        ]
        guard let url = comps?.url else { return }

        var req = URLRequest(url: url)
        req.timeoutInterval = 3600
        if let tok = library.authToken {
            req.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization")
        }
        do {
            let (bytes, resp) = try await URLSession.shared.bytes(for: req)
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else { return }
            connected = true
            if player.current != nil { await pushState(claimActive: player.playing) }

            var currentEvent = ""
            for try await line in bytes.lines {
                if line.hasPrefix("event:") {
                    currentEvent = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
                } else if line.hasPrefix("data:") {
                    let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                    await handleEvent(name: currentEvent, json: payload)
                    currentEvent = ""
                }
            }
        } catch {
            connected = false
        }
    }

    private func handleEvent(name: String, json: String) async {
        guard let data = json.data(using: .utf8) else { return }
        switch name {
        case "devices":
            struct Snap: Decodable { let devices: [ConnectDevice]; let activeDeviceId: String? }
            if let snap = try? JSONDecoder().decode(Snap.self, from: data) {
                devices = snap.devices
                activeDeviceId = snap.activeDeviceId
            }
        case "transfer-in":
            struct TransferIn: Decodable { let session: PlayerSession?; let autoplay: Bool? }
            if let t = try? JSONDecoder().decode(TransferIn.self, from: data), let sess = t.session {
                await player.restore(sess, autoplay: t.autoplay ?? true)
                onToast?("Playback transferred to this device")
            }
        case "pause-handoff":
            player.pause()
        case "command":
            struct Cmd: Decodable { let command: String; let value: Double? }
            if let c = try? JSONDecoder().decode(Cmd.self, from: data) {
                switch c.command {
                case "toggle": player.toggle()
                case "play": player.resume()
                case "pause": player.pause()
                case "next": await player.next()
                case "previous": await player.previous()
                case "seek": if let v = c.value { player.seek(ms: Int(v)) }
                case "volume": if let v = c.value { player.setVolume(Float(v)) }
                case "shuffle": player.toggleShuffle()
                case "repeat": player.cycleRepeat()
                default: break
                }
                await pushState(claimActive: false)
            }
        default: break
        }
    }

    public func pushState(claimActive: Bool) async {
        guard connected, let url = URL(string: "\(baseURL())/connect/state") else { return }
        struct Body: Encodable {
            let deviceId: String
            let room: String
            let name: String
            let type: String
            let playing: Bool
            let positionMs: Int
            let durationMs: Int
            let volume: Double
            let currentTrack: ConnectTrackSummary?
            let session: PlayerSession?
            let claimActive: Bool
        }
        let cur = player.current
        let body = Body(
            deviceId: thisDeviceId,
            room: roomCode,
            name: thisDeviceName,
            type: "ios",
            playing: player.playing,
            positionMs: player.positionMs,
            durationMs: player.durationMs,
            volume: Double(player.volume),
            currentTrack: cur.map { ConnectTrackSummary(id: $0.id, title: $0.title, artistName: $0.artistName, artworkUrl: $0.artworkUrl) },
            session: cur != nil ? player.snapshot() : nil,
            claimActive: claimActive
        )
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        if let tok = library.authToken { req.setValue("Bearer \(tok)", forHTTPHeaderField: "authorization") }
        req.httpBody = try? JSONEncoder().encode(body)
        _ = try? await URLSession.shared.data(for: req)
    }

    public func transferTo(deviceId: String, autoplay: Bool = true) async throws {
        guard let url = URL(string: "\(baseURL())/connect/transfer") else { throw URLError(.badURL) }
        struct Body: Encodable {
            let fromDeviceId: String
            let targetDeviceId: String
            let room: String
            let session: PlayerSession?
            let autoplay: Bool
        }
        let body = Body(
            fromDeviceId: thisDeviceId,
            targetDeviceId: deviceId,
            room: roomCode,
            session: activeDeviceId == thisDeviceId && player.current != nil ? player.snapshot() : nil,
            autoplay: autoplay
        )
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        if let tok = library.authToken { req.setValue("Bearer \(tok)", forHTTPHeaderField: "authorization") }
        req.httpBody = try JSONEncoder().encode(body)
        let (_, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }

    public func sendCommand(targetDeviceId: String, command: String, value: Double? = nil) async {
        guard let url = URL(string: "\(baseURL())/connect/command") else { return }
        struct Body: Encodable { let targetDeviceId: String; let room: String; let command: String; let value: Double? }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        if let tok = library.authToken { req.setValue("Bearer \(tok)", forHTTPHeaderField: "authorization") }
        req.httpBody = try? JSONEncoder().encode(Body(targetDeviceId: targetDeviceId, room: roomCode, command: command, value: value))
        _ = try? await URLSession.shared.data(for: req)
    }
}
