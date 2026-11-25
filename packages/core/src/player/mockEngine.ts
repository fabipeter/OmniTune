import type { AudioEngine, EngineEvent } from './engine';
import type { Track } from '../types';

/** In-memory engine for unit tests and server-side simulation. */
export class MockEngine implements AudioEngine {
  private listeners = new Set<(e: EngineEvent) => void>();
  loaded: Track | null = null;
  playing = false;
  position = 0;
  volume = 1;
  rate = 1;
  loads: Array<{ track: Track; crossfadeMs?: number }> = [];

  async load(track: Track, opts: { autoplay?: boolean; startMs?: number; crossfadeMs?: number } = {}) {
    this.loaded = track;
    this.loads.push({ track, crossfadeMs: opts.crossfadeMs });
    this.position = opts.startMs ?? 0;
    this.playing = opts.autoplay !== false;
    this.emit({ type: 'state', playing: this.playing, buffering: false });
    this.emit({ type: 'time', positionMs: this.position, durationMs: track.durationMs });
  }
  async play() {
    this.playing = true;
    this.emit({ type: 'state', playing: true, buffering: false });
  }
  pause() {
    this.playing = false;
    this.emit({ type: 'state', playing: false, buffering: false });
  }
  seek(ms: number) {
    this.position = ms;
    this.emit({ type: 'time', positionMs: ms, durationMs: this.loaded?.durationMs ?? 0 });
  }
  setVolume(v: number) {
    this.volume = v;
  }
  setRate(r: number) {
    this.rate = r;
  }
  subscribe(l: (e: EngineEvent) => void) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  emit(e: EngineEvent) {
    this.listeners.forEach((l) => l(e));
  }
  /** test helpers */
  tick(ms: number) {
    this.position += ms;
    this.emit({ type: 'time', positionMs: this.position, durationMs: this.loaded?.durationMs ?? 0 });
  }
  finish() {
    this.emit({ type: 'ended' });
  }
}
