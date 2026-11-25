#if canImport(OmniTuneCore)
import OmniTuneCore
#endif
import SwiftUI

/// OmniTune Radio & Smart Mixes tab: endless personal mixes, artist stations, and one-tap genre radio.
public struct RadioView: View {
    @Environment(OmniTuneEnvironment.self) private var env
    @State private var mixes: [Mix] = []
    @State private var podcasts: [Podcast] = []
    @State private var loading = true

    public var body: some View {
        let _ = env.library.version
        let topArtists = env.library.taste().topArtists(4)

        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack(spacing: 10) {
                    OmniTuneLogoView(size: 28)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("OmniTune Radio")
                            .font(.title2.weight(.heavy))
                        Text("Smart Shuffle stations & personal mixes")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)

                if loading && mixes.isEmpty {
                    ProgressView("Tuning stations…")
                        .tint(OmniTuneTheme.accent)
                        .frame(maxWidth: .infinity, minHeight: 160)
                }

                if !mixes.isEmpty {
                    ShelfCarouselView(shelf: HomeShelf(
                        id: "radio-mixes",
                        title: "Made for You",
                        subtitle: "Endless mixes shaped by your plays, likes and skips",
                        items: mixes.map { .mix($0) }
                    ))
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("Sonic Stations")
                        .font(.title3.weight(.heavy))
                        .padding(.horizontal, 16)

                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                        ForEach(topArtists, id: \.self) { artistName in
                            Button {
                                startStation(query: artistName, title: "\(artistName.capitalized) Station")
                            } label: {
                                stationCard(title: artistName.capitalized, subtitle: "Artist Radio", color: OmniTuneTheme.accent)
                            }
                            .buttonStyle(.plain)
                        }

                        ForEach(kOmniTuneGenres.prefix(8)) { g in
                            Button {
                                startStation(query: g.term, title: "\(g.name) Radio")
                            } label: {
                                stationCard(title: "\(g.name) Radio", subtitle: "Smart Shuffle", color: Color(hex: g.hexColor))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                }

                if !podcasts.isEmpty {
                    ShelfCarouselView(shelf: HomeShelf(id: "radio-pod", title: "Featured Shows", items: podcasts.map { .podcast($0) }))
                }
            }
            .padding(.bottom, 132)
        }
        .background(
            ZStack(alignment: .top) {
                OmniTuneTheme.darkBg.ignoresSafeArea()
                LinearGradient(colors: [OmniTuneTheme.accent.opacity(0.20), .clear], startPoint: .top, endPoint: .bottom)
                    .frame(height: 220)
                    .ignoresSafeArea()
            }
        )
        .toolbar(.hidden, for: .navigationBar)
        .task {
            loading = true
            async let m = RadioEngine.buildMixes(
                catalog: env.catalog,
                taste: env.library.taste(),
                recent: env.library.recentlyPlayed(limit: 25),
                explicitFilter: env.library.settings.explicitFilter
            )
            async let p = (try? env.catalog.getTopPodcasts(limit: 12)) ?? []
            (mixes, podcasts) = await (m, p)
            env.rememberMixes(mixes)
            loading = false
        }
    }

    private func stationCard(title: String, subtitle: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: "dot.radiowaves.left.and.right")
                .font(.title3)
                .foregroundStyle(.white.opacity(0.92))
            Spacer()
            Text(title).font(.headline.bold()).foregroundStyle(.white).lineLimit(1)
            Text(subtitle).font(.caption).foregroundStyle(.white.opacity(0.82))
        }
        .frame(maxWidth: .infinity, minHeight: 100, alignment: .leading)
        .padding(14)
        .background(LinearGradient(colors: [color, OmniTuneTheme.darkSurface], startPoint: .topLeading, endPoint: .bottomTrailing))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(OmniTuneTheme.accent.opacity(0.24), lineWidth: 0.8)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func startStation(query: String, title: String) {
        Haptics.medium()
        env.toast("Tuning \(title)…")
        Task {
            if let songs = try? await env.catalog.search(query, limit: 35).songs, !songs.isEmpty {
                await env.player.play(songs, context: PlaybackContext(type: "radio", name: title), shuffle: true)
            }
        }
    }
}
