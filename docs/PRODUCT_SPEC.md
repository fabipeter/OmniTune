# OmniTune product spec

OmniTune = **smart discovery** + **rich catalog & sound** + **one uniform UX on every platform**.

| Pillar | Where it lives |
|---|---|
| OmniTune UX (web + desktop) | `apps/web` (desktop wraps it in `apps/desktop`) — 3-pane layout: sidebar / main / now-playing panel / bottom player bar |
| OmniTune UX (mobile) | `apps/mobile` — same Midnight-Cobalt look & 4-tab navigation (Home · Search · Radio · Library) as web/desktop |
| Apple catalog data | `packages/core/src/catalog/apple.ts` (iTunes Search/Lookup API + Apple RSS charts; MusicKit optional on web for full-length playback) |
| Smart shuffle & recommendations | `packages/core/src/shuffle`, `packages/core/src/recommend` |
| Playback state machine (queue/shuffle/repeat/crossfade/sleep/autoplay) | `packages/core/src/player/controller.ts` |
| Library, history, settings, offline-first persistence | `packages/core/src/library/store.ts` |
| Accounts + cross-device sync, MusicKit token, catalog cache | `apps/server` |

## Shared logic: always use `@omnitune/core`

Do **not** re-implement any of these in an app — import them:

* `AppleCatalog` / `CatalogProvider` — search, album, artist, podcast, charts, genres.
* `LibraryStore` — likes, albums, artists, podcasts, playlists, history, episode progress, settings (+ `taste()`).
* `PlayerController` + `AudioEngine` — each platform only supplies an `AudioEngine` implementation.
* `smartShuffle`, `buildRadio`, `buildMixes`, `buildHomeFeed` — the personalisation algorithm side.
* `fetchLyrics`, `parseLrc`, `activeLyricIndex` — synced lyrics (LRCLIB).
* `SyncClient` — optional sign-in + library sync with `apps/server`.
* `artworkAt(url, size)`, `formatDuration`, `GENRES`, `EQ_PRESETS`, `DEFAULT_SETTINGS`.

Apps subscribe with `useSyncExternalStore` (`library.subscribe/getSnapshot`, `player.subscribe/getState`,
`player.subscribeProgress` for the seek bar so the whole tree doesn't re-render 4×/sec).

Wiring that every client must do:

```ts
const library = new LibraryStore(storage);                    // localStorage / AsyncStorage
const catalog = new AppleCatalog({ country: library.getSettings().country });
const player = new PlayerController({
  engine,                                                     // platform engine
  getSettings: () => library.getSettings(),
  getTaste: () => library.taste(),
  autoplay: (seed, taste) => buildRadio(seed, catalog, taste, { explicitFilter: library.getSettings().explicitFilter }),
  onPlayed: (e) => library.recordPlay(e),
  onEpisodeProgress: (id, ms) => library.setEpisodeProgress(id, ms),
  getEpisodeProgress: (id) => library.episodeProgress(id),
});
```

## Feature parity checklist (the OmniTune feature set)

Implemented where the data/licensing allows. ✅ = required in this repo.

**Playback** ✅ play/pause · next/prev (prev restarts after 3 s) · seek · volume/mute · smart shuffle · repeat off/all/one ·
queue (play next, add to queue, reorder, remove, clear, jump) · crossfade · gapless preload · volume normalisation ·
10-band EQ + presets (web/desktop via WebAudio) · podcast speed (0.5–3×) and ±15/30 s skips · resume where you left off (podcasts + last session) ·
sleep timer (minutes / end of track) · autoplay radio when the queue ends · media keys / Media Session / lock-screen controls ·
keyboard shortcuts (web/desktop).

**Home** ✅ greeting · filter chips (All / Music / Podcasts) · quick-pick grid (liked songs + recent + playlists) ·
shelves from `buildHomeFeed` (Jump back in, Made for you mixes, Top songs, New releases, Popular albums, Podcasts).

**Search** ✅ debounced instant search · recent searches · top result · songs/albums/artists/podcasts/episodes · type chips · Browse-all genre grid → genre page.

**Library** ✅ filter chips (Playlists / Albums / Artists / Podcasts) · sort (recents / alphabetical) · grid & list view ·
Liked Songs · create / rename / delete / pin playlist · add to playlist (from any row's menu) · reorder & remove tracks · recently played.

**Pages** ✅ Album · Artist (popular, discography, follow, play/shuffle) · Podcast (episodes with progress, follow) · Playlist · Mix · Genre · Liked Songs · Queue · Settings.

**Now playing** ✅ large artwork · like · add to playlist · synced lyrics (karaoke highlight) · queue view ·
go to artist/album · share (copies share link) · sleep timer · explicit badge · preview badge ("30 s preview") when not full-length.

**Accounts & sync** ✅ guest-first (everything works offline/local) · optional sign-in/up against `apps/server` · automatic sync on launch + after edits (debounced).

**Settings** ✅ audio quality · crossfade slider · normalise volume · EQ · autoplay · explicit filter · country · shuffle mode (Smart/Random) · theme · clear history · account · (web) link MusicKit for full-length songs.

**Deliberately not included** (needs licences/infrastructure OmniTune doesn't have): friends/social/Blend/Jam,
Wrapped, DJ/AI-generated playlists, video podcasts/Canvas, DRM offline downloads, lossless/Dolby Atmos streaming (needs MusicKit native playback).
Show honest empty states rather than fake UI for these.

## Honest limits to surface in the UI

* Without MusicKit, songs are Apple's **30-second previews** (podcast episodes are full length). Always show a subtle "Preview" badge.
* Apple's public API has no artist photos → use `catalog.getArtistArtwork(id)` (top release art) in circular avatars.

## Visual design

### Web + desktop — OmniTune template
* Colours: bg `#070D1B`, panels `#0D162B`, elevated `#13203C`, text `#F4F7FF`, secondary `#9AA9C7`, **accent `#1E63FF`** (derived from the OmniTune logo).
* Layout: top bar (back/forward, search, profile) · left sidebar (Home, Search, Your Library with chips/sort/list) · centre scrollable panel with
  gradient header derived from artwork colour · right collapsible now-playing/queue/lyrics panel · bottom player bar (art+title+like | transport+seek | queue, lyrics, volume, fullscreen).
* Resizable/collapsible sidebar, hover-reveal play buttons on cards, sticky table header, row hover play icon, context menu on right click, toasts, skeleton loaders, responsive: ≤ 900 px collapses to a bottom tab bar + mini player (this is the mobile-web/PWA experience).
* Desktop (`window.omnitune?.isDesktop`): mac traffic lights overlay top-left (pad the sidebar's top 40 px), Windows title-bar overlay on the right (pad top bar's right 140 px); make the top bar `-webkit-app-region: drag` with interactive children `no-drag`.

### Mobile — same OmniTune template
* Accent **`#FA2D48`**; system light/dark; SF-style typography (system font), **large collapsing titles**, rounded-square artwork (radius ≈ 8–10), list rows with 56 px art and trailing `•••`.
* Bottom tab bar (translucent blur): **Home · New · Radio · Library · Search**; **mini-player floating above the tab bar**; tap → full-screen modal sheet (drag handle, swipe-down dismiss) with large artwork that scales when paused, scrubber, transport, bottom row for Lyrics / AirPlay-style output / Queue.
* Shared features: heart button on every row & in the player, shuffle/repeat in the player, **swipe row to add to queue**, **long-press context menu** (Play next · Add to queue · Add to playlist · Go to artist/album · Share), Liked Songs, "+" create playlist, filter chips in Library, Made-for-you mixes, "Jump back in", sleep timer, podcast speed, haptics.
