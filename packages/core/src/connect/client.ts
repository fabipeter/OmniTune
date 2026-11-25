import type { KeyValueStorage } from '../library/store';
import type { PlayerController, PlayerSession } from '../player/controller';
import type { SyncClient } from '../sync/client';
import { secureId } from '../random';

export type ConnectDeviceType = 'web' | 'desktop-mac' | 'desktop-win' | 'ios' | 'android';

export type RemoteCommand =
  | 'toggle'
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'seek'
  | 'volume'
  | 'shuffle'
  | 'repeat';

export interface ConnectDevice {
  id: string;
  name: string;
  type: ConnectDeviceType;
  isActive: boolean;
  volume: number;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  currentTrack?: {
    id: string;
    title: string;
    artistName: string;
    artworkUrl: string;
  } | null;
  lastSeen: number;
}

export interface ConnectState {
  connected: boolean;
  thisDeviceId: string;
  thisDeviceName: string;
  thisDeviceType: ConnectDeviceType;
  activeDeviceId: string | null;
  devices: ConnectDevice[];
  roomCode: string;
  /** Non-null when playback is currently active on a DIFFERENT OmniTune device. */
  remoteActiveDevice: ConnectDevice | null;
  error?: string;
}

export interface ConnectClientOptions {
  baseUrl: string;
  deviceName: string;
  deviceType: ConnectDeviceType;
  storage: KeyValueStorage;
  player: PlayerController;
  syncClient?: SyncClient;
  fetch?: typeof fetch;
  onTransferIn?: (fromDeviceId?: string) => void;
  onHandoffOut?: (toDeviceId?: string) => void;
}

const DEVICE_ID_KEY = 'omnitune.connect.deviceId';
const ROOM_KEY = 'omnitune.connect.room';

function makeDeviceId(): string {
  return secureId('dev_');
}

/**
 * OmniTune Connect client (live device switching & remote control).
 * Maintains an SSE connection to `apps/server`, broadcasts local playback state,
 * transfers sessions seamlessly across Web, Desktop (macOS/Windows), iOS, and Android,
 * and sends/receives remote transport commands.
 */
export class ConnectClient {
  private base: string;
  private fetchImpl: typeof fetch;
  private storage: KeyValueStorage;
  private player: PlayerController;
  private syncClient?: SyncClient;
  private onTransferIn?: (fromDeviceId?: string) => void;
  private onHandoffOut?: (toDeviceId?: string) => void;

  private es: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private statePushTimer: ReturnType<typeof setInterval> | undefined;
  private unsubPlayer?: () => void;
  private unsubSync?: () => void;
  private listeners = new Set<() => void>();
  private state: ConnectState;
  private destroyed = false;
  private lastPushedTrackId: string | null = null;
  private lastPushedPlaying = false;

  constructor(opts: ConnectClientOptions) {
    this.base = opts.baseUrl.replace(/\/$/, '');
    this.fetchImpl = opts.fetch ?? ((...a) => fetch(...a));
    this.storage = opts.storage;
    this.player = opts.player;
    this.syncClient = opts.syncClient;
    this.onTransferIn = opts.onTransferIn;
    this.onHandoffOut = opts.onHandoffOut;

    this.state = {
      connected: false,
      thisDeviceId: '',
      thisDeviceName: opts.deviceName,
      thisDeviceType: opts.deviceType,
      activeDeviceId: null,
      devices: [],
      roomCode: 'local',
      remoteActiveDevice: null,
    };

    void this.init();
  }

  private async init() {
    let id = (await this.storage.getItem(DEVICE_ID_KEY)) ?? '';
    if (!id) {
      id = makeDeviceId();
      await this.storage.setItem(DEVICE_ID_KEY, id);
    }
    const room = (await this.storage.getItem(ROOM_KEY)) || 'local';
    this.setState({ thisDeviceId: id, roomCode: room });

    if (this.syncClient) {
      await this.syncClient.ready;
      this.unsubSync = this.syncClient.subscribe(() => this.reconnect());
    }

    this.unsubPlayer = this.player.subscribe(() => {
      const ps = this.player.getState();
      const changedTrack = ps.current?.id !== this.lastPushedTrackId;
      const startedPlaying = ps.playing && !this.lastPushedPlaying;
      if (changedTrack || ps.playing !== this.lastPushedPlaying) {
        this.lastPushedTrackId = ps.current?.id ?? null;
        this.lastPushedPlaying = ps.playing;
        void this.pushState(startedPlaying);
      }
    });

    this.statePushTimer = setInterval(() => {
      if (this.state.connected && this.player.getState().playing) {
        void this.pushState(false);
      }
    }, 3000);

    this.connect();
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getState = (): ConnectState => this.state;

  private setState(patch: Partial<ConnectState>) {
    const next = { ...this.state, ...patch };
    const remote =
      next.activeDeviceId && next.activeDeviceId !== next.thisDeviceId
        ? next.devices.find((d) => d.id === next.activeDeviceId) ?? null
        : null;
    this.state = { ...next, remoteActiveDevice: remote };
    this.listeners.forEach((l) => l());
  }

  async setRoomCode(code: string) {
    const clean = code.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'local';
    await this.storage.setItem(ROOM_KEY, clean);
    this.setState({ roomCode: clean });
    this.reconnect();
  }

  reconnect() {
    if (this.destroyed) return;
    this.closeStream();
    this.connect();
  }

  private closeStream() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }

  private async fetchSseTicket(): Promise<string | null> {
    if (!this.syncClient?.token) return null;
    try {
      const res = await this.fetchImpl(`${this.base}/connect/ticket`, {
        method: 'POST',
        headers: this.headers(),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { ticket?: string };
      return body.ticket ?? null;
    } catch {
      return null;
    }
  }

  private connect() {
    if (this.destroyed || typeof EventSource === 'undefined' || !this.state.thisDeviceId) return;
    this.closeStream();
    void this.openEventStream();
  }

  private async openEventStream() {
    const params = new URLSearchParams({
      deviceId: this.state.thisDeviceId,
      name: this.state.thisDeviceName,
      type: this.state.thisDeviceType,
      room: this.state.roomCode,
    });
    // Use a single-use 30s opaque ticket instead of placing the bearer JWT in the URL query string.
    const ticket = await this.fetchSseTicket();
    if (this.destroyed) return;
    if (ticket) params.set('ticket', ticket);

    const es = new EventSource(`${this.base}/connect/events?${params.toString()}`);
    this.es = es;

    es.onopen = () => {
      this.setState({ connected: true, error: undefined });
      if (this.player.getState().current) void this.pushState(this.player.getState().playing);
    };

    es.addEventListener('devices', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { devices: ConnectDevice[]; activeDeviceId: string | null };
        this.setState({ connected: true, devices: data.devices, activeDeviceId: data.activeDeviceId, error: undefined });
      } catch {
        /* ignore malformed */
      }
    });

    es.addEventListener('transfer-in', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as {
          fromDeviceId?: string;
          session?: PlayerSession;
          autoplay?: boolean;
        };
        if (data.session) {
          void this.player.restore(data.session, { autoplay: data.autoplay !== false });
          this.onTransferIn?.(data.fromDeviceId);
        }
      } catch {
        /* ignore */
      }
    });

    es.addEventListener('pause-handoff', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { toDeviceId?: string };
        this.player.pause();
        this.onHandoffOut?.(data.toDeviceId);
      } catch {
        this.player.pause();
      }
    });

    es.addEventListener('command', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { command: RemoteCommand; value?: number };
        this.applyRemoteCommand(data.command, data.value);
      } catch {
        /* ignore */
      }
    });

    es.onerror = () => {
      this.setState({ connected: false });
      this.closeStream();
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      }
    };
  }

  private applyRemoteCommand(cmd: RemoteCommand, value?: number) {
    switch (cmd) {
      case 'toggle':
        void this.player.toggle();
        break;
      case 'play':
        void this.player.resume();
        break;
      case 'pause':
        this.player.pause();
        break;
      case 'next':
        void this.player.next();
        break;
      case 'previous':
        void this.player.previous();
        break;
      case 'seek':
        if (typeof value === 'number') this.player.seek(value);
        break;
      case 'volume':
        if (typeof value === 'number') this.player.setVolume(value);
        break;
      case 'shuffle':
        this.player.toggleShuffle();
        break;
      case 'repeat':
        this.player.cycleRepeat();
        break;
    }
    setTimeout(() => void this.pushState(false), 150);
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (this.syncClient?.token) h.authorization = `Bearer ${this.syncClient.token}`;
    return h;
  }

  async pushState(claimActive: boolean) {
    if (!this.state.connected || !this.state.thisDeviceId) return;
    const ps = this.player.getState();
    const prog = this.player.getProgress();
    const cur = ps.current;
    try {
      await this.fetchImpl(`${this.base}/connect/state`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          deviceId: this.state.thisDeviceId,
          room: this.state.roomCode,
          name: this.state.thisDeviceName,
          type: this.state.thisDeviceType,
          playing: ps.playing,
          positionMs: Math.round(prog.positionMs),
          durationMs: Math.round(prog.durationMs),
          volume: ps.muted ? 0 : ps.volume,
          currentTrack: cur
            ? { id: cur.id, title: cur.title, artistName: cur.artistName, artworkUrl: cur.artworkUrl }
            : null,
          session: cur ? this.player.snapshot() : undefined,
          claimActive,
        }),
      });
    } catch {
      /* offline */
    }
  }

  /** Transfer playback to `targetDeviceId` (can be another device OR back to this device). */
  async transferTo(targetDeviceId: string, autoplay = true) {
    const localSnap = this.player.getState().current ? this.player.snapshot() : undefined;
    const res = await this.fetchImpl(`${this.base}/connect/transfer`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        fromDeviceId: this.state.thisDeviceId,
        targetDeviceId,
        room: this.state.roomCode,
        session: this.state.activeDeviceId === this.state.thisDeviceId ? localSnap : undefined,
        autoplay,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error || 'Device transfer failed');
    }
  }

  async sendCommand(targetDeviceId: string, command: RemoteCommand, value?: number) {
    await this.fetchImpl(`${this.base}/connect/command`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        targetDeviceId,
        room: this.state.roomCode,
        command,
        value,
      }),
    });
  }

  destroy() {
    this.destroyed = true;
    this.closeStream();
    if (this.statePushTimer) clearInterval(this.statePushTimer);
    this.unsubPlayer?.();
    this.unsubSync?.();
  }
}
