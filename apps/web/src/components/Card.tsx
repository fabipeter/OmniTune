import type { Album, Artist, Mix, Playlist, Podcast, ShelfItem, Track } from '@omnitune/core';
import { Pause, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { catalog, player } from '../app/services';
import { usePlayer } from '../hooks/useStore';
import { useUi } from '../app/uiContext';
import { ArtistAvatar, Artwork, MosaicArtwork } from './Artwork';

export function ShelfCard({ item, trackGroup }: { item: ShelfItem; trackGroup?: Track[] }) {
  const navigate = useNavigate();
  const st = usePlayer();
  const { openContextMenu, rememberMixes } = useUi();

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    switch (item.type) {
      case 'track': {
        if (st.current?.id === item.track.id) {
          void player.toggle();
          return;
        }
        const list = trackGroup?.length ? trackGroup : [item.track];
        const idx = Math.max(0, list.findIndex((t) => t.id === item.track.id));
        void player.play(list, { startIndex: idx, context: { type: 'chart', name: 'Top Songs' } });
        break;
      }
      case 'album': {
        const { album, tracks } = await catalog.getAlbum(item.album.id);
        void player.play(tracks, { context: { type: 'album', id: album.id, name: album.title } });
        break;
      }
      case 'artist': {
        const { artist, topSongs } = await catalog.getArtist(item.artist.id);
        void player.play(topSongs, { context: { type: 'artist', id: artist.id, name: artist.name } });
        break;
      }
      case 'podcast': {
        const { podcast, episodes } = await catalog.getPodcast(item.podcast.id);
        void player.play(episodes, { context: { type: 'podcast', id: podcast.id, name: podcast.title } });
        break;
      }
      case 'mix': {
        rememberMixes([item.mix]);
        void player.play(item.mix.tracks, { context: { type: 'mix', id: item.mix.id, name: item.mix.name } });
        break;
      }
      case 'playlist': {
        void player.play(item.playlist.tracks, { context: { type: 'playlist', id: item.playlist.id, name: item.playlist.name } });
        break;
      }
    }
  };

  const handleOpen = () => {
    switch (item.type) {
      case 'track':
        if (item.track.albumId) navigate(`/album/${item.track.albumId}`);
        else void player.playTrack(item.track);
        break;
      case 'album':
        navigate(`/album/${item.album.id}`);
        break;
      case 'artist':
        navigate(`/artist/${item.artist.id}`);
        break;
      case 'podcast':
        navigate(`/podcast/${item.podcast.id}`);
        break;
      case 'mix':
        rememberMixes([item.mix]);
        navigate(`/mix/${item.mix.id}`);
        break;
      case 'playlist':
        navigate(`/playlist/${item.playlist.id}`);
        break;
    }
  };

  let title = '';
  let subtitle = '';
  let art: React.ReactNode = null;
  let isRound = false;
  let isPlayingThis = false;

  if (item.type === 'track') {
    const t: Track = item.track;
    title = t.title;
    subtitle = t.artistName;
    art = <Artwork url={t.artworkUrl} alt={t.title} seed={t.id} />;
    isPlayingThis = st.playing && st.current?.id === t.id;
  } else if (item.type === 'album') {
    const a: Album = item.album;
    title = a.title;
    subtitle = `${a.releaseDate ? `${a.releaseDate.slice(0, 4)} · ` : ''}${a.artistName}`;
    art = <Artwork url={a.artworkUrl} alt={a.title} seed={a.id} />;
    isPlayingThis = st.playing && st.context?.type === 'album' && st.context.id === a.id;
  } else if (item.type === 'artist') {
    const a: Artist = item.artist;
    title = a.name;
    subtitle = a.genre || 'Artist';
    isRound = true;
    art = <ArtistAvatar artistId={a.id} initialUrl={a.artworkUrl} name={a.name} />;
    isPlayingThis = st.playing && st.context?.type === 'artist' && st.context.id === a.id;
  } else if (item.type === 'podcast') {
    const p: Podcast = item.podcast;
    title = p.title;
    subtitle = p.author;
    art = <Artwork url={p.artworkUrl} alt={p.title} seed={p.id} />;
    isPlayingThis = st.playing && st.context?.type === 'podcast' && st.context.id === p.id;
  } else if (item.type === 'mix') {
    const m: Mix = item.mix;
    title = m.name;
    subtitle = m.description;
    art = <MosaicArtwork urls={m.artwork} seed={m.id} />;
    isPlayingThis = st.playing && st.context?.type === 'mix' && st.context.id === m.id;
  } else if (item.type === 'playlist') {
    const pl: Playlist = item.playlist;
    title = pl.name;
    subtitle = pl.description || `${pl.tracks.length} songs`;
    art = <MosaicArtwork urls={pl.tracks.map((t) => t.artworkUrl)} seed={pl.id} />;
    isPlayingThis = st.playing && st.context?.type === 'playlist' && st.context.id === pl.id;
  }

  return (
    <div
      className="media-card"
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => e.key === 'Enter' && handleOpen()}
      onContextMenu={(e) => item.type === 'track' && openContextMenu(e, item.track)}
    >
      <div className={`card-art-wrap ${isRound ? 'round' : ''}`}>
        {art}
        <button
          className="play-fab sm card-play-btn"
          aria-label={`Play ${title}`}
          onClick={handlePlay}
          style={isPlayingThis ? { opacity: 1, transform: 'translateY(0)' } : undefined}
        >
          {isPlayingThis ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>
      </div>
      <div className="card-title">{title}</div>
      <div className="card-sub">{subtitle}</div>
    </div>
  );
}
