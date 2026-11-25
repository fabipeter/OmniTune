import { DEFAULT_SETTINGS, type HistoryEvent, type Settings, type Track } from '../types';
import { fisherYates, smartShuffle } from '../shuffle/smartShuffle';
import type { TasteProfile } from '../recommend/taste';
import { secureId, secureRandom } from '../random';
import type { AudioEngine, EngineEvent } from './engine';

export type RepeatMode = 'off' | 'all' | 'one';

export interface PlaybackContext {
  type: 'album' | 'playlist' | 'artist' | 'liked' | 'search' | 'radio' | 'mix' | 'podcast' | 'chart' | 'genre' | 'queue' | 'unknown';
  id?: string;
  name?: string;
}

export interface QueueItem {
  uid: string;
  track: Track;
}

export interface PlayerState {
  current: Track | null;
  context: PlaybackContext | null;
  playing: boolean;
  buffering: boolean;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  rate: number;
  /** "Next in queue": tracks the user explicitly added; always play before the context. */
  userQueue: QueueItem[];
  /** "Next from <context>": the remaining context tracks (capped for rendering). */
  upNext: Track[];
  /** Tracks already played this session, oldest → newest (for the queue "history" view). */
  played: Track[];
  canPrevious: boolean;
  canNext: boolean;
  error?: string;
  sleep: { endsAt?: number; endOfTrack?: boolean } | null;
  loadingAutoplay: boolean;
}

export interface PlayerSession {
  current: Track | null;
  context: PlaybackContext | null;
  order: Track[];
  original: Track[];
  index: number;
  userQueue: QueueItem[];
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  positionMs: number;
}

export interface PlayerOptions {
  engine: AudioEngine;
  getSettings?: () => Settings;
  getTaste?: () => TasteProfile | undefined;
  /** Returns more tracks when the context ends (radio/autoplay). */
  autoplay?: (seed: Track, taste?: TasteProfile) => Promise<Track[]>;
  onPlayed?: (e: Omit<HistoryEvent, 'id'>) => void;
  /** Called every few seconds for episodes so apps can persist resume position. */
  onEpisodeProgress?: (episodeId: string, positionMs: number) => void;
  getEpisodeProgress?: (episodeId: string) => number;
  random?: () => number;
}

interface Playing {
  track: Track;
  ctxIndex: number;
  fromQueue: boolean;
  startedAt: number;
  listenedMs: number;
}

const UP_NEXT_CAP = 100;
const MAX_CONSECUTIVE_ERRORS = 5;

/**
 * Framework-agnostic playback state machine with OmniTune queue semantics:
 * explicit queue first, then the context, shuffle that preserves the current track,
 * repeat off/all/one, previous-restarts-after-3s, crossfade triggering, sleep timer and autoplay radio.
 */
export class PlayerController {
  private engine: AudioEngine;
  private opts: PlayerOptions;
  private listeners = new Set<() => void>();
  private progressListeners = new Set<(pos: number, dur: number) => void>();
  private original: Track[] = [];
  private order: Track[] = [];
  private index = -1;
  private userQueue: QueueItem[] = [];
  private prev: Array<{ item: Playing }> = [];
  private playedList: Track[] = [];
  private playing: Playing | null = null;
  private state: PlayerState;
  private positionMs = 0;
  private durationMs = 0;
  private lastPos = 0;
  private crossfadeFired = false;
  private errorStreak = 0;
  private sleepTimer: ReturnType<typeof setTimeout> | undefined;
  private lastEpisodeSave = 0;
  private unsub: () => void;
  private rng: () => number;

  constructor(opts: PlayerOptions) {
    this.opts = opts;
    this.engine = opts.engine;
    this.rng = opts.random ?? secureRandom;
    this.state = {
      current: null,
      context: null,
      playing: false,
      buffering: false,
      volume: 1,
      muted: false,
      shuffle: false,
      repeat: 'off',
      rate: 1,
      userQueue: [],
      upNext: [],
      played: [],
      canPrevious: false,
      canNext: false,
      sleep: null,
      loadingAutoplay: false,
    };
    this.unsub = this.engine.subscribe((e) => this.onEngine(e));
  }

  // ---------- subscription ----------
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  getState = (): PlayerState => this.state;
  subscribeProgress(l: (pos: number, dur: number) => void) {
    this.progressListeners.add(l);
    return () => {
      this.progressListeners.delete(l);
    };
  }
  getProgress = () => ({ positionMs: this.positionMs, durationMs: this.durationMs || this.state.current?.durationMs || 0 });

  private settings(): Settings {
    return this.opts.getSettings?.() ?? DEFAULT_SETTINGS;
  }

  private set(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private refresh(extra: Partial<PlayerState> = {}) {
    const upNext = this.order.slice(this.index + 1, this.index + 1 + UP_NEXT_CAP);
    const hasNext = this.userQueue.length > 0 || this.index + 1 < this.order.length || this.state.repeat === 'all' || !!this.opts.autoplay;
    this.set({
      current: this.playing?.track ?? null,
      userQueue: this.userQueue.slice(),
      upNext,
      played: this.playedList.slice(-50),
      canPrevious: this.prev.length > 0 || !!this.playing,
      canNext: !!this.playing && hasNext,
      ...extra,
    });
  }

  // ---------- starting playback ----------

  /** Play a list of tracks (album, playlist, search results…). */
  async play(tracks: Track[], opts: { startIndex?: number; context?: PlaybackContext; shuffle?: boolean } = {}) {
    const playable = tracks.filter((t) => this.allowed(t));
    if (!playable.length) return;
    const wanted = tracks[opts.startIndex ?? 0];
    const start = wanted && this.allowed(wanted) ? wanted : playable[0];
    const shuffle = opts.shuffle ?? this.state.shuffle;
    this.original = playable;
    this.errorStreak = 0;
    if (shuffle) {
      const startWith = opts.startIndex !== undefined ? start : undefined;
      this.order = this.shuffled(playable, startWith);
    } else {
      this.order = playable;
    }
    this.state = { ...this.state, shuffle, context: opts.context ?? null };
    const idx = shuffle && opts.startIndex === undefined ? 0 : this.order.findIndex((t) => t.id === start.id);
    await this.startTrack(this.order[Math.max(0, idx)], { ctxIndex: Math.max(0, idx), fromQueue: false });
  }

  async playTrack(track: Track, context?: PlaybackContext) {
    await this.play([track], { context: context ?? { type: 'unknown' }, shuffle: false });
  }

  private allowed(t: Track) {
    if (!t.audioUrl) return false;
    if (this.settings().explicitFilter && t.explicit) return false;
    return true;
  }

  private shuffled(tracks: Track[], startWith?: Track): Track[] {
    const mode = this.settings().shuffleMode;
    if (mode === 'random') {
      const rest = fisherYates(tracks.filter((t) => t.id !== startWith?.id), this.rng);
      return startWith ? [startWith, ...rest] : rest;
    }
    return smartShuffle(tracks, { taste: this.opts.getTaste?.(), startWith, rng: this.rng });
  }

  private async startTrack(track: Track, pos: { ctxIndex: number; fromQueue: boolean }, load: { crossfadeMs?: number; autoplay?: boolean; startMs?: number } = {}) {
    this.finishCurrent('auto');
    this.index = pos.fromQueue ? this.index : pos.ctxIndex;
    this.playing = { track, ctxIndex: this.index, fromQueue: pos.fromQueue, startedAt: Date.now(), listenedMs: 0 };
    this.positionMs = load.startMs ?? 0;
    this.lastPos = this.positionMs;
    this.durationMs = track.durationMs;
    this.crossfadeFired = false;
    this.refresh({ error: undefined, buffering: true });
    this.emitProgress();
    let startMs = load.startMs;
    if (startMs === undefined && track.kind === 'episode') {
      const saved = this.opts.getEpisodeProgress?.(track.id) ?? 0;
      if (saved > 5000 && saved < track.durationMs - 15000) startMs = saved;
    }
    try {
      await this.engine.load(track, { autoplay: load.autoplay ?? true, startMs, crossfadeMs: load.crossfadeMs });
      this.engine.setRate?.(this.state.rate);
      this.applyVolume();
      const peek = this.peekNext();
      if (peek) this.engine.preload?.(peek);
    } catch (e) {
      this.handleError(e instanceof Error ? e.message : 'Playback failed');
    }
  }

  // ---------- transport ----------
  async toggle() {
    if (!this.playing) return;
    if (this.state.playing) this.pause();
    else await this.resume();
  }
  async resume() {
    if (!this.playing) return;
    try {
      await this.engine.play();
    } catch (e) {
      this.handleError(e instanceof Error ? e.message : 'Playback failed');
    }
  }
  pause() {
    this.engine.pause();
  }
  seek(ms: number) {
    const dur = this.durationMs || this.state.current?.durationMs || 0;
    const t = Math.max(0, Math.min(ms, dur || ms));
    this.lastPos = t;
    this.positionMs = t;
    this.engine.seek(t);
    this.emitProgress();
  }
  seekBy(deltaMs: number) {
    this.seek(this.positionMs + deltaMs);
  }

  async next(): Promise<void> {
    await this.advance('skip');
  }

  private peekNext(): Track | undefined {
    if (this.state.repeat === 'one' && this.playing) return this.playing.track;
    if (this.userQueue.length) return this.userQueue[0].track;
    if (this.index + 1 < this.order.length) return this.order[this.index + 1];
    if (this.state.repeat === 'all') return this.order[0];
    return undefined;
  }

  private async advance(reason: 'skip' | 'auto', crossfadeMs?: number): Promise<void> {
    if (!this.playing) return;
    this.finishCurrent(reason === 'skip' ? 'skip' : 'auto');
    const cur = this.playing;
    // Explicit queue wins over the context.
    while (this.userQueue.length) {
      const item = this.userQueue.shift()!;
      if (!this.allowed(item.track)) continue;
      this.prev.push({ item: cur });
      await this.startTrack(item.track, { ctxIndex: this.index, fromQueue: true }, { crossfadeMs });
      return;
    }
    if (this.index + 1 < this.order.length) {
      this.prev.push({ item: cur });
      const nextTrack = this.order[this.index + 1];
      await this.startTrack(nextTrack, { ctxIndex: this.index + 1, fromQueue: false }, { crossfadeMs });
      return;
    }
    if (this.state.repeat === 'all' && this.order.length) {
      this.prev.push({ item: cur });
      if (this.state.shuffle) this.order = this.shuffled(this.original);
      await this.startTrack(this.order[0], { ctxIndex: 0, fromQueue: false }, { crossfadeMs });
      return;
    }
    // End of context → autoplay radio.
    if (this.settings().autoplay && this.opts.autoplay) {
      this.set({ loadingAutoplay: true });
      try {
        const more = (await this.opts.autoplay(cur.track, this.opts.getTaste?.())).filter((t) => this.allowed(t));
        if (more.length) {
          this.prev.push({ item: cur });
          this.original = more;
          this.order = more;
          this.state = { ...this.state, context: { type: 'radio', name: `Radio · ${cur.track.artistName}` }, loadingAutoplay: false };
          await this.startTrack(more[0], { ctxIndex: 0, fromQueue: false }, { crossfadeMs });
          return;
        }
      } catch {
        /* fall through to stop */
      }
      this.set({ loadingAutoplay: false });
    }
    this.engine.pause();
    this.engine.seek(0);
    this.positionMs = 0;
    this.emitProgress();
    this.refresh({ playing: false });
  }

  async previous(): Promise<void> {
    if (!this.playing) return;
    if (this.positionMs > 3000 || this.prev.length === 0) {
      this.seek(0);
      if (!this.state.playing) await this.resume();
      return;
    }
    this.finishCurrent('skip');
    const leaving = this.playing;
    const back = this.prev.pop()!.item;
    if (leaving.fromQueue) this.userQueue.unshift({ uid: uid(), track: leaving.track });
    // Context track we are leaving will be reached again by `index + 1`.
    this.index = back.fromQueue ? Math.max(-1, leaving.fromQueue ? this.index : this.index - 1) : back.ctxIndex;
    await this.startTrack(back.track, { ctxIndex: this.index, fromQueue: back.fromQueue });
    this.playedList.pop();
  }

  /** Jump to a track already in the upcoming list (clicking a row in the queue). */
  async skipToUpNext(index: number) {
    const target = this.order[this.index + 1 + index];
    if (!target || !this.playing) return;
    this.prev.push({ item: this.playing });
    await this.startTrack(target, { ctxIndex: this.index + 1 + index, fromQueue: false });
  }
  async skipToQueueItem(uidValue: string) {
    const i = this.userQueue.findIndex((q) => q.uid === uidValue);
    if (i < 0 || !this.playing) return;
    const [item] = this.userQueue.splice(i, 1);
    this.userQueue.splice(0, i); // everything before it is skipped
    this.prev.push({ item: this.playing });
    await this.startTrack(item.track, { ctxIndex: this.index, fromQueue: true });
  }

  // ---------- modes ----------
  toggleShuffle() {
    this.setShuffle(!this.state.shuffle);
  }
  setShuffle(on: boolean) {
    if (on === this.state.shuffle) return;
    const cur = this.playing && !this.playing.fromQueue ? this.playing.track : this.order[this.index];
    if (on && this.order.length) {
      const rest = this.order.slice(this.index + 1);
      const head = this.order.slice(0, this.index + 1);
      this.order = [...head, ...this.shuffled(rest, undefined)];
    } else if (!on && this.original.length) {
      this.order = this.original;
      const i = cur ? this.original.findIndex((t) => t.id === cur.id) : -1;
      this.index = i >= 0 ? i : Math.min(this.index, this.original.length - 1);
    }
    this.state = { ...this.state, shuffle: on };
    this.refresh();
  }
  cycleRepeat() {
    this.setRepeat(this.state.repeat === 'off' ? 'all' : this.state.repeat === 'all' ? 'one' : 'off');
  }
  setRepeat(mode: RepeatMode) {
    this.state = { ...this.state, repeat: mode };
    this.refresh();
  }
  setVolume(v: number) {
    this.state = { ...this.state, volume: Math.max(0, Math.min(1, v)), muted: false };
    this.applyVolume();
    this.refresh();
  }
  toggleMute() {
    this.state = { ...this.state, muted: !this.state.muted };
    this.applyVolume();
    this.refresh();
  }
  private applyVolume() {
    this.engine.setVolume(this.state.muted ? 0 : this.state.volume);
  }
  setRate(rate: number) {
    this.state = { ...this.state, rate };
    this.engine.setRate?.(rate);
    this.refresh();
  }

  // ---------- queue ----------
  addToQueue(tracks: Track | Track[]) {
    const list = (Array.isArray(tracks) ? tracks : [tracks]).filter((t) => this.allowed(t));
    this.userQueue.push(...list.map((track) => ({ uid: uid(), track })));
    this.refresh();
  }
  playNext(tracks: Track | Track[]) {
    const list = (Array.isArray(tracks) ? tracks : [tracks]).filter((t) => this.allowed(t));
    this.userQueue.unshift(...list.map((track) => ({ uid: uid(), track })));
    this.refresh();
  }
  removeFromQueue(uidValue: string) {
    this.userQueue = this.userQueue.filter((q) => q.uid !== uidValue);
    this.refresh();
  }
  removeFromUpNext(index: number) {
    const at = this.index + 1 + index;
    if (at < this.order.length) {
      this.order = [...this.order.slice(0, at), ...this.order.slice(at + 1)];
      this.refresh();
    }
  }
  moveInQueue(from: number, to: number) {
    const q = this.userQueue.slice();
    const [m] = q.splice(from, 1);
    if (!m) return;
    q.splice(to, 0, m);
    this.userQueue = q;
    this.refresh();
  }
  clearQueue() {
    this.userQueue = [];
    this.refresh();
  }

  // ---------- sleep timer ----------
  setSleepTimer(opt: { minutes: number } | { endOfTrack: true } | null) {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = undefined;
    if (!opt) return this.set({ sleep: null });
    if ('endOfTrack' in opt) return this.set({ sleep: { endOfTrack: true } });
    const ms = opt.minutes * 60_000;
    this.sleepTimer = setTimeout(() => {
      this.pause();
      this.set({ sleep: null });
    }, ms);
    this.set({ sleep: { endsAt: Date.now() + ms } });
  }

  // ---------- session persistence ----------
  snapshot(): PlayerSession {
    return {
      current: this.playing?.track ?? null,
      context: this.state.context,
      order: this.order,
      original: this.original,
      index: this.index,
      userQueue: this.userQueue,
      shuffle: this.state.shuffle,
      repeat: this.state.repeat,
      volume: this.state.volume,
      positionMs: this.positionMs,
    };
  }
  /** Restore a saved session (paused by default, or playing when handing off via Connect). */
  async restore(s: PlayerSession, opts: { autoplay?: boolean } = {}) {
    this.order = s.order;
    this.original = s.original;
    this.userQueue = s.userQueue;
    this.index = s.index;
    this.state = { ...this.state, shuffle: s.shuffle, repeat: s.repeat, volume: s.volume, context: s.context };
    if (s.current) {
      await this.startTrack(s.current, { ctxIndex: s.index, fromQueue: false }, { autoplay: opts.autoplay ?? false, startMs: s.positionMs });
    } else {
      this.refresh();
    }
  }

  destroy() {
    this.unsub();
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.engine.destroy?.();
  }

  // ---------- engine events ----------
  private onEngine(e: EngineEvent) {
    switch (e.type) {
      case 'state':
        if (e.playing !== this.state.playing || e.buffering !== this.state.buffering) this.set({ playing: e.playing, buffering: e.buffering, error: undefined });
        break;
      case 'time': {
        const delta = e.positionMs - this.lastPos;
        if (this.state.playing && delta > 0 && delta < 2500 && this.playing) this.playing.listenedMs += delta;
        this.lastPos = e.positionMs;
        this.positionMs = e.positionMs;
        if (e.durationMs > 0) this.durationMs = e.durationMs;
        this.errorStreak = 0;
        this.emitProgress();
        this.maybeCrossfade();
        this.maybeSaveEpisode();
        break;
      }
      case 'ended':
        void this.onEnded();
        break;
      case 'error':
        this.handleError(e.message);
        break;
    }
  }

  private maybeCrossfade() {
    const cf = this.settings().crossfadeMs;
    if (!cf || this.crossfadeFired || !this.durationMs || this.state.repeat === 'one') return;
    if (this.state.sleep?.endOfTrack) return;
    const remaining = this.durationMs - this.positionMs;
    if (remaining > 0 && remaining <= cf && this.positionMs > cf) {
      this.crossfadeFired = true;
      void this.advance('auto', cf);
    }
  }

  private maybeSaveEpisode() {
    const cur = this.playing?.track;
    if (!cur || cur.kind !== 'episode' || !this.opts.onEpisodeProgress) return;
    const now = Date.now();
    if (now - this.lastEpisodeSave > 5000) {
      this.lastEpisodeSave = now;
      this.opts.onEpisodeProgress(cur.id, this.positionMs >= this.durationMs - 15000 ? 0 : this.positionMs);
    }
  }

  private async onEnded() {
    if (!this.playing) return;
    if (this.crossfadeFired) return; // already moved on
    if (this.state.sleep?.endOfTrack) {
      this.set({ sleep: null });
      this.finishCurrent('auto');
      this.engine.pause();
      this.engine.seek(0);
      this.refresh({ playing: false });
      return;
    }
    if (this.state.repeat === 'one') {
      this.finishCurrent('auto');
      this.playing = { ...this.playing, startedAt: Date.now(), listenedMs: 0 };
      this.engine.seek(0);
      await this.resume();
      return;
    }
    await this.advance('auto');
  }

  private handleError(message: string) {
    this.errorStreak++;
    this.refresh({ error: message, buffering: false });
    if (this.errorStreak < MAX_CONSECUTIVE_ERRORS && this.playing) void this.advance('auto');
    else this.set({ playing: false });
  }

  /** Emit a history event for the track that just stopped. */
  private finishCurrent(reason: 'skip' | 'auto') {
    const p = this.playing;
    if (!p) return;
    const dur = this.durationMs || p.track.durationMs;
    if (p.listenedMs > 1500) {
      const completed = p.listenedMs >= dur * 0.85;
      this.opts.onPlayed?.({
        track: p.track,
        playedAt: p.startedAt,
        listenedMs: Math.round(p.listenedMs),
        completed,
        skipped: reason === 'skip' && !completed && p.listenedMs < 30_000,
        contextType: this.state.context?.type,
        contextId: this.state.context?.id,
      });
    }
    if (this.playedList[this.playedList.length - 1]?.id !== p.track.id || reason === 'skip') this.playedList.push(p.track);
    if (this.playedList.length > 200) this.playedList.shift();
    p.listenedMs = 0;
  }

  private emitProgress() {
    const dur = this.durationMs || this.state.current?.durationMs || 0;
    this.progressListeners.forEach((l) => l(this.positionMs, dur));
  }
}

function uid() {
  return secureId('q_');
}
