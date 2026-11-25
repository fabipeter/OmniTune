import type { LyricLine, Lyrics, Track } from '../types';

const LRCLIB = 'https://lrclib.net/api';

/** Parse LRC text ("[01:23.45] line") into sorted timed lines. */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0;
      lines.push({ timeMs: Number(m[1]) * 60_000 + Number(m[2]) * 1000 + frac, text });
    }
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

/** Index of the line being sung at `positionMs`, or -1 before the first line. */
export function activeLyricIndex(lines: LyricLine[], positionMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= positionMs) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function toLyrics(r: any): Lyrics {
  return {
    synced: r?.syncedLyrics ? parseLrc(r.syncedLyrics) : null,
    plain: r?.plainLyrics ?? null,
    instrumental: !!r?.instrumental,
  };
}

/** Fetch lyrics (synced when available) from LRCLIB — free, key-less. */
export async function fetchLyrics(track: Track, fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<Lyrics | null> {
  if (track.kind !== 'song') return null;
  const params = new URLSearchParams({ artist_name: track.artistName, track_name: track.title });
  if (track.albumName) params.set('album_name', track.albumName);
  const dur = track.durationMs ? Math.round(track.durationMs / 1000) : 0;
  if (dur) params.set('duration', String(dur));
  try {
    let res = await fetchImpl(`${LRCLIB}/get?${params}`);
    if (res.ok) return toLyrics(await res.json());
    // Fall back to fuzzy search.
    res = await fetchImpl(`${LRCLIB}/search?${new URLSearchParams({ track_name: track.title, artist_name: track.artistName })}`);
    if (!res.ok) return null;
    const list = (await res.json()) as any[];
    const best = list.find((x) => x.syncedLyrics) ?? list[0];
    return best ? toLyrics(best) : null;
  } catch {
    return null;
  }
}
