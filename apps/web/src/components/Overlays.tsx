import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildRadio, colorFromString, formatDuration } from '@omnitune/core';
import {
  ChevronDown,
  ChevronRight,
  Disc,
  Heart,
  Link2,
  ListEnd,
  ListMusic,
  ListPlus,
  Moon,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  User,
} from 'lucide-react';
import { audioEngine, catalog, library, player } from '../app/services';
import { useLibraryVersion, usePlayer, useProgress } from '../hooks/useStore';
import { useUi } from '../app/uiContext';
import { Artwork } from './Artwork';
import { DevicesView, LyricsView, QueueView } from './RightPanel';

export function ContextMenu() {
  useLibraryVersion();
  const navigate = useNavigate();
  const { contextMenu, closeContextMenu, openCreatePlaylist, toast } = useUi();
  const [showPlaylists, setShowPlaylists] = useState(false);

  useEffect(() => {
    setShowPlaylists(false);
    if (!contextMenu) return;
    const onDown = () => closeContextMenu();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeContextMenu();
    window.addEventListener('click', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu, closeContextMenu]);

  if (!contextMenu) return null;
  const { track, x, y, playlistId } = contextMenu;
  const liked = library.isLiked(track.id);
  const playlists = library.playlists();

  return (
    <div className="context-menu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()} role="menu">
      <button
        className="menu-item"
        onClick={() => {
          player.playNext(track);
          toast('Will play next');
          closeContextMenu();
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ListPlus size={15} /> Play next
        </span>
      </button>
      <button
        className="menu-item"
        onClick={() => {
          player.addToQueue(track);
          toast('Added to queue');
          closeContextMenu();
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ListEnd size={15} /> Add to queue
        </span>
      </button>
      <button
        className="menu-item"
        onClick={() => {
          const now = library.toggleLike(track);
          toast(now ? 'Added to Liked Songs' : 'Removed from Liked Songs');
          closeContextMenu();
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Heart size={15} fill={liked ? 'currentColor' : 'none'} /> {liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
        </span>
      </button>
      <button
        className="menu-item"
        onClick={async () => {
          closeContextMenu();
          toast(`Starting radio from ${track.title}…`);
          const list = await buildRadio(track, catalog, library.taste(), { explicitFilter: library.getSettings().explicitFilter });
          if (list.length) void player.play(list, { context: { type: 'radio', name: `Radio · ${track.title}` }, shuffle: false });
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Radio size={15} /> Go to song radio
        </span>
      </button>

      <div className="menu-sep" />

      <div style={{ position: 'relative' }}>
        <button className="menu-item" onClick={() => setShowPlaylists((v) => !v)}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ListMusic size={15} /> Add to playlist
          </span>
          <ChevronRight size={14} />
        </button>
        {showPlaylists && (
          <div
            className="context-menu"
            style={{
              position: 'absolute',
              top: 0,
              left: x + 430 > window.innerWidth ? -220 : 210,
              maxHeight: 260,
              overflowY: 'auto',
            }}
          >
            <button
              className="menu-item"
              onClick={() => {
                openCreatePlaylist([track]);
                closeContextMenu();
              }}
            >
              + New playlist
            </button>
            <div className="menu-sep" />
            {playlists.map((pl) => (
              <button
                key={pl.id}
                className="menu-item"
                onClick={() => {
                  library.addToPlaylist(pl.id, [track]);
                  toast(`Added to ${pl.name}`);
                  closeContextMenu();
                }}
              >
                {pl.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {playlistId && (
        <button
          className="menu-item danger"
          onClick={() => {
            library.removeFromPlaylist(playlistId, track.id);
            toast('Removed from playlist');
            closeContextMenu();
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Trash2 size={15} /> Remove from this playlist
          </span>
        </button>
      )}

      <div className="menu-sep" />

      {track.artistId && (
        <button
          className="menu-item"
          onClick={() => {
            navigate(`/artist/${track.artistId}`);
            closeContextMenu();
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <User size={15} /> Go to artist
          </span>
        </button>
      )}
      {track.albumId && (
        <button
          className="menu-item"
          onClick={() => {
            navigate(`/album/${track.albumId}`);
            closeContextMenu();
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Disc size={15} /> Go to album
          </span>
        </button>
      )}
      {track.storeUrl && (
        <button
          className="menu-item"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(track.storeUrl!);
              toast('Copied OmniTune share link');
            } catch {
              toast('Could not copy link');
            }
            closeContextMenu();
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link2 size={15} /> Copy share link
          </span>
        </button>
      )}
    </div>
  );
}

export function PlaylistModal() {
  const navigate = useNavigate();
  const { playlistModal, closePlaylistModal, toast } = useUi();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  useEffect(() => {
    if (!playlistModal) return;
    setName(playlistModal.playlist?.name ?? '');
    setDesc(playlistModal.playlist?.description ?? '');
  }, [playlistModal]);

  if (!playlistModal) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (playlistModal.mode === 'create') {
      const pl = library.createPlaylist(name || 'My Playlist', playlistModal.initialTracks ?? [], desc.trim() || undefined);
      toast(`Created "${pl.name}"`);
      closePlaylistModal();
      navigate(`/playlist/${pl.id}`);
    } else if (playlistModal.playlist) {
      library.renamePlaylist(playlistModal.playlist.id, name, desc.trim());
      toast('Playlist updated');
      closePlaylistModal();
    }
  };

  return (
    <div className="modal-backdrop" onClick={closePlaylistModal}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 style={{ margin: 0 }}>{playlistModal.mode === 'create' ? 'Create playlist' : 'Edit playlist details'}</h2>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          Name
          <input className="text-input" autoFocus placeholder="Playlist name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          Description
          <textarea
            className="text-input"
            rows={3}
            placeholder="Add an optional description"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="pill-btn" onClick={closePlaylistModal}>
            Cancel
          </button>
          <button type="submit" className="pill-btn primary">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

export function SleepTimerModal() {
  const st = usePlayer();
  const { sleepModalOpen, setSleepModalOpen, toast } = useUi();
  if (!sleepModalOpen) return null;

  const pick = (opt: { minutes: number } | { endOfTrack: true } | null, label: string) => {
    player.setSleepTimer(opt);
    toast(label);
    setSleepModalOpen(false);
  };

  return (
    <div className="modal-backdrop" onClick={() => setSleepModalOpen(false)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Moon size={18} /> Sleep timer
        </h2>
        {[5, 10, 15, 30, 45, 60].map((m) => (
          <button key={m} className="menu-item" onClick={() => pick({ minutes: m }, `Sleep timer set for ${m} min`)}>
            {m} minutes
          </button>
        ))}
        <button className="menu-item" onClick={() => pick({ endOfTrack: true }, 'Will stop at end of track')}>
          End of current track
        </button>
        {st.sleep && (
          <button className="menu-item danger" onClick={() => pick(null, 'Sleep timer cleared')}>
            Turn off timer
          </button>
        )}
      </div>
    </div>
  );
}

export function FullscreenPlayer() {
  useLibraryVersion();
  const st = usePlayer();
  const { positionMs, durationMs } = useProgress();
  const { fullscreen, setFullscreen, toast } = useUi();
  const [tab, setTab] = useState<'lyrics' | 'queue' | 'devices'>('lyrics');

  if (!fullscreen || !st.current) return null;
  const t = st.current;
  const liked = library.isLiked(t.id);
  const bg = colorFromString(t.albumId || t.id, 46, 18);

  return (
    <div className="fullscreen-player" style={{ background: `linear-gradient(160deg, ${bg} 0%, #070d1b 72%)` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <button className="icon-btn" aria-label="Close fullscreen" onClick={() => setFullscreen(false)}>
          <ChevronDown size={24} />
        </button>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {st.context?.name || 'Now Playing'}
        </div>
        <div className="chip-row">
          <button className={`chip ${tab === 'lyrics' ? 'active' : ''}`} onClick={() => setTab('lyrics')}>
            Lyrics
          </button>
          <button className={`chip ${tab === 'queue' ? 'active' : ''}`} onClick={() => setTab('queue')}>
            Queue
          </button>
          <button className={`chip ${tab === 'devices' ? 'active' : ''}`} onClick={() => setTab('devices')}>
            Devices
          </button>
        </div>
      </div>

      <div className="fs-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ width: '100%', aspectRatio: '1/1', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
            <Artwork url={t.artworkUrl} size={600} alt={t.title} seed={t.id} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 24, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.title}
              </div>
              <div style={{ fontSize: 15, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                {t.artistName}
                {t.isPreview && !audioEngine.fullSongsEnabled && <span className="badge-preview">Preview</span>}
              </div>
            </div>
            <button
              className={`icon-btn ${liked ? 'liked' : ''}`}
              onClick={() => {
                const now = library.toggleLike(t);
                toast(now ? 'Added to Liked Songs' : 'Removed from Liked Songs');
              }}
            >
              <Heart size={22} fill={liked ? 'currentColor' : 'none'} />
            </button>
          </div>

          <div className="seek-row" style={{ maxWidth: '100%' }}>
            <span>{formatDuration(positionMs)}</span>
            <input
              type="range"
              className="range-slider always-thumb"
              min={0}
              max={Math.max(1, durationMs)}
              value={Math.min(positionMs, durationMs || 1)}
              onChange={(e) => player.seek(Number(e.target.value))}
            />
            <span>{formatDuration(durationMs)}</span>
          </div>

          <div className="transport-row" style={{ justifyContent: 'center', gap: 20 }}>
            <button className={`icon-btn ${st.shuffle ? 'active' : ''}`} onClick={() => player.toggleShuffle()} aria-label="Shuffle">
              <Shuffle size={18} />
            </button>
            <button className="icon-btn" onClick={() => void player.previous()} aria-label="Previous">
              <SkipBack size={24} fill="currentColor" />
            </button>
            <button className="play-fab" onClick={() => void player.toggle()} aria-label={st.playing ? 'Pause' : 'Play'}>
              {st.playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: 2 }} />}
            </button>
            <button className="icon-btn" onClick={() => void player.next()} aria-label="Next">
              <SkipForward size={24} fill="currentColor" />
            </button>
            <button className={`icon-btn ${st.repeat !== 'off' ? 'active' : ''}`} onClick={() => player.cycleRepeat()} aria-label="Repeat">
              {st.repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
            </button>
          </div>
        </div>

        <div style={{ maxHeight: '72vh', overflowY: 'auto', paddingRight: 8 }}>
          {tab === 'lyrics' ? <LyricsView track={t} /> : tab === 'queue' ? <QueueView /> : <DevicesView />}
        </div>
      </div>
    </div>
  );
}

export function ToastStack() {
  const { toasts } = useUi();
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}
