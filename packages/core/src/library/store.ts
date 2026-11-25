import {
  DEFAULT_SETTINGS,
  type Album,
  type Artist,
  type HistoryEvent,
  type Playlist,
  type Podcast,
  type Settings,
  type Track,
} from '../types';
import { buildTaste, type TasteProfile } from '../recommend/taste';
import { secureId } from '../random';

export interface KeyValueStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem?(key: string): void | Promise<void>;
}

export class MemoryStorage implements KeyValueStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

export const COLLECTIONS = [
  'likedTracks',
  'savedAlbums',
  'followedArtists',
  'followedPodcasts',
  'playlists',
  'history',
  'episodeProgress',
  'settings',
] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

/** Unit of sync: last-write-wins per (collection, id), deletes are tombstones. */
export interface Entry<T = unknown> {
  id: string;
  value: T;
  updatedAt: number;
  deleted?: boolean;
}
export type EntryMap = Partial<Record<CollectionName, Entry[]>>;
type Data = Record<CollectionName, Record<string, Entry>>;

export interface LibrarySnapshot {
  /** Bumps on every change; use as a React/Svelte dependency. */
  version: number;
}

const HISTORY_CAP = 3000;

export function uid(prefix = ''): string {
  return secureId(prefix);
}

/**
 * Local-first library: liked songs, saved albums, followed artists/podcasts, playlists, listening history,
 * podcast progress and settings. Persists to any key-value storage and merges with the server via `SyncClient`.
 */
export class LibraryStore {
  private data: Data = emptyData();
  private listeners = new Set<() => void>();
  private snapshot: LibrarySnapshot = { version: 0 };
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private tasteCache: { version: number; taste: TasteProfile } | null = null;
  ready: Promise<void>;

  constructor(
    private storage: KeyValueStorage,
    private key = 'omnitune.library.v1',
  ) {
    this.ready = this.load();
  }

  // ---------- subscription (works with useSyncExternalStore) ----------
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  getSnapshot = () => this.snapshot;

  private emit(persist = true) {
    this.snapshot = { version: this.snapshot.version + 1 };
    if (persist) this.scheduleSave();
    this.listeners.forEach((l) => l());
  }

  private async load() {
    try {
      const raw = await this.storage.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Data>;
        for (const c of COLLECTIONS) this.data[c] = parsed[c] ?? {};
      }
    } catch {
      /* corrupted → start fresh */
    }
    this.emit(false);
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), 250);
  }

  async flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    await this.storage.setItem(this.key, JSON.stringify(this.data));
  }

  // ---------- generic ----------
  private put<T>(c: CollectionName, id: string, value: T, at = Date.now()) {
    this.data[c][id] = { id, value, updatedAt: at };
  }
  private del(c: CollectionName, id: string, at = Date.now()) {
    const prev = this.data[c][id];
    this.data[c][id] = { id, value: prev?.value ?? null, updatedAt: at, deleted: true };
  }
  private list<T>(c: CollectionName): Entry<T>[] {
    return Object.values(this.data[c]).filter((e) => !e.deleted) as Entry<T>[];
  }
  private has(c: CollectionName, id: string) {
    const e = this.data[c][id];
    return !!e && !e.deleted;
  }

  // ---------- liked songs ----------
  isLiked = (trackId: string) => this.has('likedTracks', trackId);
  likedTracks(): Track[] {
    return this.list<Track>('likedTracks')
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((e) => e.value);
  }
  /** @returns the new liked state */
  toggleLike(track: Track): boolean {
    const liked = !this.isLiked(track.id);
    liked ? this.put('likedTracks', track.id, track) : this.del('likedTracks', track.id);
    this.emit();
    return liked;
  }
  setLiked(track: Track, liked: boolean) {
    if (this.isLiked(track.id) !== liked) this.toggleLike(track);
  }

  // ---------- albums / artists / podcasts ----------
  isAlbumSaved = (id: string) => this.has('savedAlbums', id);
  savedAlbums = (): Album[] => this.list<Album>('savedAlbums').sort((a, b) => b.updatedAt - a.updatedAt).map((e) => e.value);
  toggleAlbum(album: Album) {
    this.isAlbumSaved(album.id) ? this.del('savedAlbums', album.id) : this.put('savedAlbums', album.id, album);
    this.emit();
  }

  isArtistFollowed = (id: string) => this.has('followedArtists', id);
  followedArtists = (): Artist[] => this.list<Artist>('followedArtists').sort((a, b) => b.updatedAt - a.updatedAt).map((e) => e.value);
  toggleArtist(artist: Artist) {
    this.isArtistFollowed(artist.id) ? this.del('followedArtists', artist.id) : this.put('followedArtists', artist.id, artist);
    this.emit();
  }

  isPodcastFollowed = (id: string) => this.has('followedPodcasts', id);
  followedPodcasts = (): Podcast[] => this.list<Podcast>('followedPodcasts').sort((a, b) => b.updatedAt - a.updatedAt).map((e) => e.value);
  togglePodcast(p: Podcast) {
    this.isPodcastFollowed(p.id) ? this.del('followedPodcasts', p.id) : this.put('followedPodcasts', p.id, p);
    this.emit();
  }

  // ---------- playlists ----------
  playlists = (): Playlist[] =>
    this.list<Playlist>('playlists')
      .map((e) => e.value)
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
  getPlaylist = (id: string): Playlist | undefined => (this.has('playlists', id) ? (this.data.playlists[id].value as Playlist) : undefined);

  createPlaylist(name: string, tracks: Track[] = [], description?: string): Playlist {
    const now = Date.now();
    const p: Playlist = { id: uid('pl_'), name: name.trim() || 'New playlist', description, tracks: dedupeTracks(tracks), createdAt: now, updatedAt: now };
    this.put('playlists', p.id, p, now);
    this.emit();
    return p;
  }
  private updatePlaylist(id: string, fn: (p: Playlist) => Playlist) {
    const p = this.getPlaylist(id);
    if (!p) return;
    const now = Date.now();
    this.put('playlists', id, { ...fn(p), updatedAt: now }, now);
    this.emit();
  }
  renamePlaylist(id: string, name: string, description?: string) {
    this.updatePlaylist(id, (p) => ({ ...p, name: name.trim() || p.name, description: description ?? p.description }));
  }
  pinPlaylist(id: string, pinned: boolean) {
    this.updatePlaylist(id, (p) => ({ ...p, pinned }));
  }
  deletePlaylist(id: string) {
    this.del('playlists', id);
    this.emit();
  }
  addToPlaylist(id: string, tracks: Track[]) {
    this.updatePlaylist(id, (p) => ({ ...p, tracks: dedupeTracks([...p.tracks, ...tracks]) }));
  }
  removeFromPlaylist(id: string, trackId: string) {
    this.updatePlaylist(id, (p) => ({ ...p, tracks: p.tracks.filter((t) => t.id !== trackId) }));
  }
  moveInPlaylist(id: string, from: number, to: number) {
    this.updatePlaylist(id, (p) => {
      const t = p.tracks.slice();
      const [m] = t.splice(from, 1);
      if (m) t.splice(to, 0, m);
      return { ...p, tracks: t };
    });
  }

  // ---------- history ----------
  recordPlay(e: Omit<HistoryEvent, 'id'>) {
    const id = `${e.playedAt}-${e.track.id}`;
    this.put('history', id, { ...e, id }, e.playedAt);
    const ids = Object.keys(this.data.history);
    if (ids.length > HISTORY_CAP) {
      ids
        .sort((a, b) => this.data.history[a].updatedAt - this.data.history[b].updatedAt)
        .slice(0, ids.length - HISTORY_CAP)
        .forEach((k) => delete this.data.history[k]);
    }
    this.emit();
  }
  history(): HistoryEvent[] {
    return this.list<HistoryEvent>('history')
      .map((e) => e.value)
      .sort((a, b) => b.playedAt - a.playedAt);
  }
  /** Distinct recently played tracks, newest first. */
  recentlyPlayed(limit = 20): Track[] {
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const e of this.history()) {
      if (e.skipped || seen.has(e.track.id)) continue;
      seen.add(e.track.id);
      out.push(e.track);
      if (out.length >= limit) break;
    }
    return out;
  }
  clearHistory() {
    for (const id of Object.keys(this.data.history)) this.del('history', id);
    this.emit();
  }
  taste(): TasteProfile {
    if (this.tasteCache?.version === this.snapshot.version) return this.tasteCache.taste;
    const taste = buildTaste(this.history(), this.likedTracks());
    this.tasteCache = { version: this.snapshot.version, taste };
    return taste;
  }

  // ---------- podcast progress ----------
  episodeProgress = (episodeId: string): number => (this.data.episodeProgress[episodeId]?.value as number | undefined) ?? 0;
  setEpisodeProgress(episodeId: string, ms: number) {
    this.put('episodeProgress', episodeId, Math.floor(ms));
    this.emit();
  }

  // ---------- settings ----------
  getSettings(): Settings {
    const saved = (this.data.settings.main?.value as Partial<Settings> | undefined) ?? {};
    return { ...DEFAULT_SETTINGS, ...saved, eq: { ...DEFAULT_SETTINGS.eq, ...(saved.eq ?? {}) } };
  }
  updateSettings(patch: Partial<Settings>) {
    this.put('settings', 'main', { ...(this.data.settings.main?.value as object), ...patch });
    this.emit();
  }

  // ---------- sync ----------
  entriesSince(since: number): EntryMap {
    const out: EntryMap = {};
    for (const c of COLLECTIONS) {
      const rows = Object.values(this.data[c]).filter((e) => e.updatedAt > since);
      if (rows.length) out[c] = rows;
    }
    return out;
  }
  /** Merge remote entries (last-write-wins). Returns number of local changes. */
  mergeRemote(remote: EntryMap): number {
    let changed = 0;
    for (const c of COLLECTIONS) {
      for (const e of remote[c] ?? []) {
        const mine = this.data[c][e.id];
        if (!mine || mine.updatedAt < e.updatedAt) {
          this.data[c][e.id] = e;
          changed++;
        }
      }
    }
    if (changed) this.emit();
    return changed;
  }
  /** Wipe all local data (used on sign-out when the user asks for it). */
  reset() {
    this.data = emptyData();
    this.emit();
  }
}

function emptyData(): Data {
  return Object.fromEntries(COLLECTIONS.map((c) => [c, {}])) as unknown as Data;
}

function dedupeTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}
