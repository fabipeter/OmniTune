import AVFoundation
import Foundation
import MediaPlayer
import MusicKit
#if canImport(OmniTuneCore)
import OmniTuneCore
#endif
import UIKit

/// Native iOS audio adapter:
/// - Plays full-length Lossless/Dolby Atmos songs via native `MusicKit` (`ApplicationMusicPlayer`)
///   when the user authorizes MusicKit access.
/// - Seamlessly falls back to dual-deck `AVPlayer` for 30-second AAC song previews and full-length
///   podcast episodes, with background playback (`AVAudioSession.Category.playback`), Control Center &
///   Lock Screen metadata (`MPNowPlayingInfoCenter`), remote media commands (`MPRemoteCommandCenter`),
///   crossfade volume ramps, and gapless preloading.
@MainActor
public final class AVAudioEngineAdapter: AudioEngineProtocol {
    public var onEvent: ((AudioEngineEvent) -> Void)?
    public private(set) var musicKitAuthorized: Bool = false

    public var fullSongsEnabled: Bool { musicKitAuthorized }

    private var activePlayer = AVPlayer()
    private var secondaryPlayer = AVPlayer()
    private var usingMusicKit = false
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    private var mkPollTask: Task<Void, Never>?
    private var currentTrack: Track?
    private var preloadedUrl: String?
    private var preloadedItem: AVPlayerItem?
    private var desiredVolume: Float = 1.0
    private var desiredRate: Float = 1.0

    public var onRemoteNext: (() -> Void)?
    public var onRemotePrevious: (() -> Void)?

    public init() {
        configureAudioSession()
        configureRemoteCommands()
        musicKitAuthorized = (MusicAuthorization.currentStatus == .authorized)
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [])
        try? session.setActive(true)
    }

    private func configureRemoteCommands() {
        let cc = MPRemoteCommandCenter.shared()
        cc.playCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.play() }
            return .success
        }
        cc.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.pause() }
            return .success
        }
        cc.togglePlayPauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                if self.isCurrentlyPlaying { self.pause() } else { self.play() }
            }
            return .success
        }
        cc.nextTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.onRemoteNext?() }
            return .success
        }
        cc.previousTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.onRemotePrevious?() }
            return .success
        }
        cc.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let ev = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            Task { @MainActor in self?.seek(ms: Int(ev.positionTime * 1000)) }
            return .success
        }
    }

    private var isCurrentlyPlaying: Bool {
        if usingMusicKit {
            return ApplicationMusicPlayer.shared.state.playbackStatus == .playing
        }
        return activePlayer.timeControlStatus == .playing
    }

    public func authorizeMusicKit() async -> Bool {
        let status = await MusicAuthorization.request()
        musicKitAuthorized = (status == .authorized)
        return musicKitAuthorized
    }

    public func load(_ track: Track, autoplay: Bool, startMs: Int?, crossfadeMs: Int) async {
        currentTrack = track
        mkPollTask?.cancel()

        // Try native MusicKit for full-length songs when authorized.
        if track.kind == .song && musicKitAuthorized {
            do {
                activePlayer.pause()
                let req = MusicCatalogResourceRequest<Song>(matching: \.id, equalTo: MusicItemID(track.id))
                let resp = try await req.response()
                if let song = resp.items.first {
                    usingMusicKit = true
                    ApplicationMusicPlayer.shared.queue = [song]
                    try await ApplicationMusicPlayer.shared.prepareToPlay()
                    if let startMs, startMs > 0 {
                        ApplicationMusicPlayer.shared.playbackTime = Double(startMs) / 1000.0
                    }
                    if autoplay { try await ApplicationMusicPlayer.shared.play() }
                    startMusicKitObserver(durationMs: track.durationMs)
                    updateNowPlaying(track: track, positionSec: Double(startMs ?? 0) / 1000.0, durationSec: Double(track.durationMs) / 1000.0, playing: autoplay)
                    onEvent?(.state(playing: autoplay, buffering: false))
                    return
                }
            } catch {
                // Fall back to 30s AAC preview stream if MusicKit fails (e.g. simulator or no active subscription).
                usingMusicKit = false
            }
        }

        if usingMusicKit {
            ApplicationMusicPlayer.shared.pause()
            usingMusicKit = false
        }

        guard let urlStr = track.audioUrl, let url = URL(string: urlStr) else {
            onEvent?(.error("No playable stream for this track"))
            return
        }

        let item: AVPlayerItem
        if preloadedUrl == urlStr, let cached = preloadedItem {
            item = cached
            preloadedUrl = nil
            preloadedItem = nil
        } else {
            item = AVPlayerItem(url: url)
        }

        let doCrossfade = crossfadeMs > 0 && activePlayer.timeControlStatus == .playing
        if doCrossfade {
            let outgoing = activePlayer
            activePlayer = secondaryPlayer
            secondaryPlayer = outgoing
            fadeOut(player: outgoing, durationSec: Double(crossfadeMs) / 1000.0)
            activePlayer.volume = 0
        } else {
            activePlayer.volume = desiredVolume
        }

        detachObservers()
        activePlayer.replaceCurrentItem(with: item)
        attachObservers(for: item, track: track)

        if let startMs, startMs > 0 {
            await activePlayer.seek(to: CMTime(seconds: Double(startMs) / 1000.0, preferredTimescale: 600))
        }

        if autoplay {
            activePlayer.playImmediately(atRate: desiredRate)
            if doCrossfade {
                fadeIn(player: activePlayer, target: desiredVolume, durationSec: Double(crossfadeMs) / 1000.0)
            }
            onEvent?(.state(playing: true, buffering: false))
        } else {
            onEvent?(.state(playing: false, buffering: false))
        }
        updateNowPlaying(track: track, positionSec: Double(startMs ?? 0) / 1000.0, durationSec: Double(track.durationMs) / 1000.0, playing: autoplay)
    }

    public func play() {
        if usingMusicKit {
            Task {
                try? await ApplicationMusicPlayer.shared.play()
                onEvent?(.state(playing: true, buffering: false))
            }
        } else {
            activePlayer.playImmediately(atRate: desiredRate)
            onEvent?(.state(playing: true, buffering: false))
        }
        if let t = currentTrack {
            updateNowPlaying(track: t, positionSec: activePlayer.currentTime().seconds, durationSec: Double(t.durationMs) / 1000.0, playing: true)
        }
    }

    public func pause() {
        if usingMusicKit {
            ApplicationMusicPlayer.shared.pause()
        } else {
            activePlayer.pause()
        }
        onEvent?(.state(playing: false, buffering: false))
        if let t = currentTrack {
            updateNowPlaying(track: t, positionSec: activePlayer.currentTime().seconds, durationSec: Double(t.durationMs) / 1000.0, playing: false)
        }
    }

    public func seek(ms: Int) {
        let sec = Double(ms) / 1000.0
        if usingMusicKit {
            ApplicationMusicPlayer.shared.playbackTime = sec
        } else {
            activePlayer.seek(to: CMTime(seconds: sec, preferredTimescale: 600))
        }
        if let t = currentTrack {
            updateNowPlaying(track: t, positionSec: sec, durationSec: Double(t.durationMs) / 1000.0, playing: isCurrentlyPlaying)
        }
    }

    public func setVolume(_ volume: Float) {
        desiredVolume = max(0, min(1, volume))
        activePlayer.volume = desiredVolume
    }

    public func setRate(_ rate: Float) {
        desiredRate = rate
        if !usingMusicKit, activePlayer.timeControlStatus == .playing {
            activePlayer.rate = rate
        }
    }

    public func preload(_ track: Track) {
        guard let urlStr = track.audioUrl, let url = URL(string: urlStr) else { return }
        preloadedUrl = urlStr
        preloadedItem = AVPlayerItem(url: url)
    }

    private func detachObservers() {
        if let obs = timeObserver {
            activePlayer.removeTimeObserver(obs)
            secondaryPlayer.removeTimeObserver(obs)
            timeObserver = nil
        }
        if let endObs = endObserver {
            NotificationCenter.default.removeObserver(endObs)
            endObserver = nil
        }
    }

    private func attachObservers(for item: AVPlayerItem, track: Track) {
        let interval = CMTime(seconds: 0.25, preferredTimescale: 600)
        timeObserver = activePlayer.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor in
                guard let self, !self.usingMusicKit else { return }
                let pos = time.seconds.isFinite ? Int(time.seconds * 1000) : 0
                let itemDur = self.activePlayer.currentItem?.duration.seconds ?? 0
                let dur = (itemDur.isFinite && itemDur > 0) ? Int(itemDur * 1000) : track.durationMs
                let buffering = self.activePlayer.timeControlStatus == .waitingToPlayAtSpecifiedRate
                let playing = self.activePlayer.timeControlStatus == .playing
                self.onEvent?(.state(playing: playing, buffering: buffering))
                self.onEvent?(.time(positionMs: pos, durationMs: dur))
            }
        }
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            Task { @MainActor in
                self?.onEvent?(.ended)
            }
        }
    }

    private func startMusicKitObserver(durationMs: Int) {
        mkPollTask = Task { [weak self] in
            var wasPlaying = false
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 250_000_000)
                guard let self, self.usingMusicKit else { break }
                let p = ApplicationMusicPlayer.shared
                let posMs = Int(p.playbackTime * 1000)
                let playing = p.state.playbackStatus == .playing
                self.onEvent?(.state(playing: playing, buffering: false))
                self.onEvent?(.time(positionMs: posMs, durationMs: durationMs))
                if wasPlaying && p.state.playbackStatus == .stopped && posMs > 0 {
                    self.onEvent?(.ended)
                    break
                }
                wasPlaying = playing
            }
        }
    }

    private func fadeOut(player: AVPlayer, durationSec: Double) {
        Task {
            let steps = 16
            let startVol = player.volume
            for i in 1...steps {
                try? await Task.sleep(nanoseconds: UInt64((durationSec / Double(steps)) * 1_000_000_000))
                player.volume = startVol * cos(Float(i) / Float(steps) * .pi * 0.5)
            }
            player.pause()
            player.volume = desiredVolume
        }
    }

    private func fadeIn(player: AVPlayer, target: Float, durationSec: Double) {
        Task {
            let steps = 16
            for i in 1...steps {
                try? await Task.sleep(nanoseconds: UInt64((durationSec / Double(steps)) * 1_000_000_000))
                player.volume = target * sin(Float(i) / Float(steps) * .pi * 0.5)
            }
            player.volume = target
        }
    }

    private func updateNowPlaying(track: Track, positionSec: Double, durationSec: Double, playing: Bool) {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: track.title,
            MPMediaItemPropertyArtist: track.artistName,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: max(0, positionSec),
            MPMediaItemPropertyPlaybackDuration: max(1, durationSec),
            MPNowPlayingInfoPropertyPlaybackRate: playing ? desiredRate : 0.0,
        ]
        if let alb = track.albumName { info[MPMediaItemPropertyAlbumTitle] = alb }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info

        if let url = artworkAt(track.artworkUrl, size: 500) {
            Task.detached {
                if let (data, _) = try? await URLSession.shared.data(from: url), let img = UIImage(data: data) {
                    let artwork = MPMediaItemArtwork(boundsSize: img.size) { _ in img }
                    await MainActor.run {
                        var updated = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
                        updated[MPMediaItemPropertyArtwork] = artwork
                        MPNowPlayingInfoCenter.default().nowPlayingInfo = updated
                    }
                }
            }
        }
    }
}
