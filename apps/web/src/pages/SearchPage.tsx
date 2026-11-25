import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GENRES, type SearchResults, type SearchType } from '@omnitune/core';
import { X } from 'lucide-react';
import { catalog } from '../app/services';
import { useUi } from '../app/uiContext';
import { useRecentSearches } from '../hooks/useStore';
import { ShelfCard } from '../components/Card';
import { TrackList } from '../components/TrackList';

type Tab = 'all' | SearchType;

const TABS: readonly Tab[] = ['all', 'songs', 'albums', 'artists', 'podcasts', 'episodes'];

export function SearchPage() {
  const { searchQuery, setSearchQuery } = useUi();
  const trimmed = searchQuery.trim().slice(0, 100);
  const [tab, setTab] = useState<Tab>('all');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const recent = useRecentSearches();

  useEffect(() => {
    if (!trimmed) {
      setResults(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      const types: SearchType[] = tab === 'all' ? ['songs', 'albums', 'artists', 'podcasts', 'episodes'] : [tab];
      void catalog
        .search(trimmed, { types, limit: tab === 'all' ? 12 : 30 })
        .then((res) => {
          if (!alive) return;
          setResults(res);
          setLoading(false);
          recent.add(trimmed);
        })
        .catch(() => alive && setLoading(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [trimmed, tab]);

  if (!trimmed) {
    return (
      <div className="page-pad">
        {recent.items.length > 0 && (
          <section className="shelf">
            <div className="shelf-head">
              <h2 className="shelf-title">Recent searches</h2>
              <button className="chip" onClick={recent.clear}>
                Clear
              </button>
            </div>
            <div className="chip-row" style={{ flexWrap: 'wrap' }}>
              {recent.items.map((item, index) => (
                <div key={`recent-${index}`} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => setSearchQuery(item)}>{item}</button>
                  <button aria-label="Remove recent search" onClick={() => recent.remove(item)}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="shelf">
          <div className="shelf-head">
            <h2 className="shelf-title">Browse all</h2>
          </div>
          <div className="genre-grid">
            {GENRES.map((g) => (
              <Link key={g.id} to={`/genre/${g.id}`} className="genre-tile" style={{ background: g.color }}>
                {g.name}
              </Link>
            ))}
          </div>
        </section>
      </div>
    );
  }

  const topSong = results?.songs[0];
  const topArtist = results?.artists[0];
  const topAlbum = results?.albums[0];

  return (
    <div className="page-pad">
      <div className="chip-row" style={{ marginBottom: 20 }}>
        {TABS.map((t) => (
          <button key={t} className={`chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 48, width: '100%' }} />
          ))}
        </div>
      )}

      {!loading && results && (
        <>
          {tab === 'all' && (topSong || topArtist || topAlbum) && (
            <div className="search-top-grid">
              <div>
                <h2 className="shelf-title" style={{ marginBottom: 12 }}>
                  Top result
                </h2>
                <div style={{ maxWidth: 240 }}>
                  {topSong ? (
                    <ShelfCard item={{ type: 'track', track: topSong }} trackGroup={results.songs} />
                  ) : topArtist ? (
                    <ShelfCard item={{ type: 'artist', artist: topArtist }} />
                  ) : topAlbum ? (
                    <ShelfCard item={{ type: 'album', album: topAlbum }} />
                  ) : null}
                </div>
              </div>

              {results.songs.length > 0 && (
                <div>
                  <h2 className="shelf-title" style={{ marginBottom: 12 }}>
                    Songs
                  </h2>
                  <TrackList tracks={results.songs.slice(0, 5)} context={{ type: 'search', name: 'Search Results' }} showAlbum={false} compact />
                </div>
              )}
            </div>
          )}

          {tab === 'songs' && <TrackList tracks={results.songs} context={{ type: 'search', name: 'Search Results' }} />}

          {tab === 'episodes' && (
            <TrackList tracks={results.episodes} context={{ type: 'search', name: 'Podcast Episodes' }} showAlbum={false} />
          )}

          {(tab === 'all' || tab === 'artists') && results.artists.length > 0 && (
            <section className="shelf">
              <div className="shelf-head">
                <h2 className="shelf-title">Artists</h2>
              </div>
              <div className={tab === 'all' ? 'card-rail' : 'card-grid'}>
                {results.artists.map((artist) => (
                  <ShelfCard key={artist.id} item={{ type: 'artist', artist }} />
                ))}
              </div>
            </section>
          )}

          {(tab === 'all' || tab === 'albums') && results.albums.length > 0 && (
            <section className="shelf">
              <div className="shelf-head">
                <h2 className="shelf-title">Albums</h2>
              </div>
              <div className={tab === 'all' ? 'card-rail' : 'card-grid'}>
                {results.albums.map((album) => (
                  <ShelfCard key={album.id} item={{ type: 'album', album }} />
                ))}
              </div>
            </section>
          )}

          {(tab === 'all' || tab === 'podcasts') && results.podcasts.length > 0 && (
            <section className="shelf">
              <div className="shelf-head">
                <h2 className="shelf-title">Podcasts</h2>
              </div>
              <div className={tab === 'all' ? 'card-rail' : 'card-grid'}>
                {results.podcasts.map((podcast) => (
                  <ShelfCard key={podcast.id} item={{ type: 'podcast', podcast }} />
                ))}
              </div>
            </section>
          )}

          {tab === 'all' && results.episodes.length > 0 && (
            <section className="shelf">
              <div className="shelf-head">
                <h2 className="shelf-title">Podcast episodes</h2>
              </div>
              <TrackList tracks={results.episodes.slice(0, 6)} context={{ type: 'search', name: 'Podcast Episodes' }} showAlbum={false} compact />
            </section>
          )}

          {results.songs.length === 0 &&
            results.albums.length === 0 &&
            results.artists.length === 0 &&
            results.podcasts.length === 0 &&
            results.episodes.length === 0 && (
              <div className="empty-state">
                <h3>No matching results found</h3>
                <p>Check spelling or try different keywords.</p>
              </div>
            )}
        </>
      )}
    </div>
  );
}
