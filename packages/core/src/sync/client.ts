import type { EntryMap, LibraryStore, KeyValueStorage } from '../library/store';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

export interface SyncClientOptions {
  baseUrl: string;
  storage: KeyValueStorage;
  fetch?: typeof fetch;
}

const USER_KEY = 'omnitune.auth.user';
const CURSOR_KEY = 'omnitune.sync.cursor';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '10.0.2.2']);

type SyncEndpoint = '/auth/register' | '/auth/login' | '/sync';

const ENDPOINT_MAP: Record<SyncEndpoint, string> = {
  '/auth/register': '/auth/register',
  '/auth/login': '/auth/login',
  '/sync': '/sync',
};

function sanitizeBaseUrl(raw: string): string {
  const parsed = new URL(raw);
  const isHttps = parsed.protocol === 'https:';
  const isLoopbackHttp = parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname);
  if (!isHttps && !isLoopbackHttp) {
    throw new Error('Sync server URL must use HTTPS (HTTP is only allowed for localhost)');
  }
  return parsed.toString().replace(/\/$/, '');
}

/**
 * Talks to apps/server: auth + last-write-wins library sync so playlists/likes follow you across devices.
 * Auth tokens are held strictly in memory (never written to plaintext storage).
 */
export class SyncClient {
  private base: string;
  private fetchImpl: typeof fetch;
  private storage: KeyValueStorage;
  token: string | null = null;
  user: SessionUser | null = null;
  private listeners = new Set<() => void>();
  ready: Promise<void>;

  constructor(opts: SyncClientOptions) {
    this.base = sanitizeBaseUrl(opts.baseUrl);
    this.fetchImpl = opts.fetch ?? ((...a) => fetch(...a));
    this.storage = opts.storage;
    this.ready = Promise.resolve();
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  get baseUrl() {
    return this.base;
  }
  get signedIn() {
    return !!this.token;
  }

  private async req<T>(endpoint: SyncEndpoint, init: RequestInit & { json?: unknown } = {}): Promise<T> {
    const safePath = ENDPOINT_MAP[endpoint];
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    const target = `${this.base}${safePath}`;
    const res = await this.fetchImpl(target, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
    return body as T;
  }

  private async setSession(token: string | null, user: SessionUser | null) {
    this.token = token;
    this.user = user;
    if (token && user) {
      await this.storage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      await this.storage.removeItem?.(USER_KEY);
      await this.storage.removeItem?.(CURSOR_KEY);
    }
    this.listeners.forEach((l) => l());
  }

  async register(email: string, password: string, displayName: string) {
    const r = await this.req<{ token: string; user: SessionUser }>('/auth/register', { method: 'POST', json: { email, password, displayName } });
    await this.setSession(r.token, r.user);
    return r.user;
  }
  async login(email: string, password: string) {
    const r = await this.req<{ token: string; user: SessionUser }>('/auth/login', { method: 'POST', json: { email, password } });
    await this.setSession(r.token, r.user);
    return r.user;
  }
  async logout() {
    await this.setSession(null, null);
  }

  /** Push local changes and pull remote ones. Safe to call repeatedly (e.g. on a timer or after edits). */
  async sync(library: LibraryStore): Promise<{ pulled: number }> {
    if (!this.token) return { pulled: 0 };
    await library.ready;
    const startedAt = Date.now();
    const cur = JSON.parse((await this.storage.getItem(CURSOR_KEY)) ?? '{"pushed":0,"cursor":0}') as { pushed: number; cursor: number };
    const push = library.entriesSince(cur.pushed);
    const res = await this.req<{ cursor: number; entries: EntryMap }>('/sync', { method: 'POST', json: { cursor: cur.cursor, entries: push } });
    const pulled = library.mergeRemote(res.entries);
    await this.storage.setItem(CURSOR_KEY, JSON.stringify({ pushed: startedAt, cursor: res.cursor }));
    return { pulled };
  }
}
