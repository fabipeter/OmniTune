#if canImport(OmniTuneCore)
import OmniTuneCore
#endif
import SwiftUI

/// OmniTune track row: rounded-square art, active cobalt highlight, inline heart button,
/// swipe-right to add to queue with haptic feedback, and long-press/trailing context menu.
public struct TrackRowView: View {
    @Environment(OmniTuneEnvironment.self) private var env
    let track: Track
    var playlistId: String? = nil
    var showArtwork: Bool = true
    let onPlay: () -> Void

    public var body: some View {
        let _ = env.library.version
        let isCurrent = env.player.current?.id == track.id
        let liked = env.library.isLiked(track.id)

        HStack(spacing: 12) {
            if showArtwork {
                ArtworkView(url: track.artworkUrl, size: 50, pixelSize: 120, cornerRadius: 6)
            } else if let num = track.trackNumber {
                Text("\(num)")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(isCurrent ? OmniTuneTheme.accentHover : .secondary)
                    .frame(width: 24)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(track.title)
                    .font(.body.weight(isCurrent ? .bold : .medium))
                    .foregroundStyle(isCurrent ? OmniTuneTheme.accentHover : .primary)
                    .lineLimit(1)
                HStack(spacing: 5) {
                    if track.explicit {
                        Text("E")
                            .font(.system(size: 9, weight: .bold))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Color(.tertiaryLabel))
                            .foregroundStyle(Color(.systemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 2))
                    }
                    Text(track.artistName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            Button {
                Haptics.light()
                let now = env.library.toggleLike(track)
                env.toast(now ? "Added to Liked Songs" : "Removed from Liked Songs")
            } label: {
                Image(systemName: liked ? "heart.fill" : "heart")
                    .font(.subheadline)
                    .foregroundStyle(liked ? OmniTuneTheme.accent : .secondary)
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)

            Menu {
                trackMenuItems(liked: liked)
            } label: {
                Image(systemName: "ellipsis")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(width: 30, height: 30)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
        .contentShape(Rectangle())
        .onTapGesture(perform: onPlay)
        .contextMenu { trackMenuItems(liked: liked) }
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            Button {
                Haptics.success()
                env.player.addToQueue(track)
                env.toast("Added to Queue")
            } label: {
                Label("Queue", systemImage: "text.append")
            }
            .tint(OmniTuneTheme.accent)
        }
    }

    @ViewBuilder
    private func trackMenuItems(liked: Bool) -> some View {
        Button {
            Haptics.light()
            env.player.playNext(track)
            env.toast("Playing Next")
        } label: {
            Label("Play Next", systemImage: "text.insert")
        }

        Button {
            Haptics.light()
            env.player.addToQueue(track)
            env.toast("Added to Queue")
        } label: {
            Label("Add to Queue", systemImage: "text.append")
        }

        Button {
            env.playlistPickerTrack = track
        } label: {
            Label("Add to Playlist…", systemImage: "music.note.list")
        }

        Button {
            Haptics.light()
            let now = env.library.toggleLike(track)
            env.toast(now ? "Added to Liked Songs" : "Removed from Liked Songs")
        } label: {
            Label(liked ? "Remove from Liked Songs" : "Like Song", systemImage: liked ? "heart.slash" : "heart")
        }

        if track.kind == .song {
            Button {
                env.startRadio(from: track)
            } label: {
                Label("Start Song Radio", systemImage: "dot.radiowaves.left.and.right")
            }
        }

        if let pid = playlistId {
            Button(role: .destructive) {
                env.library.removeFromPlaylist(id: pid, trackId: track.id)
                env.toast("Removed from Playlist")
            } label: {
                Label("Remove from Playlist", systemImage: "trash")
            }
        }

        if let urlStr = track.storeUrl, let url = URL(string: urlStr) {
            ShareLink(item: url) {
                Label("Share", systemImage: "square.and.arrow.up")
            }
        }
    }
}

/// OmniTune action bar at the top of collection screens: circular Cobalt Play FAB + Smart Shuffle pill.
private struct PlayShuffleButtons: View {
    let onPlay: () -> Void
    let onShuffle: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            Button(action: onShuffle) {
                Label("Smart Shuffle", systemImage: "shuffle")
                    .font(.subheadline.weight(.bold))
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .background(OmniTuneTheme.darkElevated, in: Capsule())
                    .overlay(Capsule().strokeBorder(OmniTuneTheme.accent.opacity(0.30), lineWidth: 1))
                    .foregroundStyle(.primary)
            }
            .buttonStyle(.plain)

            Spacer()

            Button(action: onPlay) {
                Image(systemName: "play.fill")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(OmniTuneTheme.accent, in: Circle())
                    .shadow(color: OmniTuneTheme.accent.opacity(0.45), radius: 10, y: 4)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - Album Detail
public struct AlbumDetailView: View {
    @Environment(OmniTuneEnvironment.self) private var env
    let albumId: String
    @State private var album: Album?
    @State private var tracks: [Track] = []
    @State private var loading = true

    public var body: some View {
        let _ = env.library.version
        List {
            if let album {
                Section {
                    VStack(spacing: 12) {
                        ArtworkView(url: album.artworkUrl, size: 224, pixelSize: 600, cornerRadius: 10)
                            .shadow(color: .black.opacity(0.35), radius: 16, y: 8)
                        Text(album.title).font(.title2.weight(.heavy)).multilineTextAlignment(.center)
                        if let aid = album.artistId {
                            NavigationLink { ArtistDetailView(artistId: aid) } label: {
                                Text(album.artistName).font(.headline).foregroundStyle(OmniTuneTheme.accentHover)
                            }
                        } else {
                            Text(album.artistName).font(.headline).foregroundStyle(OmniTuneTheme.accentHover)
                        }
                        if let g = album.genre, let y = album.releaseDate?.prefix(4) {
                            Text("\(g) · \(y)").font(.caption).foregroundStyle(.secondary)
                        }
                        PlayShuffleButtons(
                            onPlay: { Task { await env.player.play(tracks, context: PlaybackContext(type: "album", id: album.id, name: album.title), shuffle: false) } },
                            onShuffle: { Task { await env.player.play(tracks, context: PlaybackContext(type: "album", id: album.id, name: album.title), shuffle: true) } }
                        )
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)

                ForEach(Array(tracks.enumerated()), id: \.element.id) { idx, t in
                    TrackRowView(track: t, showArtwork: false) {
                        Task { await env.player.play(tracks, startIndex: idx, context: PlaybackContext(type: "album", id: album.id, name: album.title), shuffle: false) }
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            } else if loading {
                ProgressView().tint(OmniTuneTheme.accent).frame(maxWidth: .infinity, minHeight: 240).listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(OmniTuneTheme.darkBg.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { Color.clear.frame(height: 84) }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let album {
                ToolbarItem(placement: .topBarTrailing) {
                    let saved = env.library.isAlbumSaved(album.id)
                    Button {
                        Haptics.light()
                        env.library.toggleAlbum(album)
                        env.toast(saved ? "Removed from Library" : "Saved Album to Library")
                    } label: {
                        Image(systemName: saved ? "heart.fill" : "heart")
                            .foregroundStyle(saved ? OmniTuneTheme.accent : .primary)
                    }
                }
            }
        }
        .task(id: albumId) {
            loading = true
            if let res = try? await env.catalog.getAlbum(id: albumId) {
                album = res.album
                tracks = res.tracks
            }
            loading = false
        }
    }
}

// MARK: - Artist Detail
public struct ArtistDetailView: View {
    @Environment(OmniTuneEnvironment.self) private var env
    let artistId: String
    @State private var artist: Artist?
    @State private var topSongs: [Track] = []
    @State private var albums: [Album] = []
    @State private var loading = true

    public var body: some View {
        let _ = env.library.version
        ScrollView {
            if let artist {
                VStack(spacing: 18) {
                    ArtworkView(url: artist.artworkUrl, size: 170, pixelSize: 500, isCircle: true)
                        .shadow(color: .black.opacity(0.35), radius: 14)
                    Text(artist.name).font(.largeTitle.weight(.heavy)).multilineTextAlignment(.center)

                    HStack(spacing: 12) {
                        let followed = env.library.isArtistFollowed(artist.id)
                        Button {
                            Haptics.light()
                            env.library.toggleArtist(artist)
                            env.toast(followed ? "Unfollowed \(artist.name)" : "Following \(artist.name)")
                        } label: {
                            Text(followed ? "Following" : "Follow")
                                .font(.subheadline.bold())
                                .padding(.horizontal, 22)
                                .padding(.vertical, 8)
                                .background(followed ? OmniTuneTheme.darkElevated : OmniTuneTheme.accent, in: Capsule())
                                .foregroundStyle(.white)
                        }
                        .buttonStyle(.plain)
                    }

                    PlayShuffleButtons(
                        onPlay: { Task { await env.player.play(topSongs, context: PlaybackContext(type: "artist", id: artist.id, name: artist.name), shuffle: false) } },
                        onShuffle: { Task { await env.player.play(topSongs, context: PlaybackContext(type: "artist", id: artist.id, name: artist.name), shuffle: true) } }
                    )

                    if !topSongs.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Popular").font(.title3.weight(.heavy)).padding(.horizontal, 16)
                            ForEach(Array(topSongs.prefix(10).enumerated()), id: \.element.id) { idx, t in
                                TrackRowView(track: t) {
                                    Task { await env.player.play(topSongs, startIndex: idx, context: PlaybackContext(type: "artist", id: artist.id, name: artist.name)) }
                                }
                            }
                        }
                    }

                    if !albums.isEmpty {
                        ShelfCarouselView(shelf: HomeShelf(id: "art-alb", title: "Discography", items: albums.map { .album($0) }))
                    }
                }
                .padding(.top, 12)
                .padding(.bottom, 130)
            } else if loading {
                ProgressView().tint(OmniTuneTheme.accent).frame(maxWidth: .infinity, minHeight: 260)
            }
        }
        .background(OmniTuneTheme.darkBg.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .task(id: artistId) {
            loading = true
            if let res = try? await env.catalog.getArtist(id: artistId) {
                artist = res.artist
                topSongs = res.topSongs
                albums = res.albums
            }
            loading = false
        }
    }
}

// MARK: - Podcast Detail
public struct PodcastDetailView: View {
    @Environment(OmniTuneEnvironment.self) private var env
    let podcastId: String
    @State private var podcast: Podcast?
    @State private var episodes: [Track] = []
    @State private var loading = true

    public var body: some View {
        let _ = env.library.version
        List {
            if let podcast {
                Section {
                    VStack(spacing: 12) {
                        ArtworkView(url: podcast.artworkUrl, size: 200, pixelSize: 500, cornerRadius: 10)
                        Text(podcast.title).font(.title2.weight(.heavy)).multilineTextAlignment(.center)
                        Text(podcast.author).font(.subheadline).foregroundStyle(.secondary)
                        let followed = env.library.isPodcastFollowed(podcast.id)
                        Button {
                            env.library.togglePodcast(podcast)
                            env.toast(followed ? "Unfollowed Podcast" : "Following Podcast")
                        } label: {
                            Text(followed ? "Following" : "Follow")
                                .font(.subheadline.bold())
                                .padding(.horizontal, 22)
                                .padding(.vertical, 8)
                                .background(followed ? OmniTuneTheme.darkElevated : OmniTuneTheme.accent, in: Capsule())
                                .foregroundStyle(.white)
                        }
                        .buttonStyle(.plain)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)

                ForEach(Array(episodes.enumerated()), id: \.element.id) { idx, ep in
                    TrackRowView(track: ep) {
                        Task { await env.player.play(episodes, startIndex: idx, context: PlaybackContext(type: "podcast", id: podcast.id, name: podcast.title), shuffle: false) }
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            } else if loading {
                ProgressView().tint(OmniTuneTheme.accent).frame(maxWidth: .infinity, minHeight: 240).listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(OmniTuneTheme.darkBg.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { Color.clear.frame(height: 84) }
        .navigationBarTitleDisplayMode(.inline)
        .task(id: podcastId) {
            loading = true
            if let res = try? await env.catalog.getPodcast(id: podcastId) {
                podcast = res.podcast
                episodes = res.episodes
            }
            loading = false
        }
    }
}

// MARK: - Playlist Detail
public struct PlaylistDetailView: View {
    @Environment(OmniTuneEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let playlistId: String
    @State private var isRenaming = false
    @State private var draftName = ""

    public var body: some View {
        let _ = env.library.version
        if let pl = env.library.playlist(id: playlistId) {
            List {
                Section {
                    VStack(spacing: 12) {
                        MosaicArtworkView(urls: pl.tracks.map(\.artworkUrl), size: 210, cornerRadius: 10)
                            .shadow(radius: 10)
                        Text(pl.name).font(.title2.weight(.heavy))
                        Text("\(pl.tracks.count) songs").font(.caption).foregroundStyle(.secondary)
                        if !pl.tracks.isEmpty {
                            PlayShuffleButtons(
                                onPlay: { Task { await env.player.play(pl.tracks, context: PlaybackContext(type: "playlist", id: pl.id, name: pl.name), shuffle: false) } },
                                onShuffle: { Task { await env.player.play(pl.tracks, context: PlaybackContext(type: "playlist", id: pl.id, name: pl.name), shuffle: true) } }
                            )
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)

                ForEach(Array(pl.tracks.enumerated()), id: \.element.id) { idx, t in
                    TrackRowView(track: t, playlistId: pl.id) {
                        Task { await env.player.play(pl.tracks, startIndex: idx, context: PlaybackContext(type: "playlist", id: pl.id, name: pl.name), shuffle: false) }
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
                .onMove { from, to in
                    env.library.moveInPlaylist(id: pl.id, fromOffsets: from, toOffset: to)
                }
                .onDelete { offsets in
                    for idx in offsets { env.library.removeFromPlaylist(id: pl.id, trackId: pl.tracks[idx].id) }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(OmniTuneTheme.darkBg.ignoresSafeArea())
            .safeAreaInset(edge: .bottom) { Color.clear.frame(height: 84) }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    EditButton()
                    Menu {
                        Button("Rename") {
                            draftName = pl.name
                            isRenaming = true
                        }
                        Button(pl.pinned ? "Unpin" : "Pin to Top") {
                            env.library.togglePinPlaylist(id: pl.id)
                        }
                        Button("Delete Playlist", role: .destructive) {
                            env.library.deletePlaylist(id: pl.id)
                            dismiss()
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .alert("Rename Playlist", isPresented: $isRenaming) {
                TextField("Name", text: $draftName)
                Button("Save") { env.library.renamePlaylist(id: pl.id, name: draftName) }
                Button("Cancel", role: .cancel) {}
            }
        } else {
            ContentUnavailableView("Playlist Deleted", systemImage: "music.note.list")
        }
    }
}

// MARK: - Mix, Genre, Liked, Recent
public struct MixDetailView: View {
    @Environment(OmniTuneEnvironment.self) private var env
    let mix: Mix

    public var body: some View {
        List {
            Section {
                VStack(spacing: 12) {
                    MosaicArtworkView(urls: mix.artwork, size: 210, cornerRadius: 10)
                    Text(mix.name).font(.title2.weight(.heavy))
                    Text(mix.description).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    PlayShuffleButtons(
                        onPlay: { Task { await env.player.play(mix.tracks, context: PlaybackContext(type: "mix", id: mix.id, name: mix.name), shuffle: false) } },
                        onShuffle: { Task { await env.player.play(mix.tracks, context: PlaybackContext(type: "mix", id: mix.id, name: mix.name), shuffle: true) } }
                    )
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)

            ForEach(Array(mix.tracks.enumerated()), id: \.element.id) { idx, t in
                TrackRowView(track: t) {
                    Task { await env.player.play(mix.tracks, startIndex: idx, context: PlaybackContext(type: "mix", id: mix.id, name: mix.name), shuffle: false) }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(OmniTuneTheme.darkBg.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { Color.clear.frame(height: 84) }
        .navigationBarTitleDisplayMode(.inline)
    }
}

public struct GenreDetailView: View {
    @Environment(OmniTuneEnvironment.self) private var env
    let genre: Genre
    @State private var tracks: [Track] = []
    @State private var loading = true

    public var body: some View {
        List {
            if !tracks.isEmpty {
                Section {
                    PlayShuffleButtons(
                        onPlay: { Task { await env.player.play(tracks, context: PlaybackContext(type: "genre", id: genre.id, name: genre.name), shuffle: false) } },
                        onShuffle: { Task { await env.player.play(tracks, context: PlaybackContext(type: "genre", id: genre.id, name: genre.name), shuffle: true) } }
                    )
                }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)

                ForEach(Array(tracks.enumerated()), id: \.element.id) { idx, t in
                    TrackRowView(track: t) {
                        Task { await env.player.play(tracks, startIndex: idx, context: PlaybackContext(type: "genre", id: genre.id, name: genre.name)) }
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            } else if loading {
                ProgressView().tint(OmniTuneTheme.accent).frame(maxWidth: .infinity, minHeight: 200).listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(OmniTuneTheme.darkBg.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { Color.clear.frame(height: 84) }
        .navigationTitle(genre.name)
        .task(id: genre.id) {
            loading = true
            tracks = (try? await env.catalog.getGenreTracks(genre, limit: 40)) ?? []
            loading = false
        }
    }
}

public struct LikedSongsView: View {
    @Environment(OmniTuneEnvironment.self) private var env

    public var body: some View {
        let _ = env.library.version
        let tracks = env.library.likedTracks
        List {
            if !tracks.isEmpty {
                Section {
                    PlayShuffleButtons(
                        onPlay: { Task { await env.player.play(tracks, context: PlaybackContext(type: "liked", name: "Liked Songs"), shuffle: false) } },
                        onShuffle: { Task { await env.player.play(tracks, context: PlaybackContext(type: "liked", name: "Liked Songs"), shuffle: true) } }
                    )
                }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)

                ForEach(Array(tracks.enumerated()), id: \.element.id) { idx, t in
                    TrackRowView(track: t) {
                        Task { await env.player.play(tracks, startIndex: idx, context: PlaybackContext(type: "liked", name: "Liked Songs"), shuffle: false) }
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            } else {
                ContentUnavailableView("No Liked Songs Yet", systemImage: "heart", description: Text("Tap the heart on any song to save it and train OmniTune Smart Shuffle."))
                    .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(OmniTuneTheme.darkBg.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { Color.clear.frame(height: 84) }
        .navigationTitle("Liked Songs")
    }
}

public struct RecentlyPlayedView: View {
    @Environment(OmniTuneEnvironment.self) private var env

    public var body: some View {
        let _ = env.library.version
        let tracks = env.library.recentlyPlayed(limit: 50)
        List {
            if tracks.isEmpty {
                ContentUnavailableView("No History Yet", systemImage: "clock", description: Text("Tracks you listen to will appear here."))
                    .listRowBackground(Color.clear)
            } else {
                ForEach(Array(tracks.enumerated()), id: \.element.id) { idx, t in
                    TrackRowView(track: t) {
                        Task { await env.player.play(tracks, startIndex: idx, context: PlaybackContext(type: "recent", name: "Recently Played")) }
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(OmniTuneTheme.darkBg.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { Color.clear.frame(height: 84) }
        .navigationTitle("Recently Played")
    }
}

// MARK: - Playlist Picker & Create Sheets
public struct PlaylistPickerSheet: View {
    @Environment(OmniTuneEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let track: Track

    public var body: some View {
        let _ = env.library.version
        NavigationStack {
            List {
                Button {
                    dismiss()
                    env.createPlaylistSeedTrack = track
                    env.isCreatePlaylistPresented = true
                } label: {
                    Label("New Playlist…", systemImage: "plus.circle.fill")
                        .foregroundStyle(OmniTuneTheme.accent)
                }

                ForEach(env.library.playlists) { pl in
                    Button {
                        env.library.addToPlaylist(id: pl.id, tracks: [track])
                        Haptics.success()
                        env.toast("Added to \(pl.name)")
                        dismiss()
                    } label: {
                        HStack {
                            MosaicArtworkView(urls: pl.tracks.map(\.artworkUrl), size: 44)
                            VStack(alignment: .leading) {
                                Text(pl.name).foregroundStyle(.primary)
                                Text("\(pl.tracks.count) songs").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Add to Playlist")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }
}

public struct CreatePlaylistSheet: View {
    @Environment(OmniTuneEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let seedTrack: Track?
    @State private var name = ""
    @State private var desc = ""

    public var body: some View {
        NavigationStack {
            Form {
                TextField("Playlist Name", text: $name)
                TextField("Description (optional)", text: $desc)
            }
            .navigationTitle("New Playlist")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        let tracks = seedTrack.map { [$0] } ?? []
                        let pl = env.library.createPlaylist(name: name, tracks: tracks, description: desc.isEmpty ? nil : desc)
                        Haptics.success()
                        env.toast("Created \(pl.name)")
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
