/** Shared domain types for every OmniTune client (web, desktop, mobile) and the sync server. */

export type TrackKind = 'song' | 'episode';

export interface Track {
  /** Apple catalog id (songs) or Apple Podcasts episode id. */
  id: string;
  kind: TrackKind;
  title: string;
  /** For episodes this is the podcast (show) title. */
  artistName: string;
  artistId?: string;
  albumName?: string;
  albumId?: string;
  podcastId?: string;
  /** 100x100 Apple artwork URL. Use `artworkAt()` to get any size. */
  artworkUrl: string;
  durationMs: number;
  /** Playable URL. 30s AAC preview for songs (unless MusicKit is linked), full audio for episodes. */
  audioUrl?: string;
  /** True when `audioUrl` is a 30 second preview rather than the full track. */
  isPreview: boolean;
  genre?: string;
  releaseDate?: string;
  explicit?: boolean;
  trackNumber?: number;
  discNumber?: number;
  storeUrl?: string;
  description?: string;
}

export interface Album {
  id: string;
  title: string;
  artistName: string;
  artistId?: string;
  artworkUrl: string;
  releaseDate?: string;
  genre?: string;
  trackCount?: number;
  explicit?: boolean;
  storeUrl?: string;
}

export interface Artist {
  id: string;
  name: string;
  genre?: string;
  storeUrl?: string;
  /** Apple's public API has no artist photos; this is the artwork of their top release. */
  artworkUrl?: string;
}

export interface Podcast {
  id: string;
  title: string;
  author: string;
  artworkUrl: string;
  feedUrl?: string;
  genre?: string;
  episodeCount?: number;
  storeUrl?: string;
}

export interface Genre {
  id: string;
  name: string;
  color: string;
  /** Search term used to browse the genre. */
  term: string;
}

export interface SearchResults {
  songs: Track[];
  albums: Album[];
  artists: Artist[];
  podcasts: Podcast[];
  episodes: Track[];
}

export type SearchType = keyof SearchResults;

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  tracks: Track[];
  coverUrl?: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** A generated mix ("Daily Mix", "Discover", ...) — OmniTune personalised radio. */
export interface Mix {
  id: string;
  name: string;
  description: string;
  tracks: Track[];
  /** Up to four artwork URLs that clients can render as a mosaic. */
  artwork: string[];
  color: string;
}

export type ShelfItem =
  | { type: 'track'; track: Track }
  | { type: 'album'; album: Album }
  | { type: 'artist'; artist: Artist }
  | { type: 'podcast'; podcast: Podcast }
  | { type: 'mix'; mix: Mix }
  | { type: 'playlist'; playlist: Playlist };

export interface HomeShelf {
  id: string;
  title: string;
  subtitle?: string;
  items: ShelfItem[];
}

export interface HistoryEvent {
  id: string;
  track: Track;
  playedAt: number;
  listenedMs: number;
  completed: boolean;
  skipped: boolean;
  contextType?: string;
  contextId?: string;
}

export type AudioQuality = 'auto' | 'high' | 'lossless';
export type ShuffleMode = 'smart' | 'random';

export interface EqSettings {
  enabled: boolean;
  preset: string;
  /** Gain in dB for [60, 170, 310, 600, 1k, 3k, 6k, 12k, 14k, 16k] Hz. */
  gains: number[];
}

export interface Settings {
  country: string;
  audioQuality: AudioQuality;
  crossfadeMs: number;
  gapless: boolean;
  normalizeVolume: boolean;
  autoplay: boolean;
  shuffleMode: ShuffleMode;
  explicitFilter: boolean;
  theme: 'dark' | 'light' | 'system';
  showLyrics: boolean;
  eq: EqSettings;
}

export const EQ_BANDS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000] as const;

export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Booster': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'Treble Booster': [0, 0, 0, 0, 0, 1, 3, 5, 6, 6],
  Acoustic: [4, 4, 3, 1, 1, 1, 3, 3, 3, 2],
  Electronic: [5, 4, 1, 0, -2, 2, 1, 3, 4, 5],
  'Hip-Hop': [5, 4, 1, 3, -1, -1, 1, -1, 2, 3],
  Jazz: [3, 2, 1, 2, -2, -2, 0, 1, 2, 3],
  Classical: [4, 3, 3, 2, -1, -1, 0, 2, 3, 3],
  'Vocal Booster': [-2, -3, -3, 1, 4, 4, 3, 1, 0, -1],
  Loudness: [6, 4, 0, 0, -1, 0, -1, -4, 5, 1],
};

export const DEFAULT_SETTINGS: Settings = {
  country: 'us',
  audioQuality: 'auto',
  crossfadeMs: 0,
  gapless: true,
  normalizeVolume: true,
  autoplay: true,
  shuffleMode: 'smart',
  explicitFilter: false,
  theme: 'dark',
  showLyrics: true,
  eq: { enabled: false, preset: 'Flat', gains: EQ_PRESETS.Flat },
};

export interface LyricLine {
  timeMs: number;
  text: string;
}

export interface Lyrics {
  synced: LyricLine[] | null;
  plain: string | null;
  instrumental: boolean;
}
