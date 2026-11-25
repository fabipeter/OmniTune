import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  GENRES,
  buildMixes,
  findGenre,
  formatLongDuration,
  releaseYear,
  type Album,
  type Artist,
  type Mix,
  type Podcast,
  type Track,
} from '@omnitune/core';
import { Heart, Pause, Pencil, Pin, Play, Plus, Radio, Shuffle, Trash2 } from 'lucide-react';
import { catalog, library, player } from '../app/services';
import { useHeaderTint, useLibraryVersion, usePlayer } from '../hooks/useStore';
import { useUi } from '../app/uiContext';
import { Artwork, MosaicArtwork } from '../components/Artwork';
import { ShelfCard } from '../components/Card';
import { TrackList } from '../components/TrackList';
import { QueueView } from '../components/RightPanel';

function PageSkeleton() {
  return (
    <div className="page-pad" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
        <div className="skeleton" style={{ width: 200, height: 200, borderRadius: 10 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="skeleton" style={{ width: 90, height: 14 }} />
          <div className="skeleton" style={{ width: '55%', height: 42 }} />
          <div className="skeleton" style={{ width: '35%', height: 16 }} />
        </div>
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 48, width: '100%' }} />
      ))}
    </div>
  );
}

/* ==================== ALBUM PAGE ==================== */
export function AlbumPage() {
  useLibraryVersion();
  const { id = '' } = useParams();
  const st = usePlayer();
  const { toast } = useUi();
  const [data, setData] = useState<{ album: Album; tracks: Track[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tint = useHeaderTint(data?.album.title || id);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    void catalog
      .getAlbum(id)
      .then((res) => alive && setData(res))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Album not found'));
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) return <div className="empty-state">{error}</div>;
  if (!data) return <PageSkeleton />;

  const { album, tracks } = data;
  const saved = library.isAlbumSaved(album.id);
  const totalMs = tracks.reduce((s, t) => s + t.durationMs, 0);
  const playingHere = st.playing && st.context?.type === 'album' && st.context.id === album.id;

  return (
    <div>
      <div className="hero-header" style={{ background: `linear-gradient(180deg, ${tint} 0%, transparent 100%)` }}>
        <div className="hero-art">
          <Artwork url={album.artworkUrl} size={600} alt={album.title} seed={album.id} />
        </div>
        <div className="hero-meta">
          <span className="hero-kind">Album</span>
          <h1 className="hero-title">{album.title}</h1>
          <div className="hero-sub">
            {album.artistId ? (
              <Link to={`/artist/${album.artistId}`} style={{ fontWeight: 700, color: 'var(--text)' }}>
                {album.artistName}
              </Link>
            ) : (
              <strong>{album.artistName}</strong>
            )}
            {album.releaseDate && <span>· {releaseYear(album.releaseDate)}</span>}
            <span>· {tracks.length} songs</span>
            {totalMs > 0 && <span>· {formatLongDuration(totalMs)}</span>}
          </div>
        </div>
      </div>

      <div className="action-bar">
        <button
          className="play-fab"
          aria-label={playingHere ? 'Pause' : 'Play album'}
          onClick={() =>
            playingHere ? player.pause() : void player.play(tracks, { context: { type: 'album', id: album.id, name: album.title }, shuffle: false })
          }
        >
          {playingHere ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>
        <button
          className="pill-btn"
          onClick={() => void player.play(tracks, { context: { type: 'album', id: album.id, name: album.title }, shuffle: true })}
        >
          <Shuffle size={15} /> Smart Shuffle
        </button>
        <button
          className="pill-btn ghost"
          onClick={() => {
            library.toggleAlbum(album);
            toast(saved ? 'Removed from Your Library' : 'Saved album to Your Library');
          }}
        >
          <Heart size={15} fill={saved ? 'var(--accent)' : 'none'} color={saved ? 'var(--accent)' : 'currentColor'} />
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      <TrackList tracks={tracks} context={{ type: 'album', id: album.id, name: album.title }} showAlbum={false} showArtwork={false} />
    </div>
  );
}

/* ==================== ARTIST PAGE ==================== */
export function ArtistPage() {
  useLibraryVersion();
  const { id = '' } = useParams();
  const st = usePlayer();
  const { toast } = useUi();
  const [data, setData] = useState<{ artist: Artist; topSongs: Track[]; albums: Album[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tint = useHeaderTint(data?.artist.name || id);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    void catalog
      .getArtist(id)
      .then((res) => alive && setData(res))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Artist not found'));
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) return <div className="empty-state">{error}</div>;
  if (!data) return <PageSkeleton />;

  const { artist, topSongs, albums } = data;
  const followed = library.isArtistFollowed(artist.id);
  const playingHere = st.playing && st.context?.type === 'artist' && st.context.id === artist.id;

  return (
    <div>
      <div className="hero-header" style={{ background: `linear-gradient(180deg, ${tint} 0%, transparent 100%)` }}>
        <div className="hero-art round">
          <Artwork url={artist.artworkUrl} size={600} alt={artist.name} seed={artist.name} round />
        </div>
        <div className="hero-meta">
          <span className="hero-kind">Artist</span>
          <h1 className="hero-title">{artist.name}</h1>
          {artist.genre && <div className="hero-sub">{artist.genre}</div>}
        </div>
      </div>

      <div className="action-bar">
        <button
          className="play-fab"
          aria-label="Play artist"
          onClick={() =>
            playingHere ? player.pause() : void player.play(topSongs, { context: { type: 'artist', id: artist.id, name: artist.name } })
          }
        >
          {playingHere ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>
        <button
          className="pill-btn"
          onClick={() => void player.play(topSongs, { context: { type: 'artist', id: artist.id, name: artist.name }, shuffle: true })}
        >
          <Shuffle size={15} /> Smart Shuffle
        </button>
        <button
          className="pill-btn ghost"
          onClick={() => {
            library.toggleArtist(artist);
            toast(followed ? `Unfollowed ${artist.name}` : `Following ${artist.name}`);
          }}
        >
          {followed ? 'Following' : 'Follow'}
        </button>
      </div>

      {topSongs.length > 0 && (
        <section className="shelf">
          <div className="page-pad" style={{ paddingBottom: 0 }}>
            <h2 className="shelf-title">Popular</h2>
          </div>
          <TrackList tracks={topSongs.slice(0, 10)} context={{ type: 'artist', id: artist.id, name: artist.name }} />
        </section>
      )}

      {albums.length > 0 && (
        <section className="page-pad" style={{ paddingTop: 0 }}>
          <h2 className="shelf-title" style={{ marginBottom: 14 }}>
            Discography
          </h2>
          <div className="card-grid">
            {albums.map((album) => (
              <ShelfCard key={album.id} item={{ type: 'album', album }} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ==================== PODCAST PAGE ==================== */
export function PodcastPage() {
  useLibraryVersion();
  const { id = '' } = useParams();
  const { toast } = useUi();
  const [data, setData] = useState<{ podcast: Podcast; episodes: Track[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tint = useHeaderTint(data?.podcast.title || id);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    void catalog
      .getPodcast(id)
      .then((res) => alive && setData(res))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Podcast not found'));
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) return <div className="empty-state">{error}</div>;
  if (!data) return <PageSkeleton />;

  const { podcast, episodes } = data;
  const followed = library.isPodcastFollowed(podcast.id);

  return (
    <div>
      <div className="hero-header" style={{ background: `linear-gradient(180deg, ${tint} 0%, transparent 100%)` }}>
        <div className="hero-art">
          <Artwork url={podcast.artworkUrl} size={600} alt={podcast.title} seed={podcast.id} />
        </div>
        <div className="hero-meta">
          <span className="hero-kind">Podcast · Full episodes</span>
          <h1 className="hero-title">{podcast.title}</h1>
          <div className="hero-sub">
            <strong>{podcast.author}</strong>
            {podcast.genre && <span>· {podcast.genre}</span>}
            <span>· {episodes.length} episodes</span>
          </div>
        </div>
      </div>

      <div className="action-bar">
        {episodes[0] && (
          <button
            className="play-fab"
            aria-label="Play latest episode"
            onClick={() => void player.play(episodes, { startIndex: 0, context: { type: 'podcast', id: podcast.id, name: podcast.title }, shuffle: false })}
          >
            <Play size={24} fill="currentColor" style={{ marginLeft: 2 }} />
          </button>
        )}
        <button
          className="pill-btn ghost"
          onClick={() => {
            library.togglePodcast(podcast);
            toast(followed ? 'Unfollowed podcast' : 'Following podcast');
          }}
        >
          {followed ? 'Following' : 'Follow'}
        </button>
      </div>

      <TrackList tracks={episodes} context={{ type: 'podcast', id: podcast.id, name: podcast.title }} showAlbum={false} />
    </div>
  );
}

/* ==================== PLAYLIST PAGE ==================== */
export function PlaylistPage() {
  useLibraryVersion();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const st = usePlayer();
  const { openEditPlaylist, toast } = useUi();
  const playlist = library.getPlaylist(id);
  const tint = useHeaderTint(playlist?.name || id);

  if (!playlist) {
    return (
      <div className="empty-state">
        <h2>Playlist not found</h2>
        <Link to="/" className="pill-btn primary">
          Back home
        </Link>
      </div>
    );
  }

  const totalMs = playlist.tracks.reduce((s, t) => s + t.durationMs, 0);
  const playingHere = st.playing && st.context?.type === 'playlist' && st.context.id === playlist.id;

  return (
    <div>
      <div className="hero-header" style={{ background: `linear-gradient(180deg, ${tint} 0%, transparent 100%)` }}>
        <div className="hero-art">
          <MosaicArtwork urls={playlist.tracks.map((t) => t.artworkUrl)} seed={playlist.id} />
        </div>
        <div className="hero-meta">
          <span className="hero-kind">Playlist</span>
          <h1 className="hero-title">{playlist.name}</h1>
          {playlist.description && <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{playlist.description}</div>}
          <div className="hero-sub">
            <span>{playlist.tracks.length} songs</span>
            {totalMs > 0 && <span>· {formatLongDuration(totalMs)}</span>}
          </div>
        </div>
      </div>

      <div className="action-bar">
        {playlist.tracks.length > 0 && (
          <>
            <button
              className="play-fab"
              aria-label={playingHere ? 'Pause' : 'Play playlist'}
              onClick={() =>
                playingHere
                  ? player.pause()
                  : void player.play(playlist.tracks, { context: { type: 'playlist', id: playlist.id, name: playlist.name }, shuffle: false })
              }
            >
              {playingHere ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: 2 }} />}
            </button>
            <button
              className="pill-btn"
              onClick={() => void player.play(playlist.tracks, { context: { type: 'playlist', id: playlist.id, name: playlist.name }, shuffle: true })}
            >
              <Shuffle size={15} /> Smart Shuffle
            </button>
          </>
        )}
        <button className="pill-btn ghost" onClick={() => openEditPlaylist(playlist)}>
          <Pencil size={14} /> Edit
        </button>
        <button
          className="pill-btn ghost"
          onClick={() => {
            library.pinPlaylist(playlist.id, !playlist.pinned);
            toast(playlist.pinned ? 'Unpinned playlist' : 'Pinned playlist');
          }}
        >
          <Pin size={14} color={playlist.pinned ? 'var(--accent)' : 'currentColor'} /> {playlist.pinned ? 'Pinned' : 'Pin'}
        </button>
        <button
          className="pill-btn ghost"
          style={{ color: 'var(--danger)' }}
          onClick={() => {
            library.deletePlaylist(playlist.id);
            toast(`Deleted "${playlist.name}"`);
            navigate('/');
          }}
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>

      {playlist.tracks.length === 0 ? (
        <div className="empty-state">
          <h3>This playlist is empty</h3>
          <p>Right-click any track or drag it onto this playlist in the sidebar to add songs.</p>
          <Link to="/search" className="pill-btn primary">
            Find songs
          </Link>
        </div>
      ) : (
        <TrackList
          tracks={playlist.tracks}
          context={{ type: 'playlist', id: playlist.id, name: playlist.name }}
          playlistId={playlist.id}
          onReorder={(from, to) => library.moveInPlaylist(playlist.id, from, to)}
        />
      )}
    </div>
  );
}

/* ==================== MIX PAGE ==================== */
export function MixPage() {
  const { id = '' } = useParams();
  const { mixes } = useUi();
  const mix = mixes[id];

  if (!mix) {
    return (
      <div className="empty-state">
        <h2>Mix expired or not loaded</h2>
        <p>Return to Home to refresh your personalized mixes.</p>
        <Link to="/" className="pill-btn primary">
          Go Home
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="hero-header" style={{ background: `linear-gradient(180deg, ${mix.color} 0%, transparent 100%)` }}>
        <div className="hero-art">
          <MosaicArtwork urls={mix.artwork} seed={mix.id} />
        </div>
        <div className="hero-meta">
          <span className="hero-kind">Made for you</span>
          <h1 className="hero-title">{mix.name}</h1>
          <div className="hero-sub">{mix.description} · {mix.tracks.length} songs</div>
        </div>
      </div>

      <div className="action-bar">
        <button className="play-fab" onClick={() => void player.play(mix.tracks, { context: { type: 'mix', id: mix.id, name: mix.name }, shuffle: false })}>
          <Play size={24} fill="currentColor" style={{ marginLeft: 2 }} />
        </button>
        <button className="pill-btn" onClick={() => void player.play(mix.tracks, { context: { type: 'mix', id: mix.id, name: mix.name }, shuffle: true })}>
          <Shuffle size={15} /> Smart Shuffle
        </button>
      </div>

      <TrackList tracks={mix.tracks} context={{ type: 'mix', id: mix.id, name: mix.name }} />
    </div>
  );
}

/* ==================== GENRE PAGE ==================== */
export function GenrePage() {
  const { id = '' } = useParams();
  const genre = findGenre(id);
  const [tracks, setTracks] = useState<Track[] | null>(null);

  useEffect(() => {
    if (!genre) return;
    let alive = true;
    setTracks(null);
    void catalog.getGenreTracks(genre, 50).then((t) => alive && setTracks(t));
    return () => {
      alive = false;
    };
  }, [genre?.id]);

  if (!genre) return <div className="empty-state">Unknown genre</div>;

  return (
    <div>
      <div className="hero-header" style={{ background: `linear-gradient(180deg, ${genre.color} 0%, transparent 100%)` }}>
        <div className="hero-meta">
          <span className="hero-kind">Genre</span>
          <h1 className="hero-title">{genre.name}</h1>
        </div>
      </div>
      {tracks && tracks.length > 0 && (
        <div className="action-bar">
          <button className="play-fab" onClick={() => void player.play(tracks, { context: { type: 'genre', id: genre.id, name: genre.name } })}>
            <Play size={24} fill="currentColor" style={{ marginLeft: 2 }} />
          </button>
          <button className="pill-btn" onClick={() => void player.play(tracks, { context: { type: 'genre', id: genre.id, name: genre.name }, shuffle: true })}>
            <Shuffle size={15} /> Smart Shuffle
          </button>
        </div>
      )}
      {!tracks ? <PageSkeleton /> : <TrackList tracks={tracks} context={{ type: 'genre', id: genre.id, name: genre.name }} />}
    </div>
  );
}

/* ==================== LIKED SONGS PAGE ==================== */
export function LikedPage() {
  useLibraryVersion();
  const tracks = library.likedTracks();
  return (
    <div>
      <div className="hero-header" style={{ background: 'linear-gradient(180deg, rgba(30, 99, 255, 0.42) 0%, transparent 100%)' }}>
        <div
          className="hero-art"
          style={{ background: 'var(--sonic-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Heart size={76} fill="#fff" color="#fff" />
        </div>
        <div className="hero-meta">
          <span className="hero-kind">Playlist</span>
          <h1 className="hero-title">Liked Songs</h1>
          <div className="hero-sub">{tracks.length} songs</div>
        </div>
      </div>
      {tracks.length > 0 && (
        <div className="action-bar">
          <button className="play-fab" onClick={() => void player.play(tracks, { context: { type: 'liked', name: 'Liked Songs' }, shuffle: false })}>
            <Play size={24} fill="currentColor" style={{ marginLeft: 2 }} />
          </button>
          <button className="pill-btn" onClick={() => void player.play(tracks, { context: { type: 'liked', name: 'Liked Songs' }, shuffle: true })}>
            <Shuffle size={15} /> Smart Shuffle
          </button>
        </div>
      )}
      {tracks.length === 0 ? (
        <div className="empty-state">
          <h3>Songs you like will appear here</h3>
          <p>Tap the heart icon on any track to save it and improve your Smart Shuffle & mixes.</p>
        </div>
      ) : (
        <TrackList tracks={tracks} context={{ type: 'liked', name: 'Liked Songs' }} />
      )}
    </div>
  );
}

/* ==================== RECENTLY PLAYED PAGE ==================== */
export function RecentPage() {
  useLibraryVersion();
  const tracks = library.recentlyPlayed(50);
  return (
    <div>
      <div className="hero-header" style={{ background: 'linear-gradient(180deg, rgba(30, 99, 255, 0.28) 0%, transparent 100%)' }}>
        <div className="hero-meta">
          <span className="hero-kind">History</span>
          <h1 className="hero-title">Recently Played</h1>
          <div className="hero-sub">{tracks.length} tracks</div>
        </div>
      </div>
      {tracks.length === 0 ? (
        <div className="empty-state">Start playing songs to build your listening history and taste graph.</div>
      ) : (
        <TrackList tracks={tracks} context={{ type: 'unknown', name: 'Recently Played' }} />
      )}
    </div>
  );
}

/* ==================== LIBRARY PAGE (mobile-web / full view) ==================== */
export function LibraryPage() {
  useLibraryVersion();
  const { openCreatePlaylist } = useUi();
  const playlists = library.playlists();
  const albums = library.savedAlbums();
  const artists = library.followedArtists();
  const podcasts = library.followedPodcasts();

  return (
    <div className="page-pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Your Library</h1>
        <button className="pill-btn primary" onClick={() => openCreatePlaylist()}>
          <Plus size={16} /> New playlist
        </button>
      </div>

      <div className="quick-grid">
        <Link to="/liked" className="quick-tile">
          <div style={{ width: 56, height: 56, background: 'var(--sonic-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Heart size={20} fill="#fff" color="#fff" />
          </div>
          <div className="quick-tile-title">Liked Songs ({library.likedTracks().length})</div>
        </Link>
        <Link to="/recent" className="quick-tile">
          <div style={{ width: 56, height: 56, background: 'var(--surface-active)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Play size={18} />
          </div>
          <div className="quick-tile-title">Recently Played</div>
        </Link>
      </div>

      {playlists.length > 0 && (
        <section className="shelf">
          <h2 className="shelf-title" style={{ marginBottom: 12 }}>Playlists</h2>
          <div className="card-grid">
            {playlists.map((playlist) => <ShelfCard key={playlist.id} item={{ type: 'playlist', playlist }} />)}
          </div>
        </section>
      )}
      {albums.length > 0 && (
        <section className="shelf">
          <h2 className="shelf-title" style={{ marginBottom: 12 }}>Saved Albums</h2>
          <div className="card-grid">
            {albums.map((album) => <ShelfCard key={album.id} item={{ type: 'album', album }} />)}
          </div>
        </section>
      )}
      {artists.length > 0 && (
        <section className="shelf">
          <h2 className="shelf-title" style={{ marginBottom: 12 }}>Followed Artists</h2>
          <div className="card-grid">
            {artists.map((artist) => <ShelfCard key={artist.id} item={{ type: 'artist', artist }} />)}
          </div>
        </section>
      )}
      {podcasts.length > 0 && (
        <section className="shelf">
          <h2 className="shelf-title" style={{ marginBottom: 12 }}>Podcasts</h2>
          <div className="card-grid">
            {podcasts.map((podcast) => <ShelfCard key={podcast.id} item={{ type: 'podcast', podcast }} />)}
          </div>
        </section>
      )}
    </div>
  );
}

/* ==================== RADIO PAGE ==================== */
export function RadioPage() {
  useLibraryVersion();
  const { rememberMixes, toast } = useUi();
  const [mixes, setMixes] = useState<Mix[]>([]);
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);

  useEffect(() => {
    let alive = true;
    const settings = library.getSettings();
    void Promise.all([
      buildMixes(catalog, library.taste(), library.recentlyPlayed(25), { explicitFilter: settings.explicitFilter }),
      catalog.getTopPodcasts(12).catch(() => [] as Podcast[]),
    ]).then(([builtMixes, topPodcasts]) => {
      if (!alive) return;
      setMixes(builtMixes);
      setPodcasts(topPodcasts);
      if (builtMixes.length) rememberMixes(builtMixes);
    });
    return () => {
      alive = false;
    };
  }, [rememberMixes]);

  const startStation = async (term: string, title: string) => {
    toast(`Tuning ${title}…`);
    try {
      const res = await catalog.search(term, { limit: 35 });
      if (res.songs.length) {
        void player.play(res.songs, { context: { type: 'radio', name: title }, shuffle: true });
      }
    } catch {
      toast('Could not load station right now');
    }
  };

  return (
    <div
      className="page-pad"
      style={{ background: 'linear-gradient(180deg, rgba(30, 99, 255, 0.22) 0%, transparent 260px)' }}
    >
      <div style={{ marginBottom: 20 }}>
        <span className="hero-kind" style={{ color: 'var(--accent-hover)' }}>OmniTune Sonic Broadcast</span>
        <h1 style={{ margin: '4px 0 0', fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em' }}>Radio & Smart Mixes</h1>
      </div>

      {mixes.length > 0 && (
        <section className="shelf">
          <div className="shelf-head">
            <div>
              <h2 className="shelf-title">Made for You</h2>
              <div className="shelf-sub">Endless stations shaped by your plays, likes, and skips</div>
            </div>
          </div>
          <div className="card-grid">
            {mixes.map((mix) => (
              <ShelfCard key={mix.id} item={{ type: 'mix', mix }} />
            ))}
          </div>
        </section>
      )}

      <section className="shelf">
        <div className="shelf-head">
          <div>
            <h2 className="shelf-title">Sonic Genre Stations</h2>
            <div className="shelf-sub">One-tap Smart Shuffle radio tuned to any mood</div>
          </div>
        </div>
        <div className="genre-grid">
          {GENRES.map((g) => (
            <button
              key={g.id}
              className="genre-tile"
              style={{ background: `linear-gradient(135deg, ${g.color} 0%, #0d162b 100%)`, border: '1px solid var(--border-strong)' }}
              onClick={() => void startStation(g.term, `${g.name} Radio`)}
            >
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                <Radio size={18} />
                <span>{g.name} Radio</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {podcasts.length > 0 && (
        <section className="shelf">
          <div className="shelf-head">
            <h2 className="shelf-title">Featured Shows</h2>
          </div>
          <div className="card-grid">
            {podcasts.map((podcast) => (
              <ShelfCard key={podcast.id} item={{ type: 'podcast', podcast }} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ==================== QUEUE PAGE ==================== */
export function QueuePage() {
  return (
    <div className="settings-wrap">
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Queue</h1>
      <QueueView />
    </div>
  );
}
