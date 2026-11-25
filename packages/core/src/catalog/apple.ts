import type { Album, Artist, Genre, Podcast, SearchResults, SearchType, Track } from '../types';
import { GENRES } from './genres';

/**
 * Apple-backed catalog.
 *
 * Uses Apple's public, key-less iTunes Search/Lookup API and the Apple Marketing Tools RSS charts.
 * Songs come with 30s AAC previews; podcast episodes are full length. Full-length song playback needs
 * MusicKit (see docs/ARCHITECTURE.md) — the Apple catalog song id used here is the same id MusicKit uses.
 */

export interface CatalogProvider {
  search(query: string, opts?: { types?: SearchType[]; limit?: number }): Promise<SearchResults>;
  getTracks(ids: string[]): Promise<Track[]>;
  getAlbum(id: string): Promise<{ album: Album; tracks: Track[] }>;
  getArtist(id: string): Promise<{ artist: Artist; topSongs: Track[]; albums: Album[] }>;
  getArtistArtwork(id: string): Promise<string | undefined>;
  getPodcast(id: string): Promise<{ podcast: Podcast; episodes: Track[] }>;
  getTopSongs(limit?: number): Promise<Track[]>;
  getTopAlbums(limit?: number): Promise<Album[]>;
  getNewReleases(limit?: number): Promise<Album[]>;
  getTopPodcasts(limit?: number): Promise<Podcast[]>;
  getGenres(): Genre[];
  getGenreTracks(genre: Genre, limit?: number): Promise<Track[]>;
}

export interface AppleCatalogOptions {
  country?: string;
  fetch?: typeof fetch;
  /** Override to route through the OmniTune server cache/proxy (avoids rate limits + CORS in locked-down envs). */
  itunesBase?: string;
  rssBase?: string;
  cacheTtlMs?: number;
  maxConcurrent?: number;
}

type Raw = Record<string, any>;

export class AppleCatalog implements CatalogProvider {
  private country: string;
  private fetchImpl: typeof fetch;
  private itunes: string;
  private rss: string;
  private ttl: number;
  private maxConcurrent: number;
  private cache = new Map<string, { at: number; value: Promise<any> }>();
  private active = 0;
  private waiters: Array<() => void> = [];

  constructor(opts: AppleCatalogOptions = {}) {
    this.country = (opts.country ?? 'us').toLowerCase();
    this.fetchImpl = opts.fetch ?? ((...a) => fetch(...a));
    this.itunes = (opts.itunesBase ?? 'https://itunes.apple.com').replace(/\/$/, '');
    this.rss = (opts.rssBase ?? 'https://rss.marketingtools.apple.com').replace(/\/$/, '');
    this.ttl = opts.cacheTtlMs ?? 10 * 60_000;
    this.maxConcurrent = opts.maxConcurrent ?? 4;
  }

  setCountry(country: string) {
    this.country = country.toLowerCase();
  }

  // ---------- transport ----------

  private async slot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) await new Promise<void>((r) => this.waiters.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }

  private getJson<T = Raw>(url: string): Promise<T> {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const isLocalHttp =
      parsedUrl.protocol === 'http:' &&
      (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname === '10.0.2.2');
    if (!isHttps && !isLocalHttp) {
      return Promise.reject(new Error('Catalog URL must use HTTPS'));
    }
    const safeHref = parsedUrl.href;
    const hit = this.cache.get(safeHref);
    if (hit && Date.now() - hit.at < this.ttl) return hit.value;
    const value = this.slot(async () => {
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await this.fetchImpl(safeHref);
          if (res.status === 403 || res.status === 429 || res.status >= 500) {
            lastErr = new Error(`Catalog request failed (${res.status})`);
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
            continue;
          }
          if (!res.ok) throw new Error(`Catalog request failed (${res.status})`);
          // iTunes labels JSON as text/javascript, so parse manually.
          return JSON.parse(await res.text()) as T;
        } catch (e) {
          lastErr = e;
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error('Catalog request failed');
    });
    this.cache.set(safeHref, { at: Date.now(), value });
    value.catch(() => this.cache.delete(safeHref));
    return value;
  }

  private qs(params: Record<string, string | number | undefined>): string {
    return Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
  }

  private async iSearch(params: Record<string, string | number | undefined>): Promise<Raw[]> {
    const data = await this.getJson<{ results: Raw[] }>(`${this.itunes}/search?${this.qs({ country: this.country, ...params })}`);
    return data.results ?? [];
  }

  private async iLookup(params: Record<string, string | number | undefined>): Promise<Raw[]> {
    const data = await this.getJson<{ results: Raw[] }>(`${this.itunes}/lookup?${this.qs({ country: this.country, ...params })}`);
    return data.results ?? [];
  }

  private async chartIds(path: string): Promise<string[]> {
    const data = await this.getJson<{ feed: { results: Raw[] } }>(`${this.rss}/api/v2/${this.country}/${path}.json`);
    return (data.feed?.results ?? []).map((r) => String(r.id));
  }

  // ---------- public API ----------

  async search(query: string, opts: { types?: SearchType[]; limit?: number } = {}): Promise<SearchResults> {
    const q = query.trim();
    const empty: SearchResults = { songs: [], albums: [], artists: [], podcasts: [], episodes: [] };
    if (!q) return empty;
    const types = opts.types ?? ['songs', 'albums', 'artists', 'podcasts'];
    const limit = opts.limit ?? 25;
    const jobs: Promise<void>[] = [];
    const run = (type: SearchType, p: Promise<Raw[]>, map: (r: Raw) => any) =>
      jobs.push(
        p.then(
          (rows) => {
            (empty as any)[type] = rows.map(map).filter(Boolean);
          },
          () => undefined,
        ),
      );
    if (types.includes('songs')) run('songs', this.iSearch({ term: q, media: 'music', entity: 'song', limit }), mapSong);
    if (types.includes('albums')) run('albums', this.iSearch({ term: q, media: 'music', entity: 'album', limit }), mapAlbum);
    if (types.includes('artists')) run('artists', this.iSearch({ term: q, media: 'music', entity: 'musicArtist', limit: Math.min(limit, 12) }), mapArtist);
    if (types.includes('podcasts')) run('podcasts', this.iSearch({ term: q, media: 'podcast', entity: 'podcast', limit: Math.min(limit, 15) }), mapPodcast);
    if (types.includes('episodes')) run('episodes', this.iSearch({ term: q, media: 'podcast', entity: 'podcastEpisode', limit }), mapEpisode);
    await Promise.all(jobs);
    return empty;
  }

  async getTracks(ids: string[]): Promise<Track[]> {
    if (!ids.length) return [];
    const out: Track[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const rows = await this.iLookup({ id: ids.slice(i, i + 100).join(','), entity: 'song' });
      out.push(...rows.filter((r) => r.wrapperType === 'track').map(mapSong).filter((t): t is Track => !!t));
    }
    const byId = new Map(out.map((t) => [t.id, t]));
    return ids.map((id) => byId.get(id)).filter((t): t is Track => !!t);
  }

  async getAlbum(id: string) {
    const rows = await this.iLookup({ id, entity: 'song', limit: 200 });
    const head = rows.find((r) => r.wrapperType === 'collection');
    if (!head) throw new Error('Album not found');
    const tracks = rows
      .filter((r) => r.wrapperType === 'track' && r.kind === 'song')
      .map(mapSong)
      .filter((t): t is Track => !!t)
      .sort((a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
    return { album: mapAlbum(head)!, tracks };
  }

  async getArtist(id: string) {
    const [songRows, albumRows] = await Promise.all([
      this.iLookup({ id, entity: 'song', limit: 25 }),
      this.iLookup({ id, entity: 'album', limit: 60 }),
    ]);
    const head = songRows.find((r) => r.wrapperType === 'artist') ?? albumRows.find((r) => r.wrapperType === 'artist');
    if (!head) throw new Error('Artist not found');
    const topSongs = songRows.filter((r) => r.wrapperType === 'track').map(mapSong).filter((t): t is Track => !!t);
    const albums = albumRows.filter((r) => r.wrapperType === 'collection').map(mapAlbum).filter((a): a is Album => !!a);
    albums.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
    const artist = mapArtist(head)!;
    artist.artworkUrl = albums[0]?.artworkUrl ?? topSongs[0]?.artworkUrl;
    return { artist, topSongs, albums };
  }

  async getArtistArtwork(id: string): Promise<string | undefined> {
    try {
      const rows = await this.iLookup({ id, entity: 'album', limit: 1 });
      return rows.find((r) => r.wrapperType === 'collection')?.artworkUrl100;
    } catch {
      return undefined;
    }
  }

  async getPodcast(id: string) {
    const rows = await this.iLookup({ id, media: 'podcast', entity: 'podcastEpisode', limit: 200 });
    let head: Raw | undefined = rows.find((r) => r.kind === 'podcast');
    if (!head) head = (await this.iLookup({ id, media: 'podcast' }))[0];
    if (!head) throw new Error('Podcast not found');
    const episodes = rows.filter((r) => r.kind === 'podcast-episode').map(mapEpisode).filter((t): t is Track => !!t);
    return { podcast: mapPodcast(head)!, episodes };
  }

  async getTopSongs(limit = 30): Promise<Track[]> {
    try {
      return await this.getTracks(await this.chartIds(`music/most-played/${limit}/songs`));
    } catch {
      return (await this.search('top hits', { types: ['songs'], limit })).songs;
    }
  }

  async getTopAlbums(limit = 20): Promise<Album[]> {
    return this.albumsByIds(`music/most-played/${limit}/albums`).catch(async () => (await this.search('top albums', { types: ['albums'], limit })).albums);
  }

  async getNewReleases(limit = 20): Promise<Album[]> {
    return this.albumsByIds(`music/new-releases/${limit}/albums`).catch(async () => (await this.search('new music friday', { types: ['albums'], limit })).albums);
  }

  async getTopPodcasts(limit = 20): Promise<Podcast[]> {
    try {
      const ids = await this.chartIds(`podcasts/top/${limit}/podcasts`);
      const rows = await this.iLookup({ id: ids.join(','), media: 'podcast' });
      return rows.map(mapPodcast).filter((p): p is Podcast => !!p);
    } catch {
      return (await this.search('popular podcasts', { types: ['podcasts'], limit })).podcasts;
    }
  }

  getGenres(): Genre[] {
    return GENRES;
  }

  async getGenreTracks(genre: Genre, limit = 50): Promise<Track[]> {
    return (await this.search(genre.term, { types: ['songs'], limit })).songs;
  }

  private async albumsByIds(path: string): Promise<Album[]> {
    const ids = await this.chartIds(path);
    const rows = await this.iLookup({ id: ids.join(','), entity: 'album' });
    const byId = new Map(rows.filter((r) => r.wrapperType === 'collection').map((r) => [String(r.collectionId), mapAlbum(r)!]));
    return ids.map((i) => byId.get(i)).filter((a): a is Album => !!a);
  }
}

// ---------- mappers ----------

export function mapSong(r: Raw): Track | null {
  if (!r || (r.kind !== 'song' && r.wrapperType !== 'track') || r.kind === 'podcast' || r.kind === 'podcast-episode') return null;
  return {
    id: String(r.trackId),
    kind: 'song',
    title: r.trackName,
    artistName: r.artistName,
    artistId: r.artistId != null ? String(r.artistId) : undefined,
    albumName: r.collectionName,
    albumId: r.collectionId != null ? String(r.collectionId) : undefined,
    artworkUrl: r.artworkUrl100 ?? r.artworkUrl60 ?? '',
    durationMs: r.trackTimeMillis ?? 30_000,
    audioUrl: r.previewUrl,
    isPreview: true,
    genre: r.primaryGenreName,
    releaseDate: r.releaseDate,
    explicit: r.trackExplicitness === 'explicit',
    trackNumber: r.trackNumber,
    discNumber: r.discNumber,
    storeUrl: r.trackViewUrl,
  };
}

export function mapAlbum(r: Raw): Album | null {
  if (!r || r.collectionId == null || r.wrapperType === 'track') return null;
  return {
    id: String(r.collectionId),
    title: r.collectionName,
    artistName: r.artistName,
    artistId: r.artistId != null ? String(r.artistId) : undefined,
    artworkUrl: r.artworkUrl100 ?? r.artworkUrl60 ?? '',
    releaseDate: r.releaseDate,
    genre: r.primaryGenreName,
    trackCount: r.trackCount,
    explicit: r.collectionExplicitness === 'explicit',
    storeUrl: r.collectionViewUrl,
  };
}

export function mapArtist(r: Raw): Artist | null {
  if (!r || r.artistId == null) return null;
  return { id: String(r.artistId), name: r.artistName, genre: r.primaryGenreName, storeUrl: r.artistLinkUrl };
}

export function mapPodcast(r: Raw): Podcast | null {
  if (!r || r.collectionId == null) return null;
  return {
    id: String(r.collectionId),
    title: r.collectionName,
    author: r.artistName,
    artworkUrl: r.artworkUrl600 ?? r.artworkUrl100 ?? '',
    feedUrl: r.feedUrl,
    genre: r.primaryGenreName,
    episodeCount: r.trackCount,
    storeUrl: r.collectionViewUrl,
  };
}

export function mapEpisode(r: Raw): Track | null {
  if (!r || !r.trackId) return null;
  return {
    id: String(r.trackId),
    kind: 'episode',
    title: r.trackName,
    artistName: r.collectionName,
    podcastId: r.collectionId != null ? String(r.collectionId) : undefined,
    artworkUrl: r.artworkUrl160 ?? r.artworkUrl600 ?? r.artworkUrl100 ?? '',
    durationMs: r.trackTimeMillis ?? 0,
    audioUrl: r.episodeUrl,
    isPreview: false,
    releaseDate: r.releaseDate,
    description: r.description ?? r.shortDescription,
    genre: r.genres?.[0]?.name,
    storeUrl: r.trackViewUrl,
  };
}
