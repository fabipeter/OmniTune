import { useEffect, useState } from 'react';
import { artworkAt, colorFromString } from '@omnitune/core';
import { Music } from 'lucide-react';
import { catalog } from '../app/services';

interface ArtworkProps {
  url?: string;
  size?: number;
  renderSize?: number;
  alt?: string;
  round?: boolean;
  seed?: string;
  className?: string;
}

export function Artwork({ url, size = 300, renderSize, alt = '', round, seed = '', className = '' }: ArtworkProps) {
  const [failed, setFailed] = useState(false);
  const src = url ? artworkAt(url, size) : '';
  const style: React.CSSProperties = {
    width: renderSize ? `${renderSize}px` : '100%',
    height: renderSize ? `${renderSize}px` : '100%',
    borderRadius: round ? '50%' : '6px',
    flexShrink: 0,
    objectFit: 'cover',
    display: 'block',
    background: colorFromString(seed || alt || 'omnitune', 42, 24),
  };

  if (!src || failed) {
    return (
      <div
        className={className}
        style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)' }}
        aria-label={alt}
      >
        <Music size={renderSize ? Math.max(14, Math.round(renderSize * 0.42)) : 32} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
      style={style}
    />
  );
}

export function MosaicArtwork({ urls, renderSize, seed = 'mix' }: { urls: string[]; renderSize?: number; seed?: string }) {
  const clean = urls.filter(Boolean).slice(0, 4);
  const dim = renderSize ? { width: renderSize, height: renderSize } : { width: '100%', height: '100%' };
  if (clean.length < 4) return <Artwork url={clean[0]} renderSize={renderSize} seed={seed} />;
  return (
    <div
      style={{
        ...dim,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        borderRadius: 6,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {clean.map((u, i) => (
        <img key={i} src={artworkAt(u, 200)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ))}
    </div>
  );
}

const artistArtCache = new Map<string, string>();

export function ArtistAvatar({ artistId, initialUrl, name, renderSize }: { artistId: string; initialUrl?: string; name: string; renderSize?: number }) {
  const [url, setUrl] = useState<string | undefined>(initialUrl || artistArtCache.get(artistId));

  useEffect(() => {
    if (url || !artistId) return;
    let alive = true;
    void catalog.getArtistArtwork(artistId).then((found) => {
      if (found) {
        artistArtCache.set(artistId, found);
        if (alive) setUrl(found);
      }
    });
    return () => {
      alive = false;
    };
  }, [artistId, url]);

  return <Artwork url={url} alt={name} seed={name} round renderSize={renderSize} />;
}
