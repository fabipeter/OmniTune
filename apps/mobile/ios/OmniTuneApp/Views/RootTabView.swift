#if canImport(OmniTuneCore)
import OmniTuneCore
#endif
import SwiftUI

/// Unified 4-tab OmniTune navigation (Home · Search · Radio · Library) with a Midnight-Cobalt
/// docked Now Playing bar (with live progress hairline, Connect button, inline Heart & Play/Pause)
/// and full-screen Now Playing sheet.
public struct RootTabView: View {
    @Environment(OmniTuneEnvironment.self) private var env
    @State private var selectedTab = 0
    @State private var showDevicesSheet = false

    public init() {}

    public var body: some View {
        @Bindable var env = env

        ZStack(alignment: .bottom) {
            TabView(selection: $selectedTab) {
                NavigationStack { HomeView() }
                    .tabItem { Label("Home", systemImage: "house.fill") }
                    .tag(0)

                NavigationStack { SearchView() }
                    .tabItem { Label("Search", systemImage: "magnifyingglass") }
                    .tag(1)

                NavigationStack { RadioView() }
                    .tabItem { Label("Radio", systemImage: "dot.radiowaves.left.and.right") }
                    .tag(2)

                NavigationStack { LibraryView() }
                    .tabItem { Label("Library", systemImage: "books.vertical.fill") }
                    .tag(3)
            }
            .tint(OmniTuneTheme.accent)

            if let track = env.player.current {
                DockedNowPlayingBar(track: track, onOpenDevices: { showDevicesSheet = true })
                    .padding(.horizontal, 8)
                    .padding(.bottom, 54)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            if let msg = env.toastMessage {
                Text(msg)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(OmniTuneTheme.accent, in: Capsule())
                    .shadow(color: .black.opacity(0.35), radius: 10, y: 4)
                    .padding(.bottom, env.player.current != nil ? 124 : 68)
                    .transition(.opacity.combined(with: .scale(scale: 0.92)))
            }
        }
        .sheet(isPresented: $env.isNowPlayingPresented) {
            NowPlayingSheet()
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showDevicesSheet) {
            DevicesSheet()
                .presentationDetents([.medium, .large])
        }
        .sheet(item: $env.playlistPickerTrack) { track in
            PlaylistPickerSheet(track: track)
                .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $env.isCreatePlaylistPresented) {
            CreatePlaylistSheet(seedTrack: env.createPlaylistSeedTrack)
                .presentationDetents([.medium])
        }
    }
}

private struct DockedNowPlayingBar: View {
    @Environment(OmniTuneEnvironment.self) private var env
    let track: Track
    let onOpenDevices: () -> Void

    var body: some View {
        let _ = env.library.version
        let liked = env.library.isLiked(track.id)
        let remoteDev = env.connect.remoteActiveDevice
        let progress = env.player.durationMs > 0
            ? min(1.0, max(0.0, Double(env.player.positionMs) / Double(env.player.durationMs)))
            : 0.0

        Button {
            env.isNowPlayingPresented = true
        } label: {
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    ArtworkView(url: track.artworkUrl, size: 40, pixelSize: 120, cornerRadius: 6)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(track.title)
                            .font(.subheadline.weight(.bold))
                            .lineLimit(1)
                            .foregroundStyle(.primary)
                        if let remote = remoteDev {
                            Label("Listening on \(remote.name)", systemImage: "hifispeaker.fill")
                                .font(.caption2.weight(.semibold))
                                .lineLimit(1)
                                .foregroundStyle(OmniTuneTheme.accentHover)
                        } else {
                            Text(track.artistName)
                                .font(.caption)
                                .lineLimit(1)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Spacer(minLength: 4)

                    Button {
                        onOpenDevices()
                    } label: {
                        Image(systemName: "hifispeaker.2")
                            .font(.subheadline)
                            .foregroundStyle(remoteDev != nil ? OmniTuneTheme.accentHover : .secondary)
                            .frame(width: 32, height: 32)
                    }
                    .buttonStyle(.plain)

                    Button {
                        Haptics.light()
                        let now = env.library.toggleLike(track)
                        env.toast(now ? "Added to Liked Songs" : "Removed from Liked Songs")
                    } label: {
                        Image(systemName: liked ? "heart.fill" : "heart")
                            .font(.subheadline)
                            .foregroundStyle(liked ? OmniTuneTheme.accent : .secondary)
                            .frame(width: 32, height: 32)
                    }
                    .buttonStyle(.plain)

                    Button {
                        Haptics.light()
                        env.player.toggle()
                    } label: {
                        Image(systemName: env.player.playing ? "pause.fill" : "play.fill")
                            .font(.body.weight(.bold))
                            .foregroundStyle(.primary)
                            .frame(width: 34, height: 34)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Rectangle()
                            .fill(Color.primary.opacity(0.10))
                        Rectangle()
                            .fill(OmniTuneTheme.sonicGradient)
                            .frame(width: geo.size.width * progress)
                    }
                }
                .frame(height: 2.5)
            }
            .background(OmniTuneTheme.darkOverlay.opacity(0.96), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(OmniTuneTheme.accent.opacity(0.28), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .shadow(color: .black.opacity(0.45), radius: 14, y: 6)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Now Playing: \(track.title) by \(track.artistName)")
    }
}
