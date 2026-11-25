import type { CatalogProvider } from '../catalog/apple';
import { GENRES, findGenre } from '../catalog/genres';
import { smartShuffle, type Rng } from '../shuffle/smartShuffle';
import type { Mix, Track } from '../types';
import { colorFromString } from '../artwork';
import { secureRandom } from '../random';
import type { TasteProfile } from './taste';

export interface RadioOptions {
  limit?: number;
  rng?: Rng;
  explicitFilter?: boolean;
}

/**
 * Radio / Autoplay — OmniTune "endless queue" seeded by a track.
 * Candidate pool = seed artist's catalogue + same-genre songs + songs by artists you already love,
 * ranked by taste affinity with a novelty bonus (unplayed > played), then spread so no artist repeats.
 * Apple's public API has no "similar artists" endpoint, so genre + your own taste graph stands in for it.
 */
export async function buildRadio(seed: Track, catalog: CatalogProvider, taste?: TasteProfile, opts: RadioOptions = {}): Promise<Track[]> {
  const limit = opts.limit ?? 40;
  if (seed.kind === 'episode') {
    if (!seed.podcastId) return [];
    const { episodes } = await catalog.getPodcast(seed.podcastId).catch(() => ({ episodes: [] as Track[] }));
    return episodes.filter((e) => e.id !== seed.id && (e.releaseDate ?? '') < (seed.releaseDate ?? '9')).slice(0, limit);
  }

  const jobs: Promise<Track[]>[] = [];
  if (seed.artistId) jobs.push(catalog.getArtist(seed.artistId).then((r) => r.topSongs).catch(() => []));
  const genre = seed.genre ? findGenre(seed.genre) ?? GENRES.find((g) => g.term.includes(seed.genre!.toLowerCase().split(/[ /&]/)[0])) : undefined;
  if (genre) jobs.push(catalog.getGenreTracks(genre, 40).catch(() => []));
  else if (seed.genre) jobs.push(catalog.search(seed.genre, { types: ['songs'], limit: 40 }).then((r) => r.songs).catch(() => []));
  for (const a of taste?.topArtists(2) ?? []) {
    if (a !== seed.artistName.toLowerCase()) jobs.push(catalog.search(a, { types: ['songs'], limit: 15 }).then((r) => r.songs).catch(() => []));
  }
  const pools = await Promise.all(jobs);
  const seen = new Set<string>([seed.id]);
  const candidates: Track[] = [];
  for (const t of pools.flat()) {
    if (seen.has(t.id) || t.kind !== 'song' || !t.audioUrl) continue;
    if (opts.explicitFilter && t.explicit) continue;
    seen.add(t.id);
    candidates.push(t);
  }

  const score = (t: Track) => {
    let s = 0;
    if (t.artistId && t.artistId === seed.artistId) s += 0.8;
    if (t.genre && t.genre === seed.genre) s += 0.6;
    if (taste) {
      s += 0.8 * (taste.artists.get(t.artistName.toLowerCase()) ?? 0);
      if (taste.likedIds.has(t.id)) s += 0.3;
      const recent = taste.recentIds.indexOf(t.id);
      if (recent >= 0 && recent < 50) s -= 0.7; // novelty
      else if (!taste.playCounts.has(t.id)) s += 0.25;
      s -= 1.0 * (taste.skipRate.get(t.id) ?? 0);
    }
    return s + (opts.rng ?? secureRandom)() * 0.6;
  };
  const ranked = candidates.sort((a, b) => score(b) - score(a)).slice(0, limit * 2);
  return smartShuffle(ranked, { rng: opts.rng, minArtistGap: 3 }).slice(0, limit);
}

function mosaic(tracks: Track[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tracks) {
    if (t.artworkUrl && !seen.has(t.artworkUrl)) {
      seen.add(t.artworkUrl);
      out.push(t.artworkUrl);
    }
    if (out.length === 4) break;
  }
  return out;
}

function makeMix(id: string, name: string, description: string, tracks: Track[]): Mix {
  return { id, name, description, tracks, artwork: mosaic(tracks), color: colorFromString(id, 60, 32) };
}

/**
 * "Made for you" mixes, generated entirely on-device from listening history:
 *  - Daily Mix N: one per top genre, blending your favourite artists in that genre with fresh songs
 *  - Discover Mix: songs in your genres by artists you haven't played yet
 *  - On Repeat: your most-played songs lately
 * Falls back to genre mixes from the global charts for brand-new users.
 */
export async function buildMixes(
  catalog: CatalogProvider,
  taste: TasteProfile,
  history: Track[],
  opts: { rng?: Rng; explicitFilter?: boolean } = {},
): Promise<Mix[]> {
  const ok = (t: Track) => t.kind === 'song' && !!t.audioUrl && !(opts.explicitFilter && t.explicit);
  const mixes: Mix[] = [];

  if (!taste.isEmpty) {
    const counts = [...taste.playCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
    const byId = new Map(history.map((t) => [t.id, t]));
    const onRepeat = counts.map(([id]) => byId.get(id)).filter((t): t is Track => !!t && ok(t));
    if (onRepeat.length >= 5) mixes.push(makeMix('on-repeat', 'On Repeat', 'Songs you can’t stop playing', smartShuffle(onRepeat, { rng: opts.rng })));

    const genres = taste.topGenres(3);
    const artists = taste.topArtists(6);
    await Promise.all(
      genres.map(async (g, i) => {
        const genre = findGenre(g) ?? GENRES.find((x) => x.term.toLowerCase().includes(g.split(/[ /&]/)[0])) ;
        const [fresh, fav] = await Promise.all([
          genre ? catalog.getGenreTracks(genre, 40).catch(() => []) : catalog.search(g, { types: ['songs'], limit: 40 }).then((r) => r.songs).catch(() => []),
          Promise.all(artists.slice(i, i + 2).map((a) => catalog.search(a, { types: ['songs'], limit: 10 }).then((r) => r.songs).catch(() => []))),
        ]);
        const tracks = smartShuffle([...fav.flat(), ...fresh].filter(ok), { taste, rng: opts.rng }).slice(0, 40);
        if (tracks.length >= 8) {
          const names = [...new Set(tracks.map((t) => t.artistName))].slice(0, 3).join(', ');
          mixes.push(makeMix(`daily-${i + 1}`, `Daily Mix ${i + 1}`, `${names} and more`, tracks));
        }
      }),
    );
    mixes.sort((a, b) => a.id.localeCompare(b.id));

    const played = new Set(history.map((t) => t.artistName.toLowerCase()));
    const discover = (await Promise.all(genres.map((g) => catalog.search(g, { types: ['songs'], limit: 40 }).then((r) => r.songs).catch(() => []))))
      .flat()
      .filter((t) => ok(t) && !played.has(t.artistName.toLowerCase()));
    if (discover.length >= 8) mixes.push(makeMix('discover', 'Discover Mix', 'Fresh artists in the genres you love', smartShuffle(discover, { rng: opts.rng }).slice(0, 30)));
  } else {
    const picks = [GENRES[0], GENRES[1], GENRES[4], GENRES[7]];
    await Promise.all(
      picks.map(async (g, i) => {
        const tracks = (await catalog.getGenreTracks(g, 40).catch(() => [])).filter(ok);
        if (tracks.length >= 8) mixes.push(makeMix(`starter-${i + 1}`, `${g.name} Mix`, `Start here: the best of ${g.name}`, smartShuffle(tracks, { rng: opts.rng }).slice(0, 30)));
      }),
    );
    mixes.sort((a, b) => a.id.localeCompare(b.id));
  }
  return mixes;
}
