#if canImport(OmniTuneCore)
import OmniTuneCore
#endif
import SwiftUI

public struct HomeView: View {
    @Environment(OmniTuneEnvironment.self) private var env
    @State private var shelves: [HomeShelf] = []
    @State private var loading = true
    @State private var filter: HomeFilter = .all

    enum HomeFilter: String, CaseIterable {
        case all = "All"
        case music = "Music"
        case podcasts = "Podcasts"
    }

    public var body: some View {
        let _ = env.library.version
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Compact OmniTune top bar with brand mark, greeting, and Settings avatar
                HStack(spacing: 12) {
                    OmniTuneLogoView(size: 32)
                    Text(timeGreeting())
                        .font(.title2.weight(.heavy))
                    Spacer()
                    NavigationLink { RecentlyPlayedView() } label: {
                        Image(systemName: "clock.arrow.circlepath")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.primary)
                            .frame(width: 34, height: 34)
                            .background(OmniTuneTheme.darkElevated, in: Circle())
                    }
                    NavigationLink { SettingsView() } label: {
                        Image(systemName: "gearshape.fill")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.primary)
                            .frame(width: 34, height: 34)
                            .background(OmniTuneTheme.darkElevated, in: Circle())
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)

                // Category filter chips
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(HomeFilter.allCases, id: \.self) { f in
                            FilterChip(title: f.rawValue, active: filter == f) { filter = f }
                        }
                    }
                    .padding(.horizontal, 16)
                }

                // 2-column OmniTune Quick-Pick Grid
                if filter != .podcasts {
                    quickPickGrid
                        .padding(.horizontal, 16)
                }

                if loading && shelves.isEmpty {
                    ProgressView("Loading OmniTune feed…")
                        .tint(OmniTuneTheme.accent)
                        .frame(maxWidth: .infinity, minHeight: 180)
                } else {
                    ForEach(filteredShelves) { shelf in
                        ShelfCarouselView(shelf: shelf)
                    }
                }
            }
            .padding(.bottom, 132)
        }
        .background(
            ZStack(alignment: .top) {
                OmniTuneTheme.darkBg.ignoresSafeArea()
                LinearGradient(
                    colors: [OmniTuneTheme.accent.opacity(0.24), Color.clear],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 260)
                .ignoresSafeArea()
            }
        )
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await loadFeed() }
        .task { await loadFeed() }
    }

    private var filteredShelves: [HomeShelf] {
        shelves.filter { s in
            switch filter {
            case .all: return true
            case .podcasts: return s.id == "podcasts"
            case .music: return s.id != "podcasts"
            }
        }
    }

    private var quickPickGrid: some View {
        let playlists = Array(env.library.playlists.prefix(3))
        let recent = Array(env.library.recentlyPlayed(limit: 4))
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            NavigationLink { LikedSongsView() } label: {
                quickTile(title: "Liked Songs") {
                    ZStack {
                        OmniTuneTheme.sonicGradient
                        Image(systemName: "heart.fill").foregroundStyle(.white)
                    }
                    .frame(width: 52, height: 52)
                }
            }
            .buttonStyle(.plain)

            NavigationLink { RecentlyPlayedView() } label: {
                quickTile(title: "Recently Played") {
                    ZStack {
                        OmniTuneTheme.darkSurface
                        Image(systemName: "waveform").foregroundStyle(OmniTuneTheme.accentHover)
                    }
                    .frame(width: 52, height: 52)
                }
            }
            .buttonStyle(.plain)

            ForEach(playlists) { pl in
                NavigationLink { PlaylistDetailView(playlistId: pl.id) } label: {
                    quickTile(title: pl.name) {
                        MosaicArtworkView(urls: pl.tracks.map(\.artworkUrl), size: 52, cornerRadius: 0)
                    }
                }
                .buttonStyle(.plain)
            }

            ForEach(recent.prefix(max(0, 4 - playlists.count))) { track in
                Button {
                    Task { await env.player.playTrack(track) }
                } label: {
                    quickTile(title: track.title) {
                        ArtworkView(url: track.artworkUrl, size: 52, pixelSize: 120, cornerRadius: 0)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func quickTile<Art: View>(title: String, @ViewBuilder art: () -> Art) -> some View {
        HStack(spacing: 10) {
            art()
            Text(title)
                .font(.caption.weight(.bold))
                .lineLimit(2)
                .foregroundStyle(.primary)
            Spacer(minLength: 4)
        }
        .frame(height: 52)
        .background(OmniTuneTheme.darkElevated, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .strokeBorder(OmniTuneTheme.accent.opacity(0.14), lineWidth: 0.8)
        )
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private func loadFeed() async {
        loading = true
        let feed = await RadioEngine.buildHomeFeed(catalog: env.catalog, library: env.library)
        shelves = feed
        let mixes = feed.flatMap(\.items).compactMap { item -> Mix? in
            if case .mix(let m) = item { return m }
            return nil
        }
        env.rememberMixes(mixes)
        loading = false
    }
}

public struct ShelfCarouselView: View {
    @Environment(OmniTuneEnvironment.self) private var env
    let shelf: HomeShelf

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(shelf.title)
                    .font(.title3.weight(.heavy))
                if let sub = shelf.subtitle {
                    Text(sub)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 14) {
                    ForEach(shelf.items) { item in
                        ShelfCardView(item: item, trackPool: shelfTrackPool)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private var shelfTrackPool: [Track] {
        shelf.items.compactMap { if case .track(let t) = $0 { return t } else { return nil } }
    }
}

public struct ShelfCardView: View {
    @Environment(OmniTuneEnvironment.self) private var env
    let item: ShelfItem
    let trackPool: [Track]

    public var body: some View {
        switch item {
        case .track(let track):
            Button {
                let list = trackPool.isEmpty ? [track] : trackPool
                let idx = list.firstIndex(where: { $0.id == track.id }) ?? 0
                Task { await env.player.play(list, startIndex: idx, context: PlaybackContext(type: "chart", name: "Top Songs")) }
            } label: {
                cardBody(title: track.title, subtitle: track.artistName) {
                    ArtworkView(url: track.artworkUrl, size: 148)
                }
            }
            .buttonStyle(.plain)

        case .album(let album):
            NavigationLink { AlbumDetailView(albumId: album.id) } label: {
                cardBody(title: album.title, subtitle: album.artistName) {
                    ArtworkView(url: album.artworkUrl, size: 148)
                }
            }
            .buttonStyle(.plain)

        case .artist(let artist):
            NavigationLink { ArtistDetailView(artistId: artist.id) } label: {
                cardBody(title: artist.name, subtitle: artist.genre ?? "Artist", centered: true) {
                    ArtistAvatarView(artistId: artist.id, initialUrl: artist.artworkUrl, size: 138)
                }
            }
            .buttonStyle(.plain)

        case .podcast(let podcast):
            NavigationLink { PodcastDetailView(podcastId: podcast.id) } label: {
                cardBody(title: podcast.title, subtitle: podcast.author) {
                    ArtworkView(url: podcast.artworkUrl, size: 148)
                }
            }
            .buttonStyle(.plain)

        case .mix(let mix):
            NavigationLink { MixDetailView(mix: mix) } label: {
                cardBody(title: mix.name, subtitle: mix.description) {
                    MosaicArtworkView(urls: mix.artwork, size: 148)
                }
            }
            .buttonStyle(.plain)

        case .playlist(let pl):
            NavigationLink { PlaylistDetailView(playlistId: pl.id) } label: {
                cardBody(title: pl.name, subtitle: "\(pl.tracks.count) songs") {
                    MosaicArtworkView(urls: pl.tracks.map(\.artworkUrl), size: 148)
                }
            }
            .buttonStyle(.plain)
        }
    }

    private func cardBody<Art: View>(title: String, subtitle: String, centered: Bool = false, @ViewBuilder art: () -> Art) -> some View {
        VStack(alignment: centered ? .center : .leading, spacing: 6) {
            art()
                .shadow(color: .black.opacity(0.28), radius: 8, y: 4)
            Text(title)
                .font(.subheadline.weight(.bold))
                .lineLimit(1)
                .foregroundStyle(.primary)
            Text(subtitle)
                .font(.caption)
                .lineLimit(2)
                .foregroundStyle(.secondary)
        }
        .frame(width: 148, alignment: centered ? .center : .leading)
    }
}
