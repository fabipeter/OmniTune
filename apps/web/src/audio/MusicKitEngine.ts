import type { AudioEngine, EngineEvent, LoadOptions, Track } from '@omnitune/core';
import type { MusicKitInstance } from '../env';

const MUSICKIT_SRC = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
const MUSICKIT_SRI =
  import.meta.env.VITE_MUSICKIT_SRI || 'sha384-P9rZEwFDysMpb6eyJui9TfC88AoAPDelBRR7EdZEmimWpQ3Auy8uhmqcTUeeXrJR';

export interface MusicKitStatus {
  available: boolean;
  authorized: boolean;
  loading: boolean;
  error?: string;
}

/**
 * Hybrid AudioEngine: delegates songs to MusicKit JS v3 when the user has authorized
 * full-length playback, and falls back to WebAudioEngine for guest previews and podcast episodes.
 */
export class HybridAudioEngine implements AudioEngine {
  private listeners = new Set<(e: EngineEvent) => void>();
  private statusListeners = new Set<() => void>();
  private mk: MusicKitInstance | null = null;
  private activeBackend: 'web' | 'musickit' = 'web';
  private status: MusicKitStatus = { available: false, authorized: false, loading: false };
  private unsubFallback: () => void;
  private devTokenProvider: () => Promise<string | null>;

  constructor(
    public readonly webEngine: AudioEngine,
    devTokenProvider: () => Promise<string | null>,
  ) {
    this.devTokenProvider = devTokenProvider;
    this.unsubFallback = webEngine.subscribe((e) => {
      if (this.activeBackend === 'web') this.emit(e);
    });
    void this.probeAvailability();
  }

  subscribeStatus = (l: () => void) => {
    this.statusListeners.add(l);
    return () => {
      this.statusListeners.delete(l);
    };
  };
  getStatus = (): MusicKitStatus => this.status;

  private setStatus(patch: Partial<MusicKitStatus>) {
    this.status = { ...this.status, ...patch };
    this.statusListeners.forEach((l) => l());
  }

  async probeAvailability() {
    try {
      const tok = await this.devTokenProvider();
      this.setStatus({ available: !!tok });
    } catch {
      this.setStatus({ available: false });
    }
  }

  private async ensureMusicKit(): Promise<MusicKitInstance> {
    if (this.mk) return this.mk;
    const token = await this.devTokenProvider();
    if (!token) throw new Error('MusicKit developer token is not configured');

    if (!window.MusicKit) {
      await new Promise<void>((resolve, reject) => {
        const onLoaded = () => resolve();
        document.addEventListener('musickitloaded', onLoaded, { once: true });
        const script = document.createElement('script');
        script.src = MUSICKIT_SRC;
        script.integrity = MUSICKIT_SRI;
        script.crossOrigin = 'anonymous';
        script.referrerPolicy = 'no-referrer';
        script.async = true;
        script.onerror = () => {
          document.removeEventListener('musickitloaded', onLoaded);
          reject(new Error('Failed to load MusicKit JS'));
        };
        document.head.appendChild(script);
      });
    }

    const mk = await window.MusicKit!.configure({
      developerToken: token,
      app: { name: 'OmniTune', build: '0.1.0' },
    });

    mk.addEventListener('playbackStateDidChange', () => {
      if (this.activeBackend !== 'musickit') return;
      const states = window.MusicKit?.PlaybackStates ?? {};
      const st = mk.playbackState;
      const buffering = st === states.loading || st === states.waiting || st === states.stalled;
      if (st === states.completed || st === states.ended) {
        this.emit({ type: 'ended' });
      } else {
        this.emit({ type: 'state', playing: mk.isPlaying, buffering });
      }
    });

    mk.addEventListener('playbackTimeDidChange', () => {
      if (this.activeBackend !== 'musickit') return;
      this.emit({
        type: 'time',
        positionMs: (mk.currentPlaybackTime || 0) * 1000,
        durationMs: (mk.currentPlaybackDuration || 0) * 1000,
      });
    });

    this.mk = mk;
    this.setStatus({ available: true, authorized: mk.isAuthorized });
    return mk;
  }

  async authorize(): Promise<boolean> {
    this.setStatus({ loading: true, error: undefined });
    try {
      const mk = await this.ensureMusicKit();
      await mk.authorize();
      this.setStatus({ authorized: mk.isAuthorized, loading: false });
      return mk.isAuthorized;
    } catch (e) {
      this.setStatus({ loading: false, error: e instanceof Error ? e.message : 'Authorization failed' });
      return false;
    }
  }

  async unauthorize() {
    if (!this.mk) return;
    await this.mk.unauthorize();
    this.activeBackend = 'web';
    this.setStatus({ authorized: false });
  }

  get fullSongsEnabled(): boolean {
    return this.status.authorized && !!this.mk?.isAuthorized;
  }

  async load(track: Track, opts?: LoadOptions) {
    if (track.kind === 'song' && this.fullSongsEnabled && this.mk) {
      this.webEngine.pause();
      this.activeBackend = 'musickit';
      try {
        await this.mk.setQueue({ song: track.id, startPlaying: false });
        if (opts?.startMs) await this.mk.seekToTime(opts.startMs / 1000);
        if (opts?.autoplay !== false) await this.mk.play();
        else this.emit({ type: 'state', playing: false, buffering: false });
        return;
      } catch {
        // Fall back to 30s AAC preview if MusicKit rejects the item.
        this.activeBackend = 'web';
      }
    } else {
      if (this.mk?.isPlaying) void this.mk.pause();
      this.activeBackend = 'web';
    }
    await this.webEngine.load(track, opts);
  }

  async play() {
    if (this.activeBackend === 'musickit' && this.mk) await this.mk.play();
    else await this.webEngine.play();
  }

  pause() {
    if (this.activeBackend === 'musickit' && this.mk) void this.mk.pause();
    else this.webEngine.pause();
  }

  seek(ms: number) {
    if (this.activeBackend === 'musickit' && this.mk) void this.mk.seekToTime(ms / 1000);
    else this.webEngine.seek(ms);
  }

  setVolume(v: number) {
    if (this.mk) this.mk.volume = v;
    this.webEngine.setVolume(v);
  }

  setRate(rate: number) {
    this.webEngine.setRate?.(rate);
  }

  preload(track: Track) {
    if (this.activeBackend === 'web') this.webEngine.preload?.(track);
  }

  subscribe(listener: (e: EngineEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy() {
    this.unsubFallback();
    this.webEngine.destroy?.();
  }

  private emit(e: EngineEvent) {
    this.listeners.forEach((l) => l(e));
  }
}
