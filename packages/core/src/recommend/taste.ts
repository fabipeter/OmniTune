import type { HistoryEvent, Track } from '../types';

const DAY = 86_400_000;
const HALF_LIFE_DAYS = 30;

export interface TasteProfile {
  /** artistName (lowercase) → affinity score, normalised so the top artist is 1. */
  artists: Map<string, number>;
  /** genre (lowercase) → affinity, top genre is 1. */
  genres: Map<string, number>;
  /** trackId → fraction of recent plays that were skipped (0..1). */
  skipRate: Map<string, number>;
  /** track ids ordered most-recent-first. */
  recentIds: string[];
  likedIds: Set<string>;
  playCounts: Map<string, number>;
  topArtists(n?: number): string[];
  topGenres(n?: number): string[];
  isEmpty: boolean;
}

function normalise(map: Map<string, number>) {
  let max = 0;
  for (const v of map.values()) max = Math.max(max, v);
  if (max <= 0) return new Map<string, number>();
  const out = new Map<string, number>();
  for (const [k, v] of map) if (v > 0) out.set(k, v / max);
  return out;
}

/**
 * Builds an affinity profile from listening history + likes.
 * Signals (OmniTune): completion ratio, skips as negative feedback, likes as strong positive,
 * and exponential time decay so recent taste outweighs old taste.
 */
export function buildTaste(history: HistoryEvent[], liked: Track[] = [], now = Date.now()): TasteProfile {
  const artists = new Map<string, number>();
  const genres = new Map<string, number>();
  const plays = new Map<string, { n: number; skips: number }>();
  const playCounts = new Map<string, number>();

  const sorted = [...history].sort((a, b) => b.playedAt - a.playedAt);
  for (const e of sorted) {
    const ageDays = Math.max(0, (now - e.playedAt) / DAY);
    const decay = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    const ratio = e.track.durationMs ? Math.min(1, e.listenedMs / Math.min(e.track.durationMs, 30_000 * 6)) : e.completed ? 1 : 0.5;
    const signal = e.skipped ? -0.6 : e.completed ? 1 : Math.max(0.2, ratio);
    const a = e.track.artistName.toLowerCase();
    artists.set(a, (artists.get(a) ?? 0) + signal * decay);
    if (e.track.genre) {
      const g = e.track.genre.toLowerCase();
      genres.set(g, (genres.get(g) ?? 0) + signal * decay);
    }
    const p = plays.get(e.track.id) ?? { n: 0, skips: 0 };
    p.n++;
    if (e.skipped) p.skips++;
    plays.set(e.track.id, p);
    if (!e.skipped) playCounts.set(e.track.id, (playCounts.get(e.track.id) ?? 0) + 1);
  }
  for (const t of liked) {
    const a = t.artistName.toLowerCase();
    artists.set(a, (artists.get(a) ?? 0) + 2);
    if (t.genre) genres.set(t.genre.toLowerCase(), (genres.get(t.genre.toLowerCase()) ?? 0) + 1.5);
  }

  const skipRate = new Map<string, number>();
  for (const [id, p] of plays) skipRate.set(id, p.skips / p.n);

  const nArtists = normalise(artists);
  const nGenres = normalise(genres);
  const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);

  return {
    artists: nArtists,
    genres: nGenres,
    skipRate,
    recentIds: sorted.map((e) => e.track.id),
    likedIds: new Set(liked.map((t) => t.id)),
    playCounts,
    topArtists: (n = 5) => top(nArtists, n),
    topGenres: (n = 3) => top(nGenres, n),
    isEmpty: history.length === 0 && liked.length === 0,
  };
}
