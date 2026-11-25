import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildHomeFeed, greeting, type HomeShelf, type Mix, type Track } from '@omnitune/core';
import { Heart, Play } from 'lucide-react';
import { catalog, library, player } from '../app/services';
import { useLibraryVersion, useSettings } from '../hooks/useStore';
import { useUi } from '../app/uiContext';
import { Artwork, MosaicArtwork } from '../components/Artwork';
import { ShelfCard } from '../components/Card';

type HomeFilter = 'all' | 'music' | 'podcasts';

export function HomePage() {
  useLibraryVersion();
  const settings = useSettings();
  const navigate = useNavigate();
  const { rememberMixes } = useUi();
  const [filter, setFilter] = useState<HomeFilter>('all');
  const [shelves, setShelves] = useState<HomeShelf[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    void buildHomeFeed(catalog, library, settings)
      .then((data) => {
        if (!alive) return;
        setShelves(data);
        const foundMixes: Mix[] = [];
        for (const s of data) {
          for (const it of s.items) if (it.type === 'mix') foundMixes.push(it.mix);
        }
        if (foundMixes.length) rememberMixes(foundMixes);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Failed to load feed'));
    return () => {
      alive = false;
    };
  }, [settings.country, settings.explicitFilter, rememberMixes]);

  const liked = library.likedTracks();
  const playlists = library.playlists();
  const recent = library.recentlyPlayed(6);

  const visibleShelves = (shelves ?? []).filter((s) => {
    if (filter === 'all') return true;
    if (filter === 'podcasts') return s.id === 'podcasts';
    return s.id !== 'podcasts';
  });

  return (
    <div
      className="page-pad"
      style={{ background: 'linear-gradient(180deg, rgba(30, 99, 255, 0.22) 0%, transparent 280px)' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 8 }}>
        <div className="chip-row">
          {(['all', 'music', 'podcasts'] as HomeFilter[]).map((f) => (
            <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'music' ? 'Music' : 'Podcasts'}
            </button>
          ))}
        </div>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em' }}>{greeting()}</h1>
      </div>

      {/* OmniTune quick-pick grid */}
      {filter !== 'podcasts' && (
        <div className="quick-grid">
          <div className="quick-tile" role="button" tabIndex={0} onClick={() => navigate('/liked')}>
            <div
              style={{
                width: 56,
                height: 56,
                background: 'var(--sonic-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Heart size={22} fill="#fff" color="#fff" />
            </div>
            <div className="quick-tile-title">Liked Songs</div>
            {liked.length > 0 && (
              <button
                className="play-fab sm quick-tile-play"
                aria-label="Play Liked Songs"
                onClick={(e) => {
                  e.stopPropagation();
                  void player.play(liked, { context: { type: 'liked', name: 'Liked Songs' } });
                }}
              >
                <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
              </button>
            )}
          </div>

          {playlists.slice(0, 3).map((pl) => (
            <div key={pl.id} className="quick-tile" role="button" tabIndex={0} onClick={() => navigate(`/playlist/${pl.id}`)}>
              <MosaicArtwork urls={pl.tracks.map((t) => t.artworkUrl)} renderSize={56} seed={pl.id} />
              <div className="quick-tile-title">{pl.name}</div>
              {pl.tracks.length > 0 && (
                <button
                  className="play-fab sm quick-tile-play"
                  aria-label={`Play ${pl.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void player.play(pl.tracks, { context: { type: 'playlist', id: pl.id, name: pl.name } });
                  }}
                >
                  <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
                </button>
              )}
            </div>
          ))}

          {recent.slice(0, Math.max(2, 5 - playlists.length)).map((t) => (
            <div
              key={t.id}
              className="quick-tile"
              role="button"
              tabIndex={0}
              onClick={() => (t.albumId ? navigate(`/album/${t.albumId}`) : void player.playTrack(t))}
            >
              <Artwork url={t.artworkUrl} size={120} renderSize={56} alt={t.title} seed={t.id} />
              <div className="quick-tile-title">{t.title}</div>
              <button
                className="play-fab sm quick-tile-play"
                aria-label={`Play ${t.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void player.playTrack(t);
                }}
              >
                <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="empty-state">
          <p>{error}</p>
        </div>
      )}

      {!shelves && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {[0, 1, 2].map((s) => (
            <div key={s}>
              <div className="skeleton" style={{ width: 200, height: 24, marginBottom: 14 }} />
              <div className="card-rail">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="media-card">
                    <div className="skeleton" style={{ width: '100%', aspectRatio: '1/1' }} />
                    <div className="skeleton" style={{ height: 15, width: '78%' }} />
                    <div className="skeleton" style={{ height: 12, width: '55%' }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {visibleShelves.map((shelf) => {
        const trackGroup: Track[] | undefined =
          shelf.items[0]?.type === 'track' ? shelf.items.filter((i) => i.type === 'track').map((i) => i.track) : undefined;
        return (
          <section key={shelf.id} className="shelf">
            <div className="shelf-head">
              <div>
                <h2 className="shelf-title">{shelf.title}</h2>
                {shelf.subtitle && <div className="shelf-sub">{shelf.subtitle}</div>}
              </div>
            </div>
            <div className="card-rail">
              {shelf.items.map((item, idx) => (
                <ShelfCard key={`${shelf.id}-${idx}`} item={item} trackGroup={trackGroup} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
