import {
  AppleCatalog,
  ConnectClient,
  LibraryStore,
  MemoryStorage,
  PlayerController,
  SyncClient,
  artworkAt,
  buildRadio,
  type ConnectDeviceType,
  type KeyValueStorage,
} from '@omnitune/core';
import { WebAudioEngine } from '../audio/WebAudioEngine';
import { HybridAudioEngine } from '../audio/MusicKitEngine';

const browserStorage: KeyValueStorage = {
  getItem: (id) => {
    try {
      return window.localStorage.getItem(id);
    } catch {
      return null;
    }
  },
  setItem: (id, value) => {
    try {
      window.localStorage.setItem(id, value);
    } catch {
      /* quota exceeded */
    }
  },
  removeItem: (id) => {
    try {
      window.localStorage.removeItem(id);
    } catch {
      /* ignore */
    }
  },
};

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function resolveApiBaseUrl(configured?: string): string {
  if (configured) {
    const parsed = new URL(configured);
    const isHttps = parsed.protocol === 'https:';
    const isLoopback = parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname);
    if (!isHttps && !isLoopback) {
      throw new Error('VITE_API_URL must use HTTPS (HTTP is only allowed for localhost)');
    }
    return parsed.origin + parsed.pathname.replace(/\/$/, '');
  }
  return new URL('http://localhost:8787').origin;
}

export const API_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const useServerCatalog = import.meta.env.VITE_USE_SERVER_CATALOG === '1';

export const library = new LibraryStore(browserStorage);

export const catalog = new AppleCatalog({
  country: library.getSettings().country,
  ...(useServerCatalog ? { itunesBase: `${API_URL}/catalog/itunes`, rssBase: `${API_URL}/catalog/rss` } : {}),
});

export const webAudioEngine = new WebAudioEngine();

async function fetchAppleDevToken(): Promise<string | null> {
  if (import.meta.env.VITE_APPLE_DEV_TOKEN) return import.meta.env.VITE_APPLE_DEV_TOKEN;
  try {
    const endpoint = new URL('/apple/developer-token', `${API_URL}/`);
    if (endpoint.protocol !== 'https:' && !LOOPBACK_HOSTS.has(endpoint.hostname)) return null;
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string };
    return data.token ?? null;
  } catch {
    return null;
  }
}

export const audioEngine = new HybridAudioEngine(webAudioEngine, fetchAppleDevToken);

export const player = new PlayerController({
  engine: audioEngine,
  getSettings: () => library.getSettings(),
  getTaste: () => library.taste(),
  autoplay: (seed, taste) => buildRadio(seed, catalog, taste, { explicitFilter: library.getSettings().explicitFilter }),
  onPlayed: (e) => library.recordPlay(e),
  onEpisodeProgress: (id, ms) => library.setEpisodeProgress(id, ms),
  getEpisodeProgress: (id) => library.episodeProgress(id),
});

// Keep auth state strictly in memory (never persisted in Web Storage).
const inMemoryStore = new MemoryStorage();

export const syncClient = new SyncClient({
  baseUrl: API_URL,
  storage: inMemoryStore,
});

function detectDevice(): { name: string; type: ConnectDeviceType } {
  if (window.omnitune?.isDesktop) {
    if (window.omnitune.platform === 'darwin') return { name: 'Mac Desktop', type: 'desktop-mac' };
    return { name: 'Windows Desktop', type: 'desktop-win' };
  }
  const ua = navigator.userAgent;
  const browser = ua.includes('Edg/')
    ? 'Edge'
    : ua.includes('Chrome/')
      ? 'Chrome'
      : ua.includes('Firefox/')
        ? 'Firefox'
        : ua.includes('Safari/')
          ? 'Safari'
          : 'Browser';
  return { name: `Web Player (${browser})`, type: 'web' };
}

const detected = detectDevice();
export const connectClient = new ConnectClient({
  baseUrl: API_URL,
  deviceName: detected.name,
  deviceType: detected.type,
  storage: browserStorage,
  player,
  syncClient,
});

// ---- Apply UI preferences reactively (theme, EQ, normalize, country) ----
function applySettings() {
  const s = library.getSettings();
  catalog.setCountry(s.country);
  webAudioEngine.setEq(s.eq);
  webAudioEngine.setNormalize(s.normalizeVolume);
  const isLight =
    s.theme === 'light' || (s.theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
}

void library.ready.then(() => {
  applySettings();
  restorePlaybackQueue();
});

let syncTimer: ReturnType<typeof setTimeout> | undefined;
library.subscribe(() => {
  applySettings();
  if (syncClient.signedIn) {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void syncClient.sync(library).catch(() => undefined), 3000);
  }
});

// Auto-sync on launch and window focus when signed in
void syncClient.ready.then(() => {
  if (syncClient.signedIn) void syncClient.sync(library).catch(() => undefined);
});
window.addEventListener('focus', () => {
  if (syncClient.signedIn) void syncClient.sync(library).catch(() => undefined);
});

// ---- Persist & restore non-sensitive playback queue state ----
const PLAYBACK_STORAGE_ID = 'omnitune.playback.v1';
let playbackSaveTimer: ReturnType<typeof setTimeout> | undefined;

type PlaybackRestoreData = Parameters<typeof player.restore>[0];

function savePlaybackQueue() {
  const snap = player.snapshot();
  if (!snap.current) return;
  browserStorage.setItem(PLAYBACK_STORAGE_ID, JSON.stringify(snap));
}

function restorePlaybackQueue() {
  const raw = browserStorage.getItem(PLAYBACK_STORAGE_ID) as string | null;
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as PlaybackRestoreData;
    if (parsed && typeof parsed === 'object' && parsed.current) {
      void player.restore(parsed);
    }
  } catch {
    /* ignore */
  }
}

player.subscribe(() => {
  if (playbackSaveTimer) clearTimeout(playbackSaveTimer);
  playbackSaveTimer = setTimeout(savePlaybackQueue, 1200);
  updateMediaSession();
  updateDesktopNowPlaying();
});
window.addEventListener('beforeunload', savePlaybackQueue);

// ---- Media Session API (browser/OS lock-screen & hardware keys) ----
function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const st = player.getState();
  if (!st.current) return;
  const t = st.current;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artistName,
    album: t.albumName ?? '',
    artwork: t.artworkUrl
      ? [
          { src: artworkAt(t.artworkUrl, 128), sizes: '128x128', type: 'image/jpeg' },
          { src: artworkAt(t.artworkUrl, 512), sizes: '512x512', type: 'image/jpeg' },
        ]
      : [],
  });
  navigator.mediaSession.playbackState = st.playing ? 'playing' : 'paused';
}

if ('mediaSession' in navigator) {
  const safe = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      /* unsupported action */
    }
  };
  safe('play', () => void player.resume());
  safe('pause', () => player.pause());
  safe('previoustrack', () => void player.previous());
  safe('nexttrack', () => void player.next());
  safe('seekto', (d) => d.seekTime != null && player.seek(d.seekTime * 1000));
  safe('seekbackward', (d) => player.seekBy(-(d.seekOffset ?? 15) * 1000));
  safe('seekforward', (d) => player.seekBy((d.seekOffset ?? 15) * 1000));
}

// ---- Desktop (Electron) integration ----
function updateDesktopNowPlaying() {
  if (!window.omnitune?.isDesktop) return;
  const st = player.getState();
  const title = st.current ? `${st.current.title} — ${st.current.artistName}` : 'OmniTune';
  window.omnitune.setNowPlaying({ title, playing: st.playing });
}

if (window.omnitune?.isDesktop) {
  document.body.classList.add(window.omnitune.platform === 'darwin' ? 'desktop-mac' : 'desktop-win');
  window.omnitune.onMedia((action) => {
    switch (action) {
      case 'toggle':
        void player.toggle();
        break;
      case 'pause':
        player.pause();
        break;
      case 'next':
        void player.next();
        break;
      case 'previous':
        void player.previous();
        break;
      case 'volume-up':
        player.setVolume(player.getState().volume + 0.1);
        break;
      case 'volume-down':
        player.setVolume(player.getState().volume - 0.1);
        break;
      case 'shuffle':
        player.toggleShuffle();
        break;
      case 'repeat':
        player.cycleRepeat();
        break;
    }
  });
}
