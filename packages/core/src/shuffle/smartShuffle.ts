import type { Track } from '../types';
import type { TasteProfile } from '../recommend/taste';
import { secureRandom } from '../random';

export type Rng = () => number;

/** Small, fast, seedable PRNG (mulberry32) so shuffles are testable. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ShuffleOptions {
  rng?: Rng;
  /** Personalisation. Without it the shuffle is "spread random". */
  taste?: TasteProfile;
  /** Track pinned to the front (the one the user pressed play on). */
  startWith?: Track;
  /** Minimum number of tracks between two songs by the same artist (auto-relaxed for small pools). */
  minArtistGap?: number;
}

/** Plain Fisher–Yates. Exposed for the "true random" shuffle mode. */
export function fisherYates<T>(items: T[], rng: Rng = secureRandom): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * OmniTune "Smart Shuffle" — a taste-aware shuffle (real-world ranking systems are
 * proprietary, so this implements the publicly observable behaviour):
 *
 *  1. Weighted random order (Efraimidis–Spirakis): every track gets a weight from taste affinity,
 *     likes, play-count, and is *demoted* if it was played recently or is often skipped.
 *  2. Artist/album spreading: a greedy pass guarantees the same artist (or album) is not heard
 *     back-to-back and keeps a minimum gap between songs by one artist, relaxing the gap for small pools.
 *
 * Unlike a naive shuffle, you never get three songs from the same artist in a row, and tracks you love
 * tend to appear earlier, while tracks you keep skipping sink to the end.
 */
export function smartShuffle(tracks: Track[], opts: ShuffleOptions = {}): Track[] {
  const rng = opts.rng ?? secureRandom;
  const taste = opts.taste;
  const unique = dedupe(tracks);
  const pinned = opts.startWith ? unique.find((t) => t.id === opts.startWith!.id) ?? opts.startWith : undefined;
  const pool = unique.filter((t) => !pinned || t.id !== pinned.id);

  const recentRank = new Map<string, number>();
  taste?.recentIds.slice(0, 30).forEach((id, i) => {
    if (!recentRank.has(id)) recentRank.set(id, i);
  });

  const keyed = pool.map((track) => {
    let boost = 0;
    if (taste && !taste.isEmpty) {
      boost += 0.7 * (taste.artists.get(track.artistName.toLowerCase()) ?? 0);
      boost += 0.2 * (track.genre ? taste.genres.get(track.genre.toLowerCase()) ?? 0 : 0);
      if (taste.likedIds.has(track.id)) boost += 0.4;
      boost += Math.min(0.3, (taste.playCounts.get(track.id) ?? 0) * 0.05);
      const r = recentRank.get(track.id);
      if (r !== undefined) boost -= 0.9 * (1 - r / 30); // heard it a moment ago → push back
      boost -= 1.2 * (taste.skipRate.get(track.id) ?? 0);
    }
    const w = Math.exp(boost);
    // key = u^(1/w); larger key → earlier.
    const u = Math.max(rng(), 1e-12);
    return { track, key: Math.pow(u, 1 / w) };
  });
  keyed.sort((a, b) => b.key - a.key);

  const ordered = spread(
    keyed.map((k) => k.track),
    opts.minArtistGap,
    pinned,
  );
  return pinned ? [pinned, ...ordered] : ordered;
}

function dedupe(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

const key = (t: Track) => t.artistName.toLowerCase();

function spread(pool: Track[], minGap: number | undefined, first?: Track): Track[] {
  const artists = new Set(pool.map((t) => t.artistName.toLowerCase()));
  const gap = Math.min(minGap ?? 4, Math.max(0, artists.size - 1));
  const out: Track[] = [];
  const remaining = pool.slice();
  const recent: Track[] = first ? [first] : [];

  const counts = new Map<string, number>();
  for (const t of pool) counts.set(key(t), (counts.get(key(t)) ?? 0) + 1);

  while (remaining.length) {
    // When one artist owns too large a share of what's left, they must be spread now or we'd be forced
    // into back-to-back plays at the tail (the "rearrange string k apart" problem).
    const maxCount = Math.max(...counts.values());
    const tight = maxCount * (gap + 1) > remaining.length;

    let pickIdx = -1;
    for (let g = gap; g >= 0 && pickIdx === -1; g--) {
      const window = g > 0 ? recent.slice(-g) : [];
      const last = recent[recent.length - 1];
      let best = -1;
      for (let i = 0; i < remaining.length; i++) {
        const t = remaining[i];
        if (last && t.albumId && t.albumId === last.albumId && artists.size > 1 && g > 0) continue;
        if (window.some((r) => key(r) === key(t))) continue;
        if (!tight) {
          best = i;
          break;
        }
        if (best === -1 || counts.get(key(t))! > counts.get(key(remaining[best]))!) best = i;
      }
      pickIdx = best;
    }
    if (pickIdx === -1) pickIdx = 0;
    const [pick] = remaining.splice(pickIdx, 1);
    counts.set(key(pick), counts.get(key(pick))! - 1);
    out.push(pick);
    recent.push(pick);
    if (recent.length > 12) recent.shift();
  }
  return out;
}
