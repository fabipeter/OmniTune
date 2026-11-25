import Foundation
import Observation

public enum AudioEngineEvent: Sendable {
    case time(positionMs: Int, durationMs: Int)
    case state(playing: Bool, buffering: Bool)
    case ended
    case error(String)
}

@MainActor
public protocol AudioEngineProtocol: AnyObject {
    var onEvent: ((AudioEngineEvent) -> Void)? { get set }
    var fullSongsEnabled: Bool { get }
    func load(_ track: Track, autoplay: Bool, startMs: Int?, crossfadeMs: Int) async
    func play()
    func pause()
    func seek(ms: Int)
    func setVolume(_ volume: Float)
    func setRate(_ rate: Float)
    func preload(_ track: Track)
}

/// Framework-agnostic playback controller with OmniTune queue semantics + Smart Shuffle + Autoplay Radio.
@MainActor
@Observable
public final class PlayerController {
    public private(set) var current: Track?
    public private(set) var context: PlaybackContext?
    public private(set) var playing: Bool = false
    public private(set) var buffering: Bool = false
    public private(set) var shuffle: Bool = false
    public private(set) var repeatMode: RepeatMode = .off
    public private(set) var rate: Float = 1.0
    public private(set) var volume: Float = 1.0
    public private(set) var positionMs: Int = 0
    public private(set) var durationMs: Int = 0
    public private(set) var userQueue: [QueueItem] = []
    public private(set) var upNext: [Track] = []
    public private(set) var played: [Track] = []
    public private(set) var sleepEndOfTrack: Bool = false
    public private(set) var sleepEndsAt: Date?
    public private(set) var errorMessage: String?

    public var canPrevious: Bool { !prevStack.isEmpty || current != nil }
    public var canNext: Bool { current != nil && (!userQueue.isEmpty || index + 1 < order.count || repeatMode == .all || autoplayProvider != nil) }
    public var isPreviewPlayback: Bool { (current?.isPreview ?? false) && !engine.fullSongsEnabled }

    private let engine: AudioEngineProtocol
    private let getSettings: () -> AppSettings
    private let getTaste: () -> TasteProfile
    private let autoplayProvider: ((Track, TasteProfile) async -> [Track])?
    private let onPlayed: ((HistoryEvent) -> Void)?
    private let getEpisodeProgress: ((String) -> Int)?
    private let onEpisodeProgress: ((String, Int) -> Void)?

    private var original: [Track] = []
    private var order: [Track] = []
    private var index: Int = -1
    private var prevStack: [(track: Track, ctxIndex: Int, fromQueue: Bool)] = []
    private var currentFromQueue = false
    private var startedAtMs: Int64 = 0
    private var listenedMs: Int = 0
    private var lastPosMs: Int = 0
    private var crossfadeFired = false
    private var sleepTask: Task<Void, Never>?

    public init(
        engine: AudioEngineProtocol,
        getSettings: @escaping () -> AppSettings = { AppSettings() },
        getTaste: @escaping () -> TasteProfile = { TasteProfile.build(history: []) },
        autoplayProvider: ((Track, TasteProfile) async -> [Track])? = nil,
        onPlayed: ((HistoryEvent) -> Void)? = nil,
        getEpisodeProgress: ((String) -> Int)? = nil,
        onEpisodeProgress: ((String, Int) -> Void)? = nil
    ) {
        self.engine = engine
        self.getSettings = getSettings
        self.getTaste = getTaste
        self.autoplayProvider = autoplayProvider
        self.onPlayed = onPlayed
        self.getEpisodeProgress = getEpisodeProgress
        self.onEpisodeProgress = onEpisodeProgress
        engine.onEvent = { [weak self] ev in
            self?.handleEngine(ev)
        }
    }

    public func play(_ tracks: [Track], startIndex: Int? = nil, context: PlaybackContext? = nil, shuffle: Bool? = nil) async {
        let settings = getSettings()
        let playable = tracks.filter { $0.audioUrl != nil && !(settings.explicitFilter && $0.explicit) }
        guard !playable.isEmpty else { return }
        let wanted = startIndex.flatMap { tracks.indices.contains($0) ? tracks[$0] : nil }
        let start = wanted.flatMap { w in playable.first(where: { $0.id == w.id }) } ?? playable[0]
        let useShuffle = shuffle ?? self.shuffle
        self.original = playable
        self.shuffle = useShuffle
        self.context = context
        if useShuffle {
            self.order = makeShuffled(playable, startWith: startIndex != nil ? start : nil)
        } else {
            self.order = playable
        }
        let idx = (useShuffle && startIndex == nil) ? 0 : (self.order.firstIndex(where: { $0.id == start.id }) ?? 0)
        await startTrack(order[idx], ctxIndex: idx, fromQueue: false)
    }

    public func playTrack(_ track: Track, context: PlaybackContext? = nil) async {
        await play([track], startIndex: 0, context: context ?? PlaybackContext(type: "unknown"), shuffle: false)
    }

    private func makeShuffled(_ list: [Track], startWith: Track?) -> [Track] {
        if getSettings().shuffleMode == .random {
            let rest = SmartShuffle.fisherYates(list.filter { $0.id != startWith?.id })
            return startWith.map { [$0] + rest } ?? rest
        }
        return SmartShuffle.shuffle(list, taste: getTaste(), startWith: startWith)
    }

    private func startTrack(_ track: Track, ctxIndex: Int, fromQueue: Bool, crossfadeMs: Int = 0) async {
        finishCurrent(skipped: false)
        if !fromQueue { index = ctxIndex }
        current = track
        currentFromQueue = fromQueue
        startedAtMs = Int64(Date().timeIntervalSince1970 * 1000)
        listenedMs = 0
        positionMs = 0
        lastPosMs = 0
        durationMs = track.durationMs
        crossfadeFired = false
        buffering = true
        errorMessage = nil
        refreshUpNext()

        var resumeMs: Int?
        if track.kind == .episode, let saved = getEpisodeProgress?(track.id), saved > 5000, saved < track.durationMs - 15000 {
            resumeMs = saved
        }

        await engine.load(track, autoplay: true, startMs: resumeMs, crossfadeMs: crossfadeMs)
        engine.setRate(rate)
        engine.setVolume(volume)
        if let nextTrack = peekNext() { engine.preload(nextTrack) }
    }

    public func toggle() {
        guard current != nil else { return }
        if playing { engine.pause() } else { engine.play() }
    }
    public func pause() { engine.pause() }
    public func resume() { if current != nil { engine.play() } }

    public func seek(ms: Int) {
        let clamped = max(0, min(ms, max(durationMs, ms)))
        positionMs = clamped
        lastPosMs = clamped
        engine.seek(ms: clamped)
    }
    public func seekBy(deltaMs: Int) { seek(ms: positionMs + deltaMs) }

    public func next() async { await advance(skipped: true, crossfadeMs: 0) }

    public func previous() async {
        guard let leaving = current else { return }
        if positionMs > 3000 || prevStack.isEmpty {
            seek(ms: 0)
            if !playing { engine.play() }
            return
        }
        finishCurrent(skipped: true)
        let back = prevStack.removeLast()
        if currentFromQueue { userQueue.insert(QueueItem(track: leaving), at: 0) }
        index = back.fromQueue ? max(-1, currentFromQueue ? index : index - 1) : back.ctxIndex
        await startTrack(back.track, ctxIndex: index, fromQueue: back.fromQueue)
    }

    public func toggleShuffle() {
        shuffle.toggle()
        if shuffle, !order.isEmpty {
            let head = Array(order.prefix(index + 1))
            let rest = Array(order.dropFirst(index + 1))
            order = head + makeShuffled(rest, startWith: nil)
        } else if !shuffle, !original.isEmpty {
            let cur = current
            order = original
            if let cur, let found = original.firstIndex(where: { $0.id == cur.id }) { index = found }
        }
        refreshUpNext()
    }

    public func cycleRepeat() {
        switch repeatMode {
        case .off: repeatMode = .all
        case .all: repeatMode = .one
        case .one: repeatMode = .off
        }
    }

    public func setRate(_ r: Float) {
        rate = r
        engine.setRate(r)
    }

    public func setVolume(_ v: Float) {
        volume = max(0, min(1, v))
        engine.setVolume(volume)
    }

    public func addToQueue(_ track: Track) {
        guard track.audioUrl != nil else { return }
        userQueue.append(QueueItem(track: track))
    }
    public func playNext(_ track: Track) {
        guard track.audioUrl != nil else { return }
        userQueue.insert(QueueItem(track: track), at: 0)
    }
    public func removeQueueItem(uid: String) {
        userQueue.removeAll { $0.uid == uid }
    }
    public func moveQueue(from: IndexSet, to: Int) {
        let items = from.map { userQueue[$0] }
        for i in from.sorted(by: >) { userQueue.remove(at: i) }
        let dest = min(to - from.filter { $0 < to }.count, userQueue.count)
        userQueue.insert(contentsOf: items, at: max(0, dest))
    }
    public func clearQueue() { userQueue.removeAll() }

    public func skipToQueueItem(uid: String) async {
        guard let i = userQueue.firstIndex(where: { $0.uid == uid }), let cur = current else { return }
        let item = userQueue[i]
        userQueue.removeFirst(i + 1)
        prevStack.append((cur, index, currentFromQueue))
        await startTrack(item.track, ctxIndex: index, fromQueue: true)
    }

    public func skipToUpNext(at offset: Int) async {
        let targetIdx = index + 1 + offset
        guard order.indices.contains(targetIdx), let cur = current else { return }
        prevStack.append((cur, index, currentFromQueue))
        await startTrack(order[targetIdx], ctxIndex: targetIdx, fromQueue: false)
    }

    public func setSleepTimer(minutes: Int?) {
        sleepTask?.cancel()
        sleepEndOfTrack = false
        guard let minutes else {
            sleepEndsAt = nil
            return
        }
        sleepEndsAt = Date().addingTimeInterval(TimeInterval(minutes * 60))
        sleepTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(minutes) * 60 * 1_000_000_000)
            guard !Task.isCancelled else { return }
            self?.pause()
            self?.sleepEndsAt = nil
        }
    }

    public func setSleepEndOfTrack() {
        sleepTask?.cancel()
        sleepEndsAt = nil
        sleepEndOfTrack = true
    }

    public func snapshot() -> PlayerSession {
        PlayerSession(
            current: current,
            context: context,
            order: order,
            original: original,
            index: index,
            userQueue: userQueue,
            shuffle: shuffle,
            repeat: repeatMode,
            volume: Double(volume),
            positionMs: positionMs
        )
    }

    public func restore(_ session: PlayerSession, autoplay: Bool = false) async {
        order = session.order.isEmpty ? (session.current.map { [$0] } ?? []) : session.order
        original = session.original.isEmpty ? order : session.original
        userQueue = session.userQueue
        index = max(0, min(session.index, max(0, order.count - 1)))
        shuffle = session.shuffle
        repeatMode = session.repeat
        context = session.context
        volume = Float(session.volume)
        if let track = session.current {
            current = track
            currentFromQueue = false
            positionMs = session.positionMs
            lastPosMs = session.positionMs
            durationMs = track.durationMs
            refreshUpNext()
            await engine.load(track, autoplay: autoplay, startMs: session.positionMs, crossfadeMs: 0)
            engine.setVolume(volume)
        } else {
            refreshUpNext()
        }
    }

    private func peekNext() -> Track? {
        if repeatMode == .one { return current }
        if let first = userQueue.first { return first.track }
        if index + 1 < order.count { return order[index + 1] }
        if repeatMode == .all { return order.first }
        return nil
    }

    private func refreshUpNext() {
        if index + 1 < order.count {
            upNext = Array(order[(index + 1)..<min(order.count, index + 61)])
        } else {
            upNext = []
        }
    }

    private func advance(skipped: Bool, crossfadeMs: Int) async {
        guard let cur = current else { return }
        finishCurrent(skipped: skipped)
        if !userQueue.isEmpty {
            let item = userQueue.removeFirst()
            prevStack.append((cur, index, currentFromQueue))
            await startTrack(item.track, ctxIndex: index, fromQueue: true, crossfadeMs: crossfadeMs)
            return
        }
        if index + 1 < order.count {
            prevStack.append((cur, index, currentFromQueue))
            await startTrack(order[index + 1], ctxIndex: index + 1, fromQueue: false, crossfadeMs: crossfadeMs)
            return
        }
        if repeatMode == .all, !order.isEmpty {
            prevStack.append((cur, index, currentFromQueue))
            if shuffle { order = makeShuffled(original, startWith: nil) }
            await startTrack(order[0], ctxIndex: 0, fromQueue: false, crossfadeMs: crossfadeMs)
            return
        }
        if getSettings().autoplay, let provider = autoplayProvider {
            let more = await provider(cur, getTaste())
            if !more.isEmpty {
                prevStack.append((cur, index, currentFromQueue))
                original = more
                order = more
                context = PlaybackContext(type: "radio", name: "Radio · \(cur.artistName)")
                await startTrack(more[0], ctxIndex: 0, fromQueue: false, crossfadeMs: crossfadeMs)
                return
            }
        }
        engine.pause()
        engine.seek(ms: 0)
        positionMs = 0
        playing = false
    }

    private func finishCurrent(skipped: Bool) {
        guard let cur = current else { return }
        let dur = max(durationMs, cur.durationMs)
        if listenedMs > 1500 {
            let completed = Double(listenedMs) >= Double(dur) * 0.85
            onPlayed?(HistoryEvent(
                id: "\(startedAtMs)-\(cur.id)",
                track: cur,
                playedAt: startedAtMs,
                listenedMs: listenedMs,
                completed: completed,
                skipped: skipped && !completed && listenedMs < 30_000,
                contextType: context?.type,
                contextId: context?.id
            ))
        }
        if played.last?.id != cur.id { played.append(cur) }
        if played.count > 100 { played.removeFirst() }
        listenedMs = 0
    }

    private func handleEngine(_ event: AudioEngineEvent) {
        switch event {
        case .state(let isPlaying, let isBuffering):
            playing = isPlaying
            buffering = isBuffering
        case .time(let pos, let dur):
            let delta = pos - lastPosMs
            if playing, delta > 0, delta < 2500 { listenedMs += delta }
            lastPosMs = pos
            positionMs = pos
            if dur > 0 { durationMs = dur }
            let cf = getSettings().crossfadeMs
            if cf > 0, !crossfadeFired, dur > 0, repeatMode != .one, !sleepEndOfTrack {
                let rem = dur - pos
                if rem > 0, rem <= cf, pos > cf {
                    crossfadeFired = true
                    Task { await self.advance(skipped: false, crossfadeMs: cf) }
                }
            }
            if let cur = current, cur.kind == .episode, pos % 5000 < 500 {
                onEpisodeProgress?(cur.id, pos)
            }
        case .ended:
            if crossfadeFired { return }
            if sleepEndOfTrack {
                sleepEndOfTrack = false
                finishCurrent(skipped: false)
                engine.pause()
                playing = false
                return
            }
            if repeatMode == .one {
                finishCurrent(skipped: false)
                engine.seek(ms: 0)
                engine.play()
                return
            }
            Task { await self.advance(skipped: false, crossfadeMs: 0) }
        case .error(let msg):
            errorMessage = msg
            buffering = false
        }
    }
}
