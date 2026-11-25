import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration, type PlaybackContext, type Track } from '@omnitune/core';
import { Clock3, Heart, MoreHorizontal, Pause, Play } from 'lucide-react';
import { library, player } from '../app/services';
import { useLibraryVersion, usePlayer } from '../hooks/useStore';
import { useUi } from '../app/uiContext';
import { Artwork } from './Artwork';

interface TrackListProps {
  tracks: Track[];
  context: PlaybackContext;
  showAlbum?: boolean;
  showArtwork?: boolean;
  playlistId?: string;
  onReorder?: (from: number, to: number) => void;
  compact?: boolean;
}

export function TrackList({
  tracks,
  context,
  showAlbum = true,
  showArtwork = true,
  playlistId,
  onReorder,
  compact = false,
}: TrackListProps) {
  useLibraryVersion();
  const st = usePlayer();
  const { openContextMenu, toast } = useUi();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const playAt = (index: number) => {
    const t = tracks[index];
    if (!t.audioUrl) return;
    if (st.current?.id === t.id) {
      void player.toggle();
      return;
    }
    void player.play(tracks, { startIndex: index, context });
  };

  if (!tracks.length) return null;

  return (
    <div className={compact ? '' : 'track-table-wrap'}>
      {!compact && (
        <div className={`track-head ${!showAlbum ? 'compact' : ''}`}>
          <span style={{ textAlign: 'center' }}>#</span>
          <span>Title</span>
          {showAlbum && <span>Album</span>}
          <span style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 10 }}>
            <Clock3 size={14} />
          </span>
        </div>
      )}

      {tracks.map((track, idx) => {
        const isCurrent = st.current?.id === track.id;
        const isPlaying = isCurrent && st.playing;
        const liked = library.isLiked(track.id);
        const progress = track.kind === 'episode' ? library.episodeProgress(track.id) : 0;
        const pct = progress > 0 && track.durationMs > 0 ? Math.min(100, (progress / track.durationMs) * 100) : 0;

        return (
          <div
            key={`${track.id}-${idx}`}
            className={`track-row ${!showAlbum || compact ? 'compact' : ''} ${isCurrent ? 'current' : ''} ${!track.audioUrl ? 'unplayable' : ''} ${overIdx === idx ? 'drag-over' : ''}`}
            draggable
            onDragStart={(e) => {
              setDragIdx(idx);
              e.dataTransfer.setData('application/x-omnitune-track', JSON.stringify(track));
              e.dataTransfer.effectAllowed = 'copyMove';
            }}
            onDragOver={(e) => {
              if (!onReorder) return;
              e.preventDefault();
              setOverIdx(idx);
            }}
            onDragLeave={() => setOverIdx(null)}
            onDrop={(e) => {
              if (!onReorder || dragIdx === null || dragIdx === idx) return;
              e.preventDefault();
              onReorder(dragIdx, idx);
              setDragIdx(null);
              setOverIdx(null);
            }}
            onDragEnd={() => {
              setDragIdx(null);
              setOverIdx(null);
            }}
            onDoubleClick={() => playAt(idx)}
            onContextMenu={(e) => openContextMenu(e, track, playlistId)}
          >
            <div className="track-idx">
              {isPlaying ? (
                <div className="eq-bars" aria-label="Playing">
                  <span />
                  <span />
                  <span />
                </div>
              ) : (
                <span className="row-num">{idx + 1}</span>
              )}
              <button className="row-play-icon" aria-label={isPlaying ? 'Pause' : `Play ${track.title}`} onClick={() => playAt(idx)}>
                {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
              </button>
            </div>

            <div className="track-main">
              {showArtwork && <Artwork url={track.artworkUrl} size={100} renderSize={40} alt={track.title} seed={track.id} />}
              <div className="track-info">
                <div className="track-title" onClick={() => playAt(idx)} style={{ cursor: 'pointer' }}>
                  {track.title}
                </div>
                <div className="track-artist">
                  {track.explicit && <span className="badge-e" title="Explicit">E</span>}
                  {track.artistId ? (
                    <Link to={`/artist/${track.artistId}`} onClick={(e) => e.stopPropagation()}>
                      {track.artistName}
                    </Link>
                  ) : (
                    <span>{track.artistName}</span>
                  )}
                </div>
                {pct > 0 && (
                  <div style={{ marginTop: 4, height: 3, width: 120, background: 'var(--surface-active)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2 }} />
                  </div>
                )}
              </div>
            </div>

            {showAlbum && !compact && (
              <div className="track-album">
                {track.albumId ? <Link to={`/album/${track.albumId}`}>{track.albumName}</Link> : track.albumName || '—'}
              </div>
            )}

            <div className="track-end">
              <button
                className={`icon-btn hover-reveal ${liked ? 'liked always' : ''}`}
                aria-label={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                onClick={(e) => {
                  e.stopPropagation();
                  const nowLiked = library.toggleLike(track);
                  toast(nowLiked ? 'Added to Liked Songs' : 'Removed from Liked Songs');
                }}
              >
                <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
              </button>
              <span style={{ minWidth: 38, textAlign: 'right' }}>{formatDuration(track.durationMs)}</span>
              <button
                className="icon-btn hover-reveal"
                aria-label="More options"
                onClick={(e) => openContextMenu(e, track, playlistId)}
              >
                <MoreHorizontal size={16} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
