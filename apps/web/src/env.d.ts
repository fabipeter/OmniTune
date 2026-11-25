/// <reference types="vite/client" />

export type DesktopMediaAction =
  | 'toggle'
  | 'next'
  | 'previous'
  | 'pause'
  | 'volume-up'
  | 'volume-down'
  | 'shuffle'
  | 'repeat';

export interface DesktopBridge {
  isDesktop: boolean;
  platform: 'darwin' | 'win32' | string;
  onMedia(cb: (action: DesktopMediaAction) => void): () => void;
  setNowPlaying(info: { title: string; playing: boolean }): void;
}

export interface MusicKitInstance {
  isAuthorized: boolean;
  isPlaying: boolean;
  playbackState: number;
  currentPlaybackTime: number;
  currentPlaybackDuration: number;
  volume: number;
  authorize(): Promise<string>;
  unauthorize(): Promise<void>;
  setQueue(options: { song?: string; album?: string; playlist?: string; startPlaying?: boolean }): Promise<unknown>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seekToTime(seconds: number): Promise<void>;
  addEventListener(event: string, listener: (e?: unknown) => void): void;
  removeEventListener(event: string, listener: (e?: unknown) => void): void;
}

export interface MusicKitGlobal {
  configure(config: { developerToken: string; app: { name: string; build: string } }): Promise<MusicKitInstance>;
  getInstance(): MusicKitInstance;
  PlaybackStates: Record<string, number>;
}

declare global {
  interface Window {
    omnitune?: DesktopBridge;
    MusicKit?: MusicKitGlobal;
  }
}
