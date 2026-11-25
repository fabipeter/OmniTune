# OmniTune Architecture

## 1. Three Pillars Across Four Platforms

OmniTune intentionally separates **domain logic** from **platform UX**:

| Layer | Web & Desktop (`apps/web`, `apps/desktop`) | Native iOS (`apps/mobile/ios`) | Native Android (`apps/mobile/android`) |
|---|---|---|---|
| **UI Language** | OmniTune Midnight-Cobalt 3-pane UX (`#1E63FF`) | OmniTune Midnight-Cobalt 4-tab UX (`#1E63FF`) | OmniTune Midnight-Cobalt 4-tab UX (`#1E63FF`) |
| **Core Logic** | `@omnitune/core` (TypeScript) | `OmniTuneCore` (Swift 6 SPM package) | `app.omnitune.android.core` (Kotlin) |
| **Audio Engine** | Dual `<audio>` + WebAudio 10-band EQ / Compressor / Equal-Power Crossfade + optional **MusicKit JS v3** | Dual `AVPlayer` + `AVAudioSession` + `MPNowPlayingInfoCenter` + native **MusicKit** (`ApplicationMusicPlayer`) | AndroidX Media3 `ExoPlayer` + foreground `MediaSessionService` |
| **Local Storage** | `localStorage` JSON + session restore | `Application Support/OmniTune/library.v1.json` | `filesDir/omnitune_library.v1.json` |
| **Cloud Sync** | Optional LWW sync via `apps/server` | Optional LWW sync via `apps/server` | Optional LWW sync via `apps/server` |

## 2. Apple Catalog Integration

All clients query Apple’s official catalog endpoints without requiring a mandatory API key:
- **Search & Lookup**: `https://itunes.apple.com/search` and `https://itunes.apple.com/lookup` (returns `trackId`, `collectionId`, `artistId`, 100–600px artwork templates, 30s AAC `previewUrl` for songs, and full `episodeUrl` streams for podcasts).
- **Live Charts**: `https://rss.marketingtools.apple.com/api/v2/{country}/...` for Top Songs, Top Albums, and Top Podcasts.
- **Full-Length Songs**: Apple’s `trackId` is the exact catalog song identifier used by **MusicKit**. On iOS, native `MusicKit` streams full-length Lossless/Dolby Atmos audio for authorized subscribers; on Web/Desktop, linking MusicKit via `apps/server`'s `GET /apple/developer-token` routes song playback through **MusicKit JS v3**.

## 3. OmniTune Smart Shuffle & Recommendations

Implemented identically in TypeScript (`packages/core`), Swift (`OmniTuneCore`), and Kotlin (`app.omnitune.android.core`):
1. **Taste Profile (`TasteProfile`)**: Computes time-decayed affinity scores (30-day half-life) for artists and genres from play completion ratios, likes (+2.0 artist / +1.5 genre), and early skips (-0.6), plus per-track skip rates and play counts.
2. **Smart Shuffle (`smartShuffle`)**:
   - Assigns each track a weight $w = e^{\text{boost}}$ from artist/genre affinity, likes, play counts, recency penalty (last 30 plays pushed back), and skip-rate penalty.
   - Samples an order via **Efraimidis–Spirakis** weighted random keys ($u^{1/w}$).
   - Runs a greedy **artist & album gap-spreading** pass with tight-distribution lookahead so the same artist or album is never played back-to-back when avoidable.
3. **Autoplay Radio & Mixes (`buildRadio`, `buildMixes`)**: Seeds candidate pools from the seed artist’s top tracks, matching genre tracks, and top loved artists, then ranks with novelty bonuses and applies Smart Shuffle.

## 4. Cross-Device Sync (`apps/server`)

`apps/server` uses Fastify + Node's built-in `node:sqlite` (zero native C++ build steps):
- Passwords hashed with `crypto.scryptSync` + per-user random salt (`timingSafeEqual` verification).
- Stateless HS256 JWT tokens.
- Per-entry **Last-Write-Wins (LWW)** merge with deletion tombstones and monotonic per-user sequence cursors (`POST /sync`), ensuring offline edits on any device reconcile deterministically.
