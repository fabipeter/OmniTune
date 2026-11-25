import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { activeLyricIndex, buildRadio, fetchLyrics, type ConnectDeviceType, type Lyrics, type Track } from '@omnitune/core';
import { Globe, Heart, Laptop, MonitorSpeaker, MoreHorizontal, Radio, RefreshCw, Smartphone, Trash2, X } from 'lucide-react';
import { API_URL, audioEngine, catalog, connectClient, library, player } from '../app/services';
import { useConnect, useLibraryVersion, usePlayer, useProgress, useSyncUser } from '../hooks/useStore';
import { useUi } from '../app/uiContext';
import { Artwork } from './Artwork';

export function LyricsView({ track }: { track: Track | null }) {
  const { positionMs } = useProgress();
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [loading, setLoading] = useState(false);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!track || track.kind !== 'song') {
      setLyrics(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setLyrics(null);
    void fetchLyrics(track).then((res) => {
      if (alive) {
        setLyrics(res);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [track?.id]);

  const activeIdx = lyrics?.synced ? activeLyricIndex(lyrics.synced, positionMs) : -1;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeIdx]);

  if (!track) return <div className="empty-state">Play a song to view synced lyrics.</div>;
  if (track.kind === 'episode') return <div className="empty-state">Lyrics are not available for podcast episodes.</div>;
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 20, width: `${55 + ((i * 19) % 40)}%` }} />
        ))}
      </div>
    );
  }
  if (!lyrics) return <div className="empty-state">No lyrics found on LRCLIB for this track.</div>;
  if (lyrics.instrumental) return <div className="empty-state">Instrumental track</div>;

  if (lyrics.synced?.length) {
    return (
      <div className="lyrics-view">
        {lyrics.synced.map((line, i) => {
          const isActive = i === activeIdx;
          return (
            <button
              key={`${line.timeMs}-${i}`}
              ref={isActive ? activeRef : undefined}
              className={`lyric-line ${isActive ? 'active' : i < activeIdx ? 'past' : ''}`}
              onClick={() => player.seek(line.timeMs)}
            >
              {line.text || '♪'}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 15, color: 'var(--text-muted)' }}>
      {lyrics.plain || 'No lyrics available.'}
    </div>
  );
}

export function QueueView() {
  const st = usePlayer();
  const { openContextMenu } = useUi();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [tab, setTab] = useState<'queue' | 'recent'>('queue');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="chip-row">
        <button className={`chip ${tab === 'queue' ? 'active' : ''}`} onClick={() => setTab('queue')}>
          Queue
        </button>
        <button className={`chip ${tab === 'recent' ? 'active' : ''}`} onClick={() => setTab('recent')}>
          Recently played
        </button>
      </div>

      {tab === 'recent' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {st.played.length === 0 ? (
            <div className="empty-state">Nothing played in this session yet.</div>
          ) : (
            [...st.played].reverse().map((t, i) => (
              <div
                key={`${t.id}-${i}`}
                className="lib-item"
                role="button"
                tabIndex={0}
                onClick={() => void player.playTrack(t)}
                onContextMenu={(e) => openContextMenu(e, t)}
              >
                <Artwork url={t.artworkUrl} size={100} renderSize={40} alt={t.title} seed={t.id} />
                <div className="lib-item-meta">
                  <div className="lib-item-title">{t.title}</div>
                  <div className="lib-item-sub">{t.artistName}</div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          {st.current && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>NOW PLAYING</div>
              <div className="lib-item active" onContextMenu={(e) => openContextMenu(e, st.current!)}>
                <Artwork url={st.current.artworkUrl} size={100} renderSize={42} alt={st.current.title} seed={st.current.id} />
                <div className="lib-item-meta">
                  <div className="lib-item-title" style={{ color: 'var(--accent)' }}>
                    {st.current.title}
                  </div>
                  <div className="lib-item-sub">{st.current.artistName}</div>
                </div>
              </div>
            </div>
          )}

          {st.userQueue.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>NEXT IN QUEUE</span>
                <button className="chip" style={{ height: 24, fontSize: 11 }} onClick={() => player.clearQueue()}>
                  Clear
                </button>
              </div>
              {st.userQueue.map((item, idx) => (
                <div
                  key={item.uid}
                  className="lib-item"
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIdx !== null && dragIdx !== idx) player.moveInQueue(dragIdx, idx);
                    setDragIdx(null);
                  }}
                  onClick={() => void player.skipToQueueItem(item.uid)}
                  onContextMenu={(e) => openContextMenu(e, item.track)}
                >
                  <Artwork url={item.track.artworkUrl} size={100} renderSize={40} alt={item.track.title} seed={item.track.id} />
                  <div className="lib-item-meta">
                    <div className="lib-item-title">{item.track.title}</div>
                    <div className="lib-item-sub">{item.track.artistName}</div>
                  </div>
                  <button
                    className="icon-btn"
                    aria-label="Remove from queue"
                    onClick={(e) => {
                      e.stopPropagation();
                      player.removeFromQueue(item.uid);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
              {st.context?.name ? `NEXT FROM: ${st.context.name.toUpperCase()}` : 'UP NEXT'}
            </div>
            {st.upNext.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 4px' }}>
                {st.loadingAutoplay ? 'Building autoplay radio…' : 'Autoplay radio will continue when this track ends.'}
              </div>
            ) : (
              st.upNext.slice(0, 40).map((t, idx) => (
                <div
                  key={`${t.id}-${idx}`}
                  className="lib-item"
                  onClick={() => void player.skipToUpNext(idx)}
                  onContextMenu={(e) => openContextMenu(e, t)}
                >
                  <Artwork url={t.artworkUrl} size={100} renderSize={40} alt={t.title} seed={t.id} />
                  <div className="lib-item-meta">
                    <div className="lib-item-title">{t.title}</div>
                    <div className="lib-item-sub">{t.artistName}</div>
                  </div>
                  <button
                    className="icon-btn"
                    aria-label="Remove from up next"
                    onClick={(e) => {
                      e.stopPropagation();
                      player.removeFromUpNext(idx);
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DeviceIcon({ type }: { type: ConnectDeviceType }) {
  if (type === 'ios' || type === 'android') return <Smartphone size={20} />;
  if (type === 'desktop-mac' || type === 'desktop-win') return <Laptop size={20} />;
  return <Globe size={20} />;
}

export function DevicesView() {
  const connect = useConnect();
  const user = useSyncUser();
  const st = usePlayer();
  const { toast } = useUi();
  const [roomInput, setRoomInput] = useState(connect.roomCode);

  useEffect(() => {
    setRoomInput(connect.roomCode);
  }, [connect.roomCode]);

  const active = connect.devices.find((d) => d.isActive) ?? null;
  const others = connect.devices.filter((d) => !d.isActive);

  const transfer = async (id: string, name: string) => {
    try {
      await connectClient.transferTo(id, true);
      toast(`Switched playback to ${name}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to switch device');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
          <MonitorSpeaker size={18} color="var(--accent)" /> Connect to a device
        </div>
        <button className="icon-btn" title="Reconnect" aria-label="Reconnect" onClick={() => connectClient.reconnect()}>
          <RefreshCw size={14} />
        </button>
      </div>

      {!connect.connected ? (
        <div
          style={{
            background: 'var(--surface-elevated)',
            borderRadius: 10,
            padding: 14,
            fontSize: 13,
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Connect server offline</div>
          <div>
            Start the OmniTune sync server (<code>pnpm dev:server</code> at <code>{API_URL}</code>) to discover your Web, Desktop,
            iOS, and Android devices and switch playback between them in real time.
          </div>
          <button className="pill-btn primary" style={{ marginTop: 12 }} onClick={() => connectClient.reconnect()}>
            Retry connection
          </button>
        </div>
      ) : (
        <>
          {/* Current Active Device */}
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>CURRENT DEVICE</div>
            {active ? (
              <div className="device-card active">
                <span style={{ color: 'var(--accent)' }}>
                  <DeviceIcon type={active.type} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>
                    {active.id === connect.thisDeviceId ? `This ${active.name}` : active.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {active.playing || (active.id === connect.thisDeviceId && st.playing)
                      ? active.currentTrack?.title || st.current?.title || 'Playing'
                      : 'Ready to play'}
                  </div>
                </div>
                {(active.playing || (active.id === connect.thisDeviceId && st.playing)) && (
                  <div className="eq-bars" aria-label="Playing">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </div>
            ) : (
              <div className="device-card active">
                <span style={{ color: 'var(--accent)' }}>
                  <DeviceIcon type={connect.thisDeviceType} />
                </span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>This {connect.thisDeviceName}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Connected</div>
                </div>
              </div>
            )}
          </div>

          {/* Other Connected Devices */}
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>SELECT ANOTHER DEVICE</div>
            {others.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '6px 2px', lineHeight: 1.5 }}>
                Open OmniTune on another device (Desktop, Web, iOS, or Android) {user ? 'signed into the same account' : `using room "${connect.roomCode}"`} and it will appear here instantly.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {others.map((dev) => (
                  <button key={dev.id} className="device-card" onClick={() => void transfer(dev.id, dev.name)}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      <DeviceIcon type={dev.type} />
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                        {dev.id === connect.thisDeviceId ? `This ${dev.name}` : dev.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {dev.id === connect.thisDeviceId ? 'Switch playback back here' : 'Click to transfer playback'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Room pairing for guest / local multi-device testing without login */}
      {!user && (
        <form
          style={{
            background: 'var(--surface-elevated)',
            borderRadius: 10,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
          onSubmit={(e) => {
            e.preventDefault();
            void connectClient.setRoomCode(roomInput);
            toast(`Connect room set to "${roomInput || 'local'}"`);
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700 }}>Guest pairing room</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            Match this code on your phone or desktop (or sign in to pair automatically across devices).
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="text-input"
              style={{ padding: '6px 10px', fontSize: 13 }}
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              placeholder="local"
            />
            <button type="submit" className="pill-btn" style={{ height: 34 }}>
              Join
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function RightPanel() {
  useLibraryVersion();
  const st = usePlayer();
  const { rightPanel, setRightPanel, openContextMenu, toast } = useUi();

  if (!rightPanel) return null;

  const track = st.current;
  const liked = track ? library.isLiked(track.id) : false;
  const showPreview = track?.isPreview && !audioEngine.fullSongsEnabled;

  const startRadio = async () => {
    if (!track) return;
    toast(`Starting radio from ${track.title}…`);
    const radio = await buildRadio(track, catalog, library.taste(), { explicitFilter: library.getSettings().explicitFilter });
    if (radio.length) void player.play(radio, { context: { type: 'radio', name: `Radio · ${track.title}` }, shuffle: false });
  };

  return (
    <aside className="right-panel" aria-label="Now playing sidebar">
      <div className="right-tabs">
        <div className="right-tab-group">
          <button className={`chip ${rightPanel === 'now-playing' ? 'active' : ''}`} onClick={() => setRightPanel('now-playing')}>
            Playing
          </button>
          <button className={`chip ${rightPanel === 'queue' ? 'active' : ''}`} onClick={() => setRightPanel('queue')}>
            Queue
          </button>
          <button className={`chip ${rightPanel === 'lyrics' ? 'active' : ''}`} onClick={() => setRightPanel('lyrics')}>
            Lyrics
          </button>
          <button className={`chip ${rightPanel === 'devices' ? 'active' : ''}`} onClick={() => setRightPanel('devices')}>
            Devices
          </button>
        </div>
        <button className="icon-btn" aria-label="Close side panel" onClick={() => setRightPanel(null)}>
          <X size={16} />
        </button>
      </div>

      <div className="right-body">
        {rightPanel === 'now-playing' && (
          <>
            {!track ? (
              <div className="empty-state">
                <p>Select any song, album, mix, or podcast to start listening.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {st.context?.name && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{st.context.name}</div>}
                <div style={{ width: '100%', aspectRatio: '1/1', borderRadius: 10, overflow: 'hidden' }}>
                  <Artwork url={track.artworkUrl} size={600} alt={track.title} seed={track.id} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {track.albumId ? <Link to={`/album/${track.albumId}`}>{track.title}</Link> : track.title}
                    </div>
                    <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      {track.artistId ? <Link to={`/artist/${track.artistId}`}>{track.artistName}</Link> : track.artistName}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className={`icon-btn ${liked ? 'liked' : ''}`}
                      aria-label={liked ? 'Unlike' : 'Like'}
                      onClick={() => {
                        const now = library.toggleLike(track);
                        toast(now ? 'Added to Liked Songs' : 'Removed from Liked Songs');
                      }}
                    >
                      <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
                    </button>
                    <button className="icon-btn" aria-label="Track options" onClick={(e) => openContextMenu(e, track)}>
                      <MoreHorizontal size={18} />
                    </button>
                  </div>
                </div>

                {showPreview && (
                  <div
                    style={{
                      background: 'var(--surface-elevated)',
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 12.5,
                      color: 'var(--text-muted)',
                      lineHeight: 1.45,
                    }}
                  >
                    <span className="badge-preview" style={{ marginBottom: 6 }}>
                      30s Preview
                    </span>
                    <div>
                      Playing 30s AAC preview. Connect MusicKit in <Link to="/settings" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Settings</Link> for full tracks.
                    </div>
                  </div>
                )}

                {track.kind === 'song' && (
                  <button className="pill-btn" style={{ justifyContent: 'center' }} onClick={() => void startRadio()}>
                    <Radio size={15} /> Start Song Radio
                  </button>
                )}

                {(st.userQueue[0] || st.upNext[0]) && (
                  <div style={{ background: 'var(--surface-elevated)', borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>NEXT IN QUEUE</span>
                      <button style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }} onClick={() => setRightPanel('queue')}>
                        Open queue
                      </button>
                    </div>
                    {(() => {
                      const next = st.userQueue[0]?.track ?? st.upNext[0];
                      return (
                        <div className="lib-item" style={{ padding: 4 }} onClick={() => void player.next()}>
                          <Artwork url={next.artworkUrl} size={100} renderSize={40} alt={next.title} seed={next.id} />
                          <div className="lib-item-meta">
                            <div className="lib-item-title">{next.title}</div>
                            <div className="lib-item-sub">{next.artistName}</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {rightPanel === 'queue' && <QueueView />}
        {rightPanel === 'lyrics' && <LyricsView track={track} />}
        {rightPanel === 'devices' && <DevicesView />}
      </div>
    </aside>
  );
}
