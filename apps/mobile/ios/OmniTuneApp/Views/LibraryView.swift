#if canImport(OmniTuneCore)
import OmniTuneCore
#endif
import SwiftUI

public struct LibraryView: View {
    @Environment(OmniTuneEnvironment.self) private var env
    @State private var filter: LibFilter = .all
    @State private var sortAlpha = false

    enum LibFilter: String, CaseIterable {
        case all = "All"
        case playlists = "Playlists"
        case albums = "Albums"
        case artists = "Artists"
        case podcasts = "Podcasts"
    }

    public var body: some View {
        let _ = env.library.version
        let playlists = sorted(env.library.playlists, by: \.name)
        let albums = sorted(env.library.savedAlbums, by: \.title)
        let artists = sorted(env.library.followedArtists, by: \.name)
        let podcasts = sorted(env.library.followedPodcasts, by: \.title)

        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    OmniTuneLogoView(size: 28)
                    Text("Your Library")
                        .font(.title2.weight(.heavy))
                    Spacer()
                    Button {
                        sortAlpha.toggle()
                    } label: {
                        Image(systemName: sortAlpha ? "textformat.abc" : "arrow.up.arrow.down")
                            .frame(width: 34, height: 34)
                            .background(OmniTuneTheme.darkElevated, in: Circle())
                    }
                    .buttonStyle(.plain)

                    Button {
                        env.createPlaylistSeedTrack = nil
                        env.isCreatePlaylistPresented = true
                    } label: {
                        Image(systemName: "plus")
                            .frame(width: 34, height: 34)
                            .background(OmniTuneTheme.accent, in: Circle())
                            .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)

                    NavigationLink { SettingsView() } label: {
                        Image(systemName: "gearshape.fill")
                            .frame(width: 34, height: 34)
                            .background(OmniTuneTheme.darkElevated, in: Circle())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(LibFilter.allCases, id: \.self) { f in
                            FilterChip(title: f.rawValue, active: filter == f) { filter = f }
                        }
                    }
                    .padding(.horizontal, 16)
                }

                VStack(spacing: 6) {
                    NavigationLink { LikedSongsView() } label: {
                        HStack(spacing: 12) {
                            ZStack {
                                OmniTuneTheme.sonicGradient
                                Image(systemName: "heart.fill").foregroundStyle(.white)
                            }
                            .frame(width: 54, height: 54)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Liked Songs").font(.body.weight(.bold)).foregroundStyle(.primary)
                                HStack(spacing: 4) {
                                    Image(systemName: "pin.fill").font(.caption2).foregroundStyle(OmniTuneTheme.accentHover)
                                    Text("Playlist · \(env.library.likedTracks.count) songs").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 6)
                    }
                    .buttonStyle(.plain)

                    NavigationLink { RecentlyPlayedView() } label: {
                        HStack(spacing: 12) {
                            ZStack {
                                OmniTuneTheme.darkElevated
                                Image(systemName: "clock.fill").foregroundStyle(OmniTuneTheme.accentHover)
                            }
                            .frame(width: 54, height: 54)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Recently Played").font(.body.weight(.bold)).foregroundStyle(.primary)
                                Text("\(env.library.recentlyPlayed(limit: 50).count) tracks").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 6)
                    }
                    .buttonStyle(.plain)

                    if filter == .all || filter == .playlists {
                        ForEach(playlists) { pl in
                            NavigationLink { PlaylistDetailView(playlistId: pl.id) } label: {
                                HStack(spacing: 12) {
                                    MosaicArtworkView(urls: pl.tracks.map(\.artworkUrl), size: 54)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(pl.name).font(.body.weight(.semibold)).foregroundStyle(.primary)
                                        HStack(spacing: 4) {
                                            if pl.pinned {
                                                Image(systemName: "pin.fill").font(.caption2).foregroundStyle(OmniTuneTheme.accentHover)
                                            }
                                            Text("Playlist · \(pl.tracks.count) songs").font(.caption).foregroundStyle(.secondary)
                                        }
                                    }
                                    Spacer()
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 6)
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if filter == .all || filter == .albums {
                        ForEach(albums) { a in
                            NavigationLink { AlbumDetailView(albumId: a.id) } label: {
                                HStack(spacing: 12) {
                                    ArtworkView(url: a.artworkUrl, size: 54)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(a.title).font(.body.weight(.semibold)).foregroundStyle(.primary).lineLimit(1)
                                        Text("Album · \(a.artistName)").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                    }
                                    Spacer()
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 6)
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if filter == .all || filter == .artists {
                        ForEach(artists) { a in
                            NavigationLink { ArtistDetailView(artistId: a.id) } label: {
                                HStack(spacing: 12) {
                                    ArtistAvatarView(artistId: a.id, initialUrl: a.artworkUrl, size: 52)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(a.name).font(.body.weight(.semibold)).foregroundStyle(.primary)
                                        Text("Artist").font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 6)
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if filter == .all || filter == .podcasts {
                        ForEach(podcasts) { p in
                            NavigationLink { PodcastDetailView(podcastId: p.id) } label: {
                                HStack(spacing: 12) {
                                    ArtworkView(url: p.artworkUrl, size: 54)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(p.title).font(.body.weight(.semibold)).foregroundStyle(.primary).lineLimit(1)
                                        Text("Podcast · \(p.author)").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                    }
                                    Spacer()
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 6)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(.bottom, 132)
        }
        .background(OmniTuneTheme.darkBg.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }

    private func sorted<T>(_ items: [T], by keyPath: KeyPath<T, String>) -> [T] {
        sortAlpha ? items.sorted { $0[keyPath: keyPath].localizedCaseInsensitiveCompare($1[keyPath: keyPath]) == .orderedAscending } : items
    }
}
