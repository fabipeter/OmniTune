#if canImport(OmniTuneCore)
import OmniTuneCore
#endif
import SwiftUI

/// OmniTune full-screen Now Playing sheet with Midnight-Cobalt atmospheric backdrop,
/// scaling artwork, synced karaoke lyrics, live queue, sleep timer, and OmniTune Connect.
public struct NowPlayingSheet: View {
    @Environment(OmniTuneEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    enum Panel { case artwork, lyrics, queue }

    @State private var panel: Panel = .artwork
    @State private var isScrubbing = false
    @State private var scrubPositionMs: Double = 0
    @State private var lyrics: Lyrics?
    @State private var loadingLyrics = false
    @State private var showSleepDialog = false
    @State private var showDevicesSheet = false

    public var body: some View {
        let _ = env.library.version
        let player = env.player

        ZStack {
            LinearGradient(
                colors: [OmniTuneTheme.accentDeep.opacity(0.65), OmniTuneTheme.darkBg, OmniTuneTheme.darkBg],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            if let track = player.current {
                ArtworkView(url: track.artworkUrl, size: 600, pixelSize: 300, cornerRadius: 0)
                    .scaledToFill()
                    .blur(radius: 80)
                    .opacity(0.32)
                    .ignoresSafeArea()
            }

            if let track = player.current {
                VStack(spacing: 18) {
                    // Header bar
                    HStack {
                        Button { dismiss() } label: {
                            Image(systemName: "chevron.down")
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        VStack(spacing: 2) {
                            Text(player.context?.name ?? "Now Playing")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                            if player.isPreviewPlayback {
                                Text("30s PREVIEW")
                                    .font(.system(size: 9.5, weight: .bold))
                                    .foregroundStyle(OmniTuneTheme.accentHover)
                            }
                        }
                        Spacer()
                        Button { showSleepDialog = true } label: {
                            Image(systemName: (player.sleepEndsAt != nil || player.sleepEndOfTrack) ? "moon.fill" : "moon")
                                .foregroundStyle((player.sleepEndsAt != nil || player.sleepEndOfTrack) ? OmniTuneTheme.accentHover : .secondary)
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 12)

                    // Center stage: Artwork / Synced Lyrics / Queue
                    Group {
                        switch panel {
                        case .artwork:
                            ArtworkView(url: track.artworkUrl, size: 310, pixelSize: 600, cornerRadius: 12)
                                .shadow(color: .black.opacity(player.playing ? 0.45 : 0.22), radius: player.playing ? 24 : 12, y: 12)
                                .scaleEffect(player.playing ? 1.0 : 0.90)
                                .animation(.spring(response: 0.42, dampingFraction: 0.75), value: player.playing)
                                .frame(maxHeight: 330)
                        case .lyrics:
                            lyricsStage(track: track)
                        case .queue:
                            queueStage()
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                    // Track info + inline Heart & Add to Playlist
                    HStack(alignment: .center, spacing: 12) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(track.title)
                                .font(.title3.weight(.heavy))
                                .lineLimit(1)
                            Text(track.artistName)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        Spacer()
                        let liked = env.library.isLiked(track.id)
                        Button {
                            Haptics.medium()
                            let now = env.library.toggleLike(track)
                            env.toast(now ? "Added to Liked Songs" : "Removed from Liked Songs")
                        } label: {
                            Image(systemName: liked ? "heart.fill" : "heart")
                                .font(.title3)
                                .foregroundStyle(liked ? OmniTuneTheme.accent : .secondary)
                        }
                        Button {
                            env.playlistPickerTrack = track
                        } label: {
                            Image(systemName: "plus.circle")
                                .font(.title3)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal, 24)

                    // Scrubber
                    VStack(spacing: 4) {
                        let dur = Double(max(1, player.durationMs))
                        let currentVal = isScrubbing ? scrubPositionMs : Double(player.positionMs)
                        Slider(
                            value: Binding(
                                get: { min(currentVal, dur) },
                                set: { scrubPositionMs = $0 }
                            ),
                            in: 0...dur,
                            onEditingChanged: { editing in
                                isScrubbing = editing
                                if !editing { player.seek(ms: Int(scrubPositionMs)) }
                            }
                        )
                        .tint(OmniTuneTheme.accent)

                        HStack {
                            Text(formatDuration(Int(currentVal)))
                            Spacer()
                            Text("-\(formatDuration(max(0, Int(dur) - Int(currentVal))))")
                        }
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 24)

                    // Transport controls
                    HStack(spacing: 28) {
                        if track.kind == .episode {
                            Button {
                                let rates: [Float] = [0.75, 1.0, 1.25, 1.5, 2.0]
                                let idx = rates.firstIndex(of: player.rate) ?? 1
                                player.setRate(rates[(idx + 1) % rates.count])
                            } label: {
                                Text("\(String(format: "%g", player.rate))×")
                                    .font(.subheadline.bold())
                                    .foregroundStyle(OmniTuneTheme.accentHover)
                            }
                        } else {
                            Button {
                                Haptics.light()
                                player.toggleShuffle()
                            } label: {
                                Image(systemName: "shuffle")
                                    .font(.title3)
                                    .foregroundStyle(player.shuffle ? OmniTuneTheme.accentHover : .secondary)
                            }
                        }

                        Button {
                            Haptics.light()
                            if track.kind == .episode { player.seekBy(deltaMs: -15_000) }
                            else { Task { await player.previous() } }
                        } label: {
                            Image(systemName: track.kind == .episode ? "gobackward.15" : "backward.end.fill")
                                .font(.title2)
                        }

                        Button {
                            Haptics.medium()
                            player.toggle()
                        } label: {
                            ZStack {
                                Circle()
                                    .fill(OmniTuneTheme.accent)
                                    .frame(width: 64, height: 64)
                                    .shadow(color: OmniTuneTheme.accent.opacity(0.45), radius: 12, y: 4)
                                Image(systemName: player.playing ? "pause.fill" : "play.fill")
                                    .font(.title.weight(.bold))
                                    .foregroundStyle(.white)
                            }
                        }

                        Button {
                            Haptics.light()
                            if track.kind == .episode { player.seekBy(deltaMs: 30_000) }
                            else { Task { await player.next() } }
                        } label: {
                            Image(systemName: track.kind == .episode ? "goforward.30" : "forward.end.fill")
                                .font(.title2)
                        }

                        Button {
                            Haptics.light()
                            player.cycleRepeat()
                        } label: {
                            Image(systemName: player.repeatMode == .one ? "repeat.1" : "repeat")
                                .font(.title3)
                                .foregroundStyle(player.repeatMode != .off ? OmniTuneTheme.accentHover : .secondary)
                        }
                    }
                    .foregroundStyle(.primary)

                    // Bottom OmniTune utility bar (Lyrics · OmniTune Connect · Radio · Queue)
                    HStack(spacing: 38) {
                        Button {
                            withAnimation { panel = panel == .lyrics ? .artwork : .lyrics }
                        } label: {
                            Image(systemName: "quote.bubble")
                                .font(.title3)
                                .foregroundStyle(panel == .lyrics ? OmniTuneTheme.accentHover : .secondary)
                        }

                        Button {
                            showDevicesSheet = true
                        } label: {
                            Image(systemName: "hifispeaker.2")
                                .font(.title3)
                                .foregroundStyle(env.connect.remoteActiveDevice != nil ? OmniTuneTheme.accentHover : .secondary)
                        }

                        Button {
                            env.startRadio(from: track)
                        } label: {
                            Image(systemName: "dot.radiowaves.left.and.right")
                                .font(.title3)
                                .foregroundStyle(.secondary)
                        }

                        Button {
                            withAnimation { panel = panel == .queue ? .artwork : .queue }
                        } label: {
                            Image(systemName: "list.bullet")
                                .font(.title3)
                                .foregroundStyle(panel == .queue ? OmniTuneTheme.accentHover : .secondary)
                        }
                    }
                    .padding(.bottom, 22)
                }
                .task(id: track.id) {
                    loadingLyrics = true
                    lyrics = await LrcLib.fetchLyrics(for: track)
                    loadingLyrics = false
                }
            } else {
                ContentUnavailableView("Nothing Playing", systemImage: "music.note")
            }
        }
        .sheet(isPresented: $showDevicesSheet) {
            DevicesSheet()
                .presentationDetents([.medium, .large])
        }
        .confirmationDialog("Sleep Timer", isPresented: $showSleepDialog) {
            ForEach([5, 10, 15, 30, 45, 60], id: \.self) { m in
                Button("\(m) minutes") {
                    env.player.setSleepTimer(minutes: m)
                    env.toast("Sleep timer: \(m) min")
                }
            }
            Button("End of current track") {
                env.player.setSleepEndOfTrack()
                env.toast("Will pause after this track")
            }
            if env.player.sleepEndsAt != nil || env.player.sleepEndOfTrack {
                Button("Turn Off", role: .destructive) { env.player.setSleepTimer(minutes: nil) }
            }
        }
    }

    @ViewBuilder
    private func lyricsStage(track: Track) -> some View {
        if loadingLyrics {
            ProgressView("Loading lyrics…").tint(OmniTuneTheme.accent)
        } else if let synced = lyrics?.synced, !synced.isEmpty {
            let active = LrcLib.activeIndex(in: synced, positionMs: env.player.positionMs)
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        ForEach(Array(synced.enumerated()), id: \.offset) { i, line in
                            Button {
                                env.player.seek(ms: line.timeMs)
                            } label: {
                                Text(line.text.isEmpty ? "♪" : line.text)
                                    .font(.title2.bold())
                                    .foregroundStyle(Color.primary.opacity(i == active ? 1.0 : (i < active ? 0.55 : 0.35)))
                                    .multilineTextAlignment(.leading)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                            .id(i)
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 20)
                }
                .onChange(of: active) { _, newIdx in
                    if newIdx >= 0 {
                        withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo(newIdx, anchor: .center) }
                    }
                }
            }
        } else if let plain = lyrics?.plain {
            ScrollView {
                Text(plain)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .padding(24)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            ContentUnavailableView("No Lyrics Available", systemImage: "quote.bubble", description: Text("LRCLIB did not have lyrics for \(track.title)."))
        }
    }

    private func queueStage() -> some View {
        List {
            if !env.player.userQueue.isEmpty {
                Section {
                    ForEach(env.player.userQueue) { item in
                        Button {
                            Task { await env.player.skipToQueueItem(uid: item.uid) }
                        } label: {
                            HStack(spacing: 10) {
                                ArtworkView(url: item.track.artworkUrl, size: 42, pixelSize: 100)
                                VStack(alignment: .leading) {
                                    Text(item.track.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                                    Text(item.track.artistName).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(Color.clear)
                    }
                    .onMove { env.player.moveQueue(from: $0, to: $1) }
                    .onDelete { offsets in
                        for i in offsets { env.player.removeQueueItem(uid: env.player.userQueue[i].uid) }
                    }
                } header: {
                    HStack {
                        Text("Playing Next")
                        Spacer()
                        Button("Clear") { env.player.clearQueue() }.font(.caption).foregroundStyle(OmniTuneTheme.accentHover)
                    }
                }
            }

            Section("Up Next") {
                ForEach(Array(env.player.upNext.prefix(30).enumerated()), id: \.offset) { idx, t in
                    Button {
                        Task { await env.player.skipToUpNext(at: idx) }
                    } label: {
                        HStack(spacing: 10) {
                            ArtworkView(url: t.artworkUrl, size: 42, pixelSize: 100)
                            VStack(alignment: .leading) {
                                Text(t.title).font(.subheadline).lineLimit(1)
                                Text(t.artistName).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(Color.clear)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .listStyle(.plain)
    }
}
