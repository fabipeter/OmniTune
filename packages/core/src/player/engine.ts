import type { Track } from '../types';

export type EngineEvent =
  | { type: 'time'; positionMs: number; durationMs: number }
  | { type: 'state'; playing: boolean; buffering: boolean }
  | { type: 'ended' }
  | { type: 'error'; message: string };

export interface LoadOptions {
  /** Start playing as soon as ready (default true). */
  autoplay?: boolean;
  startMs?: number;
  /** Overlap the outgoing track with the new one for this long. */
  crossfadeMs?: number;
}

/**
 * Platform audio adapter. Web: HTMLAudio + WebAudio (EQ/crossfade) or MusicKit. Mobile: expo-audio.
 * The PlayerController is the single source of truth for queue/shuffle/repeat; engines only play files.
 */
export interface AudioEngine {
  load(track: Track, opts?: LoadOptions): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(ms: number): void;
  setVolume(volume: number): void;
  setRate?(rate: number): void;
  /** Optional hint so the engine can preload the next track for gapless playback. */
  preload?(track: Track): void;
  subscribe(listener: (e: EngineEvent) => void): () => void;
  destroy?(): void;
}
