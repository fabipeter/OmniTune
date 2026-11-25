#if canImport(OmniTuneCore)
import OmniTuneCore
#endif
import SwiftUI

public struct SearchView: View {
    @Environment(OmniTuneEnvironment.self) private var env
    @State private var query = ""
    @State private var scope: SearchScope = .all
    @State private var results: SearchResults?
    @State private var releases: [Album] = []
    @State private var loading = false

    enum SearchScope: String, CaseIterable {
        case all = "All"
        case songs = "Songs"
        case albums = "Albums"
        case artists = "Artists"
        case podcasts = "Podcasts"
    }

    public var body: some View {
        let _ = env.library.version
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                // Header + Persistent Pill Search Bar
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 10) {
                        OmniTuneLogoView(size: 28)
                        Text("Search")
                            .font(.title2.weight(.heavy))
                    }

                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(.secondary)
                        TextField("What do you want to play?", text: $query)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        if !query.isEmpty {
                            Button {
                                query = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.secondary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(OmniTuneTheme.darkElevated, in: Capsule())
                    .overlay(Capsule().strokeBorder(OmniTuneTheme.accent.opacity(0.28), lineWidth: 1))
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)

                if query.trimmingCharacters(in: .whitespaces).isEmpty {
                    if !env.library.recentSearches.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text("Recent Searches").font(.headline)
                                Spacer()
                                Button("Clear") { env.library.clearRecentSearches() }
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(OmniTuneTheme.accentHover)
                            }
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(env.library.recentSearches, id: \.self) { term in
                                        FilterChip(title: term, active: false) { query = term }
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                    }

                    if !releases.isEmpty {
                        ShelfCarouselView(shelf: HomeShelf(id: "search-new", title: "New & Trending Releases", items: releases.map { .album($0) }))
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Browse All").font(.title3.weight(.heavy))
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                            ForEach(kOmniTuneGenres) { genre in
                                NavigationLink { GenreDetailView(genre: genre) } label: {
                                    ZStack(alignment: .topLeading) {
                                        LinearGradient(
                                            colors: [Color(hex: genre.hexColor), OmniTuneTheme.darkSurface],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                        Text(genre.name)
                                            .font(.headline.bold())
                                            .foregroundStyle(.white)
                                            .padding(14)
                                    }
                                    .frame(height: 92)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                                            .strokeBorder(Color.white.opacity(0.12), lineWidth: 0.8)
                                    )
                                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(SearchScope.allCases, id: \.self) { s in
                                FilterChip(title: s.rawValue, active: scope == s) { scope = s }
                            }
                        }
                        .padding(.horizontal, 16)
                    }

                    if loading {
                        ProgressView()
                            .tint(OmniTuneTheme.accent)
                            .frame(maxWidth: .infinity, minHeight: 160)
                    } else if let res = results {
                        if (scope == .all || scope == .songs), !res.songs.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Songs").font(.title3.bold()).padding(.horizontal, 16)
                                ForEach(Array(res.songs.prefix(scope == .all ? 6 : 25).enumerated()), id: \.element.id) { idx, track in
                                    TrackRowView(
                                        track: track,
                                        onPlay: {
                                            Task { await env.player.play(res.songs, startIndex: idx, context: PlaybackContext(type: "search", name: "Search: \(query)")) }
                                        }
                                    )
                                }
                            }
                        }
                        if (scope == .all || scope == .artists), !res.artists.isEmpty {
                            ShelfCarouselView(shelf: HomeShelf(id: "s-art", title: "Artists", items: res.artists.map { .artist($0) }))
                        }
                        if (scope == .all || scope == .albums), !res.albums.isEmpty {
                            ShelfCarouselView(shelf: HomeShelf(id: "s-alb", title: "Albums", items: res.albums.map { .album($0) }))
                        }
                        if (scope == .all || scope == .podcasts), !res.podcasts.isEmpty {
                            ShelfCarouselView(shelf: HomeShelf(id: "s-pod", title: "Podcasts", items: res.podcasts.map { .podcast($0) }))
                        }
                    }
                }
            }
            .padding(.bottom, 132)
        }
        .background(OmniTuneTheme.darkBg.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .task {
            if releases.isEmpty {
                releases = (try? await env.catalog.getNewReleases(limit: 12)) ?? []
            }
        }
        .task(id: query) {
            let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else {
                results = nil
                return
            }
            loading = true
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            results = try? await env.catalog.search(trimmed, limit: 20)
            env.library.addRecentSearch(trimmed)
            loading = false
        }
    }
}
