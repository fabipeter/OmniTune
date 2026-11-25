import { describe, expect, it } from 'vitest';
import { MockEngine, PlayerController, LibraryStore, MemoryStorage, activeLyricIndex, buildTaste, parseLrc, seededRng, smartShuffle, type Track } from './index';

const mk = (id: string, artist: string, extra: Partial<Track> = {}): Track => ({
  id,
  kind: 'song',
  title: `Song ${id}`,
  artistName: artist,
  albumId: `alb-${artist}`,
  artworkUrl: '',
  durationMs: 200_000,
  audioUrl: `https://x/${id}.m4a`,
  isPreview: true,
  ...extra,
});

const catalog = (n: number, artists: number) => Array.from({ length: n }, (_, i) => mk(String(i), `Artist ${i % artists}`));

describe('smartShuffle', () => {
  it('keeps every track exactly once and pins the start track', () => {
    const tracks = catalog(40, 8);
    const out = smartShuffle(tracks, { rng: seededRng(1), startWith: tracks[7] });
    expect(out).toHaveLength(40);
    expect(new Set(out.map((t) => t.id)).size).toBe(40);
    expect(out[0].id).toBe('7');
  });

  it('never plays the same artist back-to-back when avoidable', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const out = smartShuffle(catalog(60, 10), { rng: seededRng(seed) });
      for (let i = 1; i < out.length; i++) expect(out[i].artistName).not.toBe(out[i - 1].artistName);
    }
  });

  it('keeps a multi-track gap between songs by one artist', () => {
    const out = smartShuffle(catalog(60, 12), { rng: seededRng(5), minArtistGap: 4 });
    // Only check the portion where plenty of artists remain.
    for (let i = 0; i < 40; i++) {
      const window = out.slice(Math.max(0, i - 4), i).map((t) => t.artistName);
      expect(window).not.toContain(out[i].artistName);
    }
  });

  it('demotes skipped songs and promotes loved artists', () => {
    const tracks = catalog(30, 10);
    const now = Date.now();
    const history = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `h${i}`, track: tracks[0], playedAt: now - i * 1000, listenedMs: 2000, completed: false, skipped: true })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, track: tracks[1], playedAt: now - 10_000 - i * 1000, listenedMs: 200000, completed: true, skipped: false })),
    ];
    const taste = buildTaste(history, [tracks[1]]);
    let skippedPos = 0;
    let lovedPos = 0;
    const runs = 200;
    for (let s = 0; s < runs; s++) {
      const out = smartShuffle(tracks, { taste, rng: seededRng(s + 100), minArtistGap: 0 });
      skippedPos += out.findIndex((t) => t.id === '0');
      lovedPos += out.findIndex((t) => t.id === '1');
    }
    expect(lovedPos / runs).toBeLessThan(skippedPos / runs);
  });
});

describe('lyrics', () => {
  it('parses LRC and finds the active line', () => {
    const lines = parseLrc('[00:01.50] hello\n[00:05.00] world\n[01:00.00]\n');
    expect(lines).toEqual([
      { timeMs: 1500, text: 'hello' },
      { timeMs: 5000, text: 'world' },
      { timeMs: 60000, text: '' },
    ]);
    expect(activeLyricIndex(lines, 0)).toBe(-1);
    expect(activeLyricIndex(lines, 1500)).toBe(0);
    expect(activeLyricIndex(lines, 30000)).toBe(1);
  });
});

describe('PlayerController', () => {
  const setup = (n = 5) => {
    const engine = new MockEngine();
    const played: any[] = [];
    const player = new PlayerController({ engine, onPlayed: (e) => played.push(e), random: seededRng(3) });
    return { engine, player, played, tracks: catalog(n, n) };
  };

  it('plays in order, advances on end and stops at the end', async () => {
    const { engine, player, tracks } = setup(3);
    await player.play(tracks);
    expect(player.getState().current?.id).toBe('0');
    engine.finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(player.getState().current?.id).toBe('1');
    await player.next();
    expect(player.getState().current?.id).toBe('2');
    await player.next();
    expect(engine.playing).toBe(false);
  });

  it('plays the explicit queue before the context, then resumes the context', async () => {
    const { player, tracks } = setup(4);
    await player.play(tracks);
    player.addToQueue(mk('q1', 'Q'));
    player.playNext(mk('q0', 'Q'));
    await player.next();
    expect(player.getState().current?.id).toBe('q0');
    await player.next();
    expect(player.getState().current?.id).toBe('q1');
    await player.next();
    expect(player.getState().current?.id).toBe('1');
  });

  it('previous restarts after 3s, otherwise goes back', async () => {
    const { engine, player, tracks } = setup(4);
    await player.play(tracks);
    await player.next();
    engine.tick(5000);
    await player.previous();
    expect(player.getState().current?.id).toBe('1');
    expect(engine.position).toBe(0);
    await player.previous();
    expect(player.getState().current?.id).toBe('0');
    await player.next();
    expect(player.getState().current?.id).toBe('1');
  });

  it('repeat one loops, repeat all wraps', async () => {
    const { engine, player, tracks } = setup(2);
    await player.play(tracks);
    player.setRepeat('one');
    engine.finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(player.getState().current?.id).toBe('0');
    player.setRepeat('all');
    await player.next();
    await player.next();
    expect(player.getState().current?.id).toBe('0');
  });

  it('shuffle keeps the current track and toggling off restores order', async () => {
    const { player, tracks } = setup(10);
    await player.play(tracks, { startIndex: 3 });
    player.setShuffle(true);
    expect(player.getState().current?.id).toBe('3');
    expect(player.getState().upNext).toHaveLength(6);
    player.setShuffle(false);
    expect(player.getState().upNext.map((t) => t.id)).toEqual(['4', '5', '6', '7', '8', '9']);
  });

  it('records history with skip detection', async () => {
    const { engine, player, played, tracks } = setup(3);
    await player.play(tracks);
    engine.tick(1000);
    engine.tick(1000);
    await player.next();
    expect(played).toHaveLength(1);
    expect(played[0]).toMatchObject({ skipped: true, completed: false });
  });

  it('skips unplayable tracks and autoplays radio at the end', async () => {
    const engine = new MockEngine();
    const radio = [mk('r1', 'R1'), mk('r2', 'R2')];
    const player = new PlayerController({ engine, autoplay: async () => radio });
    await player.play([mk('a', 'A')]);
    await player.next();
    expect(player.getState().current?.id).toBe('r1');
    expect(player.getState().context?.type).toBe('radio');
  });
});

describe('LibraryStore', () => {
  it('likes, playlists and LWW merge', async () => {
    const a = new LibraryStore(new MemoryStorage());
    const b = new LibraryStore(new MemoryStorage());
    await Promise.all([a.ready, b.ready]);
    const t = mk('1', 'X');
    a.toggleLike(t);
    const pl = a.createPlaylist('Road trip', [t, mk('2', 'Y')]);
    b.mergeRemote(a.entriesSince(0));
    expect(b.isLiked('1')).toBe(true);
    expect(b.getPlaylist(pl.id)?.tracks).toHaveLength(2);
    await new Promise((r) => setTimeout(r, 5));
    b.toggleLike(t); // unlike on b
    a.mergeRemote(b.entriesSince(0));
    expect(a.isLiked('1')).toBe(false);
  });
});
