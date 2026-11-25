import { EQ_BANDS, type AudioEngine, type EngineEvent, type EqSettings, type LoadOptions, type Track } from '@omnitune/core';

interface Deck {
  el: HTMLAudioElement;
  source?: MediaElementAudioSourceNode;
  gain?: GainNode;
  useWebAudio: boolean;
}

/**
 * Dual-deck HTMLAudio + WebAudio engine.
 *
 * CORS note:
 * Catalog preview streams return `Access-Control-Allow-Origin: *`, so routing them through
 * WebAudio (10-band BiquadFilter EQ + DynamicsCompressor normaliser + equal-power crossfade)
 * works cleanly. Third-party podcast feeds sometimes omit CORS headers; if a CORS load fails,
 * this engine transparently retries without `crossOrigin` on a plain element (bypassing EQ for
 * that episode rather than failing playback).
 */
export class WebAudioEngine implements AudioEngine {
  private listeners = new Set<(e: EngineEvent) => void>();
  private ctx: AudioContext | null = null;
  private filters: BiquadFilterNode[] = [];
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private decks: [Deck, Deck];
  private activeIndex: 0 | 1 = 0;
  private preloadedUrl: string | null = null;
  private preloadedDeck: 0 | 1 | null = null;
  private volume = 1;
  private rate = 1;
  private eq: EqSettings = { enabled: false, preset: 'Flat', gains: EQ_BANDS.map(() => 0) };
  private normalize = true;
  private loadSeq = 0;
  private tickTimer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    this.decks = [this.createDeck(0), this.createDeck(1)];
    this.tickTimer = setInterval(() => this.emitTime(), 250);
  }

  private createDeck(index: 0 | 1): Deck {
    const el = new Audio();
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';

    const isActive = () => this.activeIndex === index;
    el.addEventListener('playing', () => {
      if (isActive()) this.emit({ type: 'state', playing: true, buffering: false });
    });
    el.addEventListener('pause', () => {
      if (isActive() && !el.ended) this.emit({ type: 'state', playing: false, buffering: false });
    });
    el.addEventListener('waiting', () => {
      if (isActive()) this.emit({ type: 'state', playing: !el.paused, buffering: true });
    });
    el.addEventListener('canplay', () => {
      if (isActive()) this.emit({ type: 'state', playing: !el.paused, buffering: false });
    });
    el.addEventListener('ended', () => {
      if (isActive()) this.emit({ type: 'ended' });
    });
    el.addEventListener('durationchange', () => {
      if (isActive()) this.emitTime();
    });
    el.addEventListener('error', () => {
      if (!isActive() || !el.src) return;
      // Fallback for third-party podcast hosts that reject CORS requests.
      const deck = this.decks[index];
      if (el.crossOrigin && deck.useWebAudio) {
        const src = el.src;
        const pos = el.currentTime;
        const wasPlaying = !el.paused;
        deck.useWebAudio = false;
        const plain = new Audio();
        plain.preload = 'auto';
        plain.src = src;
        plain.volume = this.volume;
        plain.playbackRate = this.rate;
        this.replaceDeckElement(index, plain);
        if (pos > 0) plain.currentTime = pos;
        if (wasPlaying) void plain.play().catch(() => undefined);
        return;
      }
      this.emit({ type: 'error', message: 'Could not load audio stream' });
    });

    return { el, useWebAudio: true };
  }

  private replaceDeckElement(index: 0 | 1, fresh: HTMLAudioElement) {
    const old = this.decks[index].el;
    old.pause();
    old.removeAttribute('src');
    const isActive = () => this.activeIndex === index;
    fresh.addEventListener('playing', () => isActive() && this.emit({ type: 'state', playing: true, buffering: false }));
    fresh.addEventListener('pause', () => isActive() && !fresh.ended && this.emit({ type: 'state', playing: false, buffering: false }));
    fresh.addEventListener('waiting', () => isActive() && this.emit({ type: 'state', playing: !fresh.paused, buffering: true }));
    fresh.addEventListener('ended', () => isActive() && this.emit({ type: 'ended' }));
    fresh.addEventListener('error', () => isActive() && this.emit({ type: 'error', message: 'Audio stream unavailable' }));
    this.decks[index] = { el: fresh, useWebAudio: false };
  }

  private ensureAudioGraph() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    this.ctx = ctx;

    // 10-band EQ chain
    this.filters = EQ_BANDS.map((freq, idx) => {
      const f = ctx.createBiquadFilter();
      f.type = idx === 0 ? 'lowshelf' : idx === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking';
      f.frequency.value = freq;
      f.Q.value = 1.4;
      f.gain.value = this.eq.enabled ? (this.eq.gains[idx] ?? 0) : 0;
      return f;
    });
    for (let i = 0; i < this.filters.length - 1; i++) this.filters[i].connect(this.filters[i + 1]);

    this.compressor = ctx.createDynamicsCompressor();
    this.applyNormalizeNode();

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.volume;

    this.filters[this.filters.length - 1].connect(this.compressor);
    this.compressor.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    for (const d of this.decks) this.connectDeck(d);
  }

  private connectDeck(deck: Deck) {
    if (!this.ctx || !deck.useWebAudio || deck.source) return;
    try {
      deck.source = this.ctx.createMediaElementSource(deck.el);
      deck.gain = this.ctx.createGain();
      deck.gain.gain.value = 1;
      deck.source.connect(deck.gain);
      deck.gain.connect(this.filters[0]);
    } catch {
      deck.useWebAudio = false;
    }
  }

  private applyNormalizeNode() {
    if (!this.compressor) return;
    if (this.normalize) {
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.005;
      this.compressor.release.value = 0.2;
    } else {
      this.compressor.threshold.value = 0;
      this.compressor.ratio.value = 1;
    }
  }

  setEq(eq: EqSettings) {
    this.eq = eq;
    this.filters.forEach((f, i) => {
      f.gain.value = eq.enabled ? (eq.gains[i] ?? 0) : 0;
    });
  }

  setNormalize(on: boolean) {
    this.normalize = on;
    this.applyNormalizeNode();
  }

  private get active(): Deck {
    return this.decks[this.activeIndex];
  }

  async load(track: Track, opts: LoadOptions = {}) {
    const seq = ++this.loadSeq;
    const url = track.audioUrl;
    if (!url) {
      this.emit({ type: 'error', message: 'No audio URL for this track' });
      return;
    }

    const crossfadeSec = Math.max(0, (opts.crossfadeMs ?? 0) / 1000);
    const prevIndex = this.activeIndex;
    const nextIndex: 0 | 1 =
      this.preloadedDeck !== null && this.preloadedUrl === url
        ? this.preloadedDeck
        : crossfadeSec > 0
          ? ((prevIndex === 0 ? 1 : 0) as 0 | 1)
          : prevIndex;

    const prevDeck = this.decks[prevIndex];
    const nextDeck = this.decks[nextIndex];
    this.activeIndex = nextIndex;
    this.preloadedDeck = null;
    this.preloadedUrl = null;

    if (nextDeck.useWebAudio) {
      this.ensureAudioGraph();
      this.connectDeck(nextDeck);
    }

    if (nextDeck.el.src !== url) {
      nextDeck.el.src = url;
      nextDeck.el.load();
    }
    nextDeck.el.playbackRate = this.rate;
    if (opts.startMs && opts.startMs > 0) {
      try {
        nextDeck.el.currentTime = opts.startMs / 1000;
      } catch {
        nextDeck.el.addEventListener(
          'loadedmetadata',
          () => {
            if (this.loadSeq === seq) nextDeck.el.currentTime = (opts.startMs ?? 0) / 1000;
          },
          { once: true },
        );
      }
    }

    if (prevIndex !== nextIndex) {
      if (crossfadeSec > 0 && this.ctx && prevDeck.gain && nextDeck.gain) {
        const now = this.ctx.currentTime;
        // Equal-power fade curves
        const steps = 20;
        const outCurve = new Float32Array(steps);
        const inCurve = new Float32Array(steps);
        for (let i = 0; i < steps; i++) {
          const t = i / (steps - 1);
          outCurve[i] = Math.cos(t * Math.PI * 0.5);
          inCurve[i] = Math.sin(t * Math.PI * 0.5);
        }
        prevDeck.gain.gain.cancelScheduledValues(now);
        prevDeck.gain.gain.setValueCurveAtTime(outCurve, now, crossfadeSec);
        nextDeck.gain.gain.cancelScheduledValues(now);
        nextDeck.gain.gain.setValueCurveAtTime(inCurve, now, crossfadeSec);
        setTimeout(() => {
          if (this.activeIndex !== prevIndex) {
            prevDeck.el.pause();
            if (prevDeck.gain && this.ctx) prevDeck.gain.gain.setValueAtTime(1, this.ctx.currentTime);
          }
        }, crossfadeSec * 1000 + 80);
      } else {
        prevDeck.el.pause();
        if (nextDeck.gain && this.ctx) nextDeck.gain.gain.setValueAtTime(1, this.ctx.currentTime);
      }
    } else if (nextDeck.gain && this.ctx) {
      nextDeck.gain.gain.setValueAtTime(1, this.ctx.currentTime);
    }

    if (opts.autoplay !== false) {
      try {
        await nextDeck.el.play();
      } catch (err) {
        // Browser autoplay policy blocked playback before user gesture: pause gracefully.
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          this.emit({ type: 'state', playing: false, buffering: false });
        } else if (this.loadSeq === seq) {
          this.emit({ type: 'error', message: err instanceof Error ? err.message : 'Playback failed' });
        }
      }
    } else {
      this.emit({ type: 'state', playing: false, buffering: false });
    }
  }

  preload(track: Track) {
    if (!track.audioUrl) return;
    const idleIndex: 0 | 1 = this.activeIndex === 0 ? 1 : 0;
    const deck = this.decks[idleIndex];
    if (!deck.el.paused) return;
    if (deck.el.src !== track.audioUrl) {
      deck.el.src = track.audioUrl;
      deck.el.load();
    }
    this.preloadedDeck = idleIndex;
    this.preloadedUrl = track.audioUrl;
  }

  async play() {
    this.ensureAudioGraph();
    try {
      await this.active.el.play();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        this.emit({ type: 'state', playing: false, buffering: false });
      } else {
        throw err;
      }
    }
  }

  pause() {
    this.active.el.pause();
  }

  seek(ms: number) {
    const el = this.active.el;
    if (!Number.isFinite(el.duration) || el.duration <= 0) return;
    el.currentTime = Math.max(0, Math.min(ms / 1000, el.duration));
    this.emitTime();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    for (const d of this.decks) if (!d.useWebAudio) d.el.volume = this.volume;
  }

  setRate(rate: number) {
    this.rate = rate;
    this.active.el.playbackRate = rate;
  }

  subscribe(listener: (e: EngineEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    for (const d of this.decks) {
      d.el.pause();
      d.el.removeAttribute('src');
    }
    void this.ctx?.close();
  }

  private emit(e: EngineEvent) {
    this.listeners.forEach((l) => l(e));
  }

  private emitTime() {
    const el = this.active.el;
    if (!el.src) return;
    const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration * 1000 : 0;
    const pos = Number.isFinite(el.currentTime) ? el.currentTime * 1000 : 0;
    this.emit({ type: 'time', positionMs: pos, durationMs: dur });
  }
}
