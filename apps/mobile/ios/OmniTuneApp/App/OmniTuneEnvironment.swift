import Foundation
import Observation
#if canImport(OmniTuneCore)
import OmniTuneCore
#endif
import SwiftUI
import UIKit

/// Central dependency container injected across SwiftUI views via `.environment(env)`.
@MainActor
@Observable
public final class OmniTuneEnvironment {
    public let library: LibraryStore
    public let catalog: AppleCatalog
    public let audioEngine: AVAudioEngineAdapter
    public let player: PlayerController
    public let connect: ConnectClient

    public var isNowPlayingPresented = false
    public var toastMessage: String?
    public var playlistPickerTrack: Track?
    public var createPlaylistSeedTrack: Track?
    public var isCreatePlaylistPresented = false
    public var mixesById: [String: Mix] = [:]

    private var toastTask: Task<Void, Never>?

    public init() {
        let lib = LibraryStore()
        let cat = AppleCatalog(country: lib.settings.country)
        let engine = AVAudioEngineAdapter()

        let ctrl = PlayerController(
            engine: engine,
            getSettings: { lib.settings },
            getTaste: { lib.taste() },
            autoplayProvider: { seed, taste in
                await RadioEngine.buildRadio(seed: seed, catalog: cat, taste: taste, explicitFilter: lib.settings.explicitFilter)
            },
            onPlayed: { event in lib.recordPlay(event) },
            getEpisodeProgress: { id in lib.episodeProgress(id) },
            onEpisodeProgress: { id, ms in lib.setEpisodeProgress(id, ms: ms) }
        )

        self.library = lib
        self.catalog = cat
        self.audioEngine = engine
        self.player = ctrl
        self.connect = ConnectClient(deviceName: UIDevice.current.name, library: lib, player: ctrl)

        self.connect.onToast = { [weak self] msg in
            self?.toast(msg)
        }

        engine.onRemoteNext = { [weak ctrl] in
            Task { await ctrl?.next() }
        }
        engine.onRemotePrevious = { [weak ctrl] in
            Task { await ctrl?.previous() }
        }
    }

    public func toast(_ text: String) {
        toastTask?.cancel()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            toastMessage = text
        }
        toastTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_200_000_000)
            guard !Task.isCancelled else { return }
            withAnimation { self?.toastMessage = nil }
        }
    }

    public func startRadio(from track: Track) {
        toast("Starting radio from \(track.title)…")
        Task {
            let radio = await RadioEngine.buildRadio(
                seed: track,
                catalog: catalog,
                taste: library.taste(),
                explicitFilter: library.settings.explicitFilter
            )
            if !radio.isEmpty {
                await player.play(radio, startIndex: 0, context: PlaybackContext(type: "radio", name: "Radio · \(track.title)"), shuffle: false)
            }
        }
    }

    public func rememberMixes(_ mixes: [Mix]) {
        for m in mixes { mixesById[m.id] = m }
    }
}
