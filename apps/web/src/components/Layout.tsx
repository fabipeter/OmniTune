import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { formatDuration, type Track } from '@omnitune/core';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Heart,
  Home,
  LayoutGrid,
  Library,
  List,
  ListMusic,
  Maximize2,
  Mic2,
  MonitorSpeaker,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Pin,
  Play,
  Plus,
  Radio,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { audioEngine, connectClient, library, player } from '../app/services';
import { useConnect, useLibraryVersion, usePlayer, useProgress, useSyncUser } from '../hooks/useStore';
import { useUi } from '../app/uiContext';
import { ArtistAvatar, Artwork, MosaicArtwork } from './Artwork';
import { RightPanel } from './RightPanel';
import { ContextMenu, FullscreenPlayer, PlaylistModal, SleepTimerModal, ToastStack } from './Overlays';

type LibFilter = 'all' | 'playlists' | 'albums' | 'artists' | 'podcasts';
type LibSort = 'recent' | 'alpha';

function LogoMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <rect width="100" height="100" rx="22" fill="#0A1429" stroke="rgba(59, 123, 255, 0.35)" strokeWidth="3" />
      <g stroke="#1E63FF" strokeWidth="6.4" strokeLinecap="butt" strokeLinejoin="round">
        <path d="M 40.16 67.46 A 15.6 15.6 0 1 1 46 68.6 L 46 82.2 A 29.2 29.2 0 1 1 59.71 27.22" />
        <path d="M 63.98 29.99 A 29.2 29.2 0 0 1 53.06 81.33" />
        <path d="M 65.5 19.23 A 39 39 0 0 1 85 53" />
      </g>
    </svg>
  );
}

export function Layout() {
  useLibraryVersion();
  const st = usePlayer();
  const connect = useConnect();
  const { positionMs, durationMs } = useProgress();
  const user = useSyncUser();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    rightPanel,
    toggleRightPanel,
    setFullscreen,
    setSleepModalOpen,
    openCreatePlaylist,
    toast,
    searchQuery,
    setSearchQuery,
  } = useUi();

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(296);
  const [collapsed, setCollapsed] = useState(false);
  const [draggingResize, setDraggingResize] = useState(false);
  const [libFilter, setLibFilter] = useState<LibFilter>('all');
  const [libSort, setLibSort] = useState<LibSort>('recent');
  const [libGrid, setLibGrid] = useState(false);
  const [dropPlaylistId, setDropPlaylistId] = useState<string | null>(null);

  // Global playback & navigation keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          void player.toggle();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) void player.next();
          else player.seekBy(5000);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) void player.previous();
          else player.seekBy(-5000);
          break;
        case 'ArrowUp':
          e.preventDefault();
          player.setVolume(player.getState().volume + 0.08);
          break;
        case 'ArrowDown':
          e.preventDefault();
          player.setVolume(player.getState().volume - 0.08);
          break;
        case 'm':
        case 'M':
          player.toggleMute();
          break;
        case 's':
        case 'S':
          player.toggleShuffle();
          break;
        case 'r':
        case 'R':
          player.cycleRepeat();
          break;
        case 'l':
        case 'L': {
          const cur = player.getState().current;
          if (cur) {
            const liked = library.toggleLike(cur);
            toast(liked ? 'Added to Liked Songs' : 'Removed from Liked Songs');
          }
          break;
        }
        case '/':
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case 'q':
        case 'Q':
          toggleRightPanel('queue');
          break;
        case 'd':
        case 'D':
          toggleRightPanel('devices');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toast, toggleRightPanel]);

  // Resizable sidebar drag
  useEffect(() => {
    if (!draggingResize) return;
    const onMove = (e: MouseEvent) => setSidebarWidth(Math.max(220, Math.min(440, e.clientX - 8)));
    const onUp = () => setDraggingResize(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingResize]);

  const likedCount = library.likedTracks().length;
  const playlists = library.playlists();
  const albums = library.savedAlbums();
  const artists = library.followedArtists();
  const podcasts = library.followedPodcasts();

  type LibRow =
    | { key: string; kind: 'playlist'; title: string; sub: string; pinned?: boolean; to: string; id: string; art: React.ReactNode }
    | { key: string; kind: 'album' | 'artist' | 'podcast'; title: string; sub: string; to: string; art: React.ReactNode };

  const libRows: LibRow[] = [];
  if (libFilter === 'all' || libFilter === 'playlists') {
    for (const pl of playlists) {
      libRows.push({
        key: pl.id,
        kind: 'playlist',
        id: pl.id,
        title: pl.name,
        sub: `Playlist · ${pl.tracks.length} songs`,
        pinned: pl.pinned,
        to: `/playlist/${pl.id}`,
        art: <MosaicArtwork urls={pl.tracks.map((t) => t.artworkUrl)} renderSize={libGrid ? undefined : 44} seed={pl.id} />,
      });
    }
  }
  if (libFilter === 'all' || libFilter === 'albums') {
    for (const a of albums) {
      libRows.push({
        key: `alb-${a.id}`,
        kind: 'album',
        title: a.title,
        sub: `Album · ${a.artistName}`,
        to: `/album/${a.id}`,
        art: <Artwork url={a.artworkUrl} size={100} renderSize={libGrid ? undefined : 44} alt={a.title} seed={a.id} />,
      });
    }
  }
  if (libFilter === 'all' || libFilter === 'artists') {
    for (const a of artists) {
      libRows.push({
        key: `art-${a.id}`,
        kind: 'artist',
        title: a.name,
        sub: 'Artist',
        to: `/artist/${a.id}`,
        art: <ArtistAvatar artistId={a.id} initialUrl={a.artworkUrl} name={a.name} renderSize={libGrid ? undefined : 44} />,
      });
    }
  }
  if (libFilter === 'all' || libFilter === 'podcasts') {
    for (const p of podcasts) {
      libRows.push({
        key: `pod-${p.id}`,
        kind: 'podcast',
        title: p.title,
        sub: `Podcast · ${p.author}`,
        to: `/podcast/${p.id}`,
        art: <Artwork url={p.artworkUrl} size={100} renderSize={libGrid ? undefined : 44} alt={p.title} seed={p.id} />,
      });
    }
  }
  if (libSort === 'alpha') {
    libRows.sort((a, b) => a.title.localeCompare(b.title));
  }

  const cur = st.current;
  const remoteDev = connect.remoteActiveDevice;
  const displayPlaying = remoteDev ? remoteDev.playing : st.playing;
  const curLiked = cur ? library.isLiked(cur.id) : false;
  const showPreview = cur?.isPreview && !audioEngine.fullSongsEnabled;
  const isEpisode = cur?.kind === 'episode';

  const onTogglePlay = () => {
    if (remoteDev) void connectClient.sendCommand(remoteDev.id, 'toggle');
    else void player.toggle();
  };
  const onNextTrack = () => {
    if (remoteDev) void connectClient.sendCommand(remoteDev.id, 'next');
    else void player.next();
  };
  const onPrevTrack = () => {
    if (remoteDev) void connectClient.sendCommand(remoteDev.id, 'previous');
    else void player.previous();
  };
  const onVolumeChange = (v: number) => {
    if (remoteDev) void connectClient.sendCommand(remoteDev.id, 'volume', v);
    else player.setVolume(v);
  };

  const onSearchChange = (val: string) => {
    setSearchQuery(val);
    if (location.pathname !== '/search') {
      navigate('/search');
    }
  };

  return (
    <div className="app-shell">
      {/* ==================== TOP BAR ==================== */}
      <header className="topbar">
        <div className="topbar-left">
          <Link to="/" className="brand-mark" aria-label="OmniTune Home">
            <LogoMark />
            <span className="hide-mobile">OmniTune</span>
          </Link>
          <button className="nav-circle-btn hide-mobile" aria-label="Back" onClick={() => navigate(-1)}>
            <ChevronLeft size={18} />
          </button>
          <button className="nav-circle-btn hide-mobile" aria-label="Forward" onClick={() => navigate(1)}>
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="topbar-center">
          <NavLink to="/" end className="nav-circle-btn hide-mobile" aria-label="Home" title="Home">
            <Home size={18} />
          </NavLink>
          <NavLink to="/radio" className="nav-circle-btn hide-mobile" aria-label="Radio" title="OmniTune Radio">
            <Radio size={18} />
          </NavLink>
          <div className="global-search">
            <Search size={17} color="var(--text-muted)" />
            <input
              ref={searchInputRef}
              type="search"
              placeholder="What do you want to play?"
              aria-label="Search music and podcasts"
              value={searchQuery}
              onFocus={() => location.pathname !== '/search' && navigate('/search')}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery && (
              <button aria-label="Clear search" onClick={() => onSearchChange('')}>
                <X size={15} color="var(--text-muted)" />
              </button>
            )}
          </div>
        </div>

        <div className="topbar-right">
          <Link to="/settings" className="nav-circle-btn" aria-label="Settings" title="Settings">
            <Settings size={17} />
          </Link>
          <Link to="/auth" className="pill-btn" title={user ? `Signed in as ${user.displayName}` : 'Sign in to sync'}>
            <User size={15} />
            <span className="hide-mobile">{user ? user.displayName : 'Sign in'}</span>
          </Link>
        </div>
      </header>

      {/* ==================== 3-PANE WORKSPACE ==================== */}
      <div className="workspace">
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} style={{ width: sidebarWidth }} aria-label="Your Library">
          <div className="sidebar-header">
            <button
              className="sidebar-title-btn"
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? 'Expand Your Library' : 'Collapse Your Library'}
            >
              {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
              {!collapsed && <span>Your Library</span>}
            </button>
            {!collapsed && (
              <button className="icon-btn" title="Create playlist" aria-label="Create playlist" onClick={() => openCreatePlaylist()}>
                <Plus size={18} />
              </button>
            )}
          </div>

          {!collapsed && (
            <div className="sidebar-controls">
              <div className="chip-row">
                {(['all', 'playlists', 'albums', 'artists', 'podcasts'] as LibFilter[]).map((f) => (
                  <button key={f} className={`chip ${libFilter === f ? 'active' : ''}`} onClick={() => setLibFilter(f)}>
                    {f[0].toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <div className="sidebar-sort-row">
                <button
                  style={{ fontSize: 12, color: 'var(--text-muted)' }}
                  onClick={() => setLibSort((s) => (s === 'recent' ? 'alpha' : 'recent'))}
                >
                  Sort: {libSort === 'recent' ? 'Recents' : 'A–Z'}
                </button>
                <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label="Toggle grid view" onClick={() => setLibGrid((g) => !g)}>
                  {libGrid ? <List size={14} /> : <LayoutGrid size={14} />}
                </button>
              </div>
            </div>
          )}

          <div className={`sidebar-list ${libGrid && !collapsed ? 'grid-mode' : ''}`}>
            <NavLink to="/liked" className={({ isActive }) => `lib-item ${isActive ? 'active' : ''} ${libGrid && !collapsed ? 'lib-item-grid' : ''}`}>
              <div
                style={{
                  width: libGrid && !collapsed ? '100%' : 44,
                  height: libGrid && !collapsed ? 'auto' : 44,
                  aspectRatio: '1/1',
                  borderRadius: 6,
                  background: 'var(--sonic-gradient)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Heart size={20} fill="#fff" color="#fff" />
              </div>
              {!collapsed && (
                <div className="lib-item-meta">
                  <div className="lib-item-title">Liked Songs</div>
                  <div className="lib-item-sub">
                    <Pin size={11} color="var(--accent)" /> Playlist · {likedCount} songs
                  </div>
                </div>
              )}
            </NavLink>

            <NavLink to="/recent" className={({ isActive }) => `lib-item ${isActive ? 'active' : ''} ${libGrid && !collapsed ? 'lib-item-grid' : ''}`}>
              <div
                style={{
                  width: libGrid && !collapsed ? '100%' : 44,
                  height: libGrid && !collapsed ? 'auto' : 44,
                  aspectRatio: '1/1',
                  borderRadius: 6,
                  background: 'var(--surface-active)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Clock size={19} color="var(--text-muted)" />
              </div>
              {!collapsed && (
                <div className="lib-item-meta">
                  <div className="lib-item-title">Recently Played</div>
                  <div className="lib-item-sub">Listening history</div>
                </div>
              )}
            </NavLink>

            {libRows.map((row) => (
              <NavLink
                key={row.key}
                to={row.to}
                className={({ isActive }) =>
                  `lib-item ${isActive ? 'active' : ''} ${libGrid && !collapsed ? 'lib-item-grid' : ''} ${row.kind === 'playlist' && dropPlaylistId === row.id ? 'drag-over' : ''}`
                }
                onDragOver={(e) => {
                  if (row.kind !== 'playlist') return;
                  e.preventDefault();
                  setDropPlaylistId(row.id);
                }}
                onDragLeave={() => setDropPlaylistId(null)}
                onDrop={(e) => {
                  if (row.kind !== 'playlist') return;
                  e.preventDefault();
                  setDropPlaylistId(null);
                  const raw = e.dataTransfer.getData('application/x-omnitune-track');
                  if (!raw) return;
                  try {
                    const track = JSON.parse(raw) as Track;
                    library.addToPlaylist(row.id, [track]);
                    toast(`Added "${track.title}" to ${row.title}`);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                <div style={libGrid && !collapsed ? { width: '100%', aspectRatio: '1/1' } : undefined}>{row.art}</div>
                {!collapsed && (
                  <div className="lib-item-meta">
                    <div className="lib-item-title">{row.title}</div>
                    <div className="lib-item-sub">
                      {row.kind === 'playlist' && row.pinned && <Pin size={11} color="var(--accent)" />}
                      {row.sub}
                    </div>
                  </div>
                )}
              </NavLink>
            ))}
          </div>
        </aside>

        {!collapsed && (
          <div
            className={`sidebar-resizer ${draggingResize ? 'dragging' : ''}`}
            onMouseDown={() => setDraggingResize(true)}
            aria-hidden="true"
          />
        )}

        <main className="main-pane">
          <Outlet />
        </main>

        <RightPanel />
      </div>

      {/* ==================== DESKTOP PLAYER BAR ==================== */}
      <footer className="player-bar" aria-label="Playback controls">
        <div className="player-left">
          {cur ? (
            <>
              <button onClick={() => toggleRightPanel('now-playing')} style={{ borderRadius: 6, overflow: 'hidden' }}>
                <Artwork url={cur.artworkUrl} size={120} renderSize={54} alt={cur.title} seed={cur.id} />
              </button>
              <div className="player-track-meta">
                <div className="player-title-row">
                  <Link to={cur.albumId ? `/album/${cur.albumId}` : '#'} className="player-title">
                    {cur.title}
                  </Link>
                  {showPreview && <span className="badge-preview">Preview</span>}
                </div>
                <div className="player-artist">
                  {cur.artistId ? <Link to={`/artist/${cur.artistId}`}>{cur.artistName}</Link> : cur.artistName}
                </div>
              </div>
              <button
                className={`icon-btn ${curLiked ? 'liked' : ''}`}
                aria-label={curLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                onClick={() => {
                  const liked = library.toggleLike(cur);
                  toast(liked ? 'Added to Liked Songs' : 'Removed from Liked Songs');
                }}
              >
                <Heart size={16} fill={curLiked ? 'currentColor' : 'none'} />
              </button>
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing playing</div>
          )}
        </div>

        <div className="player-center">
          <div className="transport-row">
            {isEpisode ? (
              <button
                className="chip"
                style={{ height: 26, fontSize: 11.5 }}
                onClick={() => {
                  const rates = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];
                  const next = rates[(rates.indexOf(st.rate) + 1) % rates.length];
                  player.setRate(next);
                }}
                title="Playback speed"
              >
                {st.rate}×
              </button>
            ) : (
              <button
                className={`icon-btn ${st.shuffle ? 'active' : ''}`}
                aria-label="Smart Shuffle"
                title={st.shuffle ? 'Shuffle on' : 'Shuffle off'}
                onClick={() => player.toggleShuffle()}
              >
                <Shuffle size={16} />
              </button>
            )}

            {isEpisode && (
              <button className="icon-btn" aria-label="Rewind 15 seconds" onClick={() => player.seekBy(-15000)}>
                <RotateCcw size={16} />
              </button>
            )}

            <button className="icon-btn" aria-label="Previous" disabled={!remoteDev && !st.canPrevious} onClick={onPrevTrack}>
              <SkipBack size={18} fill="currentColor" />
            </button>

            <button className="transport-play" aria-label={displayPlaying ? 'Pause' : 'Play'} disabled={!cur && !remoteDev} onClick={onTogglePlay}>
              {displayPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
            </button>

            <button className="icon-btn" aria-label="Next" disabled={!remoteDev && !st.canNext} onClick={onNextTrack}>
              <SkipForward size={18} fill="currentColor" />
            </button>

            {isEpisode ? (
              <button className="icon-btn" aria-label="Forward 30 seconds" onClick={() => player.seekBy(30000)}>
                <RotateCw size={16} />
              </button>
            ) : (
              <button
                className={`icon-btn ${st.repeat !== 'off' ? 'active' : ''}`}
                aria-label={`Repeat: ${st.repeat}`}
                onClick={() => player.cycleRepeat()}
              >
                {st.repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
              </button>
            )}
          </div>

          <div className="seek-row">
            <span>{formatDuration(positionMs)}</span>
            <input
              type="range"
              className="range-slider"
              aria-label="Seek"
              min={0}
              max={Math.max(1, durationMs)}
              value={Math.min(positionMs, durationMs || 1)}
              disabled={!cur}
              onChange={(e) => player.seek(Number(e.target.value))}
            />
            <span>{formatDuration(durationMs)}</span>
          </div>
        </div>

        <div className="player-right">
          <button
            className={`icon-btn ${rightPanel === 'lyrics' ? 'active' : ''}`}
            aria-label="Lyrics"
            title="Lyrics"
            onClick={() => toggleRightPanel('lyrics')}
          >
            <Mic2 size={16} />
          </button>
          <button
            className={`icon-btn ${rightPanel === 'queue' ? 'active' : ''}`}
            aria-label="Queue"
            title="Queue (Q)"
            onClick={() => toggleRightPanel('queue')}
          >
            <ListMusic size={16} />
          </button>
          <button
            className={`icon-btn ${rightPanel === 'devices' || remoteDev ? 'active' : ''}`}
            aria-label="Connect to a device"
            title={remoteDev ? `Listening on ${remoteDev.name}` : 'Connect to a device (D)'}
            onClick={() => toggleRightPanel('devices')}
          >
            <MonitorSpeaker size={16} />
          </button>
          <button
            className={`icon-btn ${st.sleep ? 'active' : ''}`}
            aria-label="Sleep timer"
            title="Sleep timer"
            onClick={() => setSleepModalOpen(true)}
          >
            <Moon size={16} />
          </button>
          <Link to="/settings#eq" className="icon-btn" aria-label="Equalizer" title="Equalizer">
            <Sliders size={16} />
          </Link>
          <div className="vol-wrap">
            <button className="icon-btn" aria-label={st.muted ? 'Unmute' : 'Mute'} onClick={() => player.toggleMute()}>
              {st.muted || st.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range"
              className="range-slider"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.02}
              value={remoteDev ? remoteDev.volume : st.muted ? 0 : st.volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
            />
          </div>
          <button className="icon-btn" aria-label="Fullscreen player" title="Fullscreen" disabled={!cur} onClick={() => setFullscreen(true)}>
            <Maximize2 size={15} />
          </button>
        </div>
      </footer>

      {/* ==================== MOBILE-WEB MINI PLAYER & NAV ==================== */}
      {cur && (
        <div className="mobile-mini-player" onClick={() => setFullscreen(true)} role="button" tabIndex={0}>
          <Artwork url={cur.artworkUrl} size={100} renderSize={42} alt={cur.title} seed={cur.id} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cur.title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {cur.artistName}
            </div>
          </div>
          <button
            className="icon-btn"
            aria-label={st.playing ? 'Pause' : 'Play'}
            onClick={(e) => {
              e.stopPropagation();
              void player.toggle();
            }}
          >
            {st.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <button
            className="icon-btn"
            aria-label="Next"
            onClick={(e) => {
              e.stopPropagation();
              void player.next();
            }}
          >
            <SkipForward size={18} fill="currentColor" />
          </button>
        </div>
      )}

      <nav className="mobile-nav" aria-label="Primary navigation">
        <NavLink to="/" end>
          <Home size={20} />
          <span>Home</span>
        </NavLink>
        <NavLink to="/search">
          <Search size={20} />
          <span>Search</span>
        </NavLink>
        <NavLink to="/radio">
          <Radio size={20} />
          <span>Radio</span>
        </NavLink>
        <NavLink to="/library">
          <Library size={20} />
          <span>Library</span>
        </NavLink>
      </nav>

      {/* ==================== OMNITUNE CONNECT REMOTE BANNER ==================== */}
      {remoteDev && (
        <button className="connect-banner hide-mobile" onClick={() => toggleRightPanel('devices')}>
          <MonitorSpeaker size={14} />
          <span>Listening on {remoteDev.name}</span>
        </button>
      )}

      {/* ==================== OVERLAYS ==================== */}
      <ContextMenu />
      <PlaylistModal />
      <SleepTimerModal />
      <FullscreenPlayer />
      <ToastStack />
    </div>
  );
}
