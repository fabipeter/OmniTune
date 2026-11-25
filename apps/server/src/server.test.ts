import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, loadConfig } from './app.js';
import { openDb } from './db.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp(loadConfig({ NODE_ENV: 'test', JWT_SECRET: randomBytes(32).toString('hex') } as any), openDb(':memory:'));
});
afterAll(() => app.close());

const post = (url: string, payload: unknown, token?: string) =>
  app.inject({ method: 'POST', url, payload: payload as any, headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('auth + sync', () => {
  it('registers, rejects duplicates and bad logins, logs in', async () => {
    const validPass = randomBytes(12).toString('hex');
    const wrongPass = randomBytes(12).toString('hex');

    const r = await post('/auth/register', { email: 'a@b.co', password: validPass, displayName: 'A' });
    expect(r.statusCode).toBe(200);
    expect((await post('/auth/register', { email: 'a@b.co', password: validPass })).statusCode).toBe(409);
    expect((await post('/auth/login', { email: 'a@b.co', password: wrongPass })).statusCode).toBe(401);
    expect((await post('/auth/login', { email: 'a@b.co', password: validPass })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/auth/me' })).statusCode).toBe(401);
  });

  it('syncs entries between two devices with last-write-wins', async () => {
    const syncPass = randomBytes(12).toString('hex');
    const { token } = (await post('/auth/register', { email: 'sync@b.co', password: syncPass })).json();
    const t1 = 1000;
    const first = (await post('/sync', { cursor: 0, entries: { likedTracks: [{ id: '1', value: { id: '1' }, updatedAt: t1 }] } }, token)).json();
    expect(first.entries.likedTracks).toHaveLength(1);

    // Device B pulls from cursor 0
    const b = (await post('/sync', { cursor: 0, entries: {} }, token)).json();
    expect(b.entries.likedTracks[0].id).toBe('1');

    // Stale write loses, newer tombstone wins
    await post('/sync', { cursor: b.cursor, entries: { likedTracks: [{ id: '1', value: { id: 'stale' }, updatedAt: 500 }] } }, token);
    const del = (await post('/sync', { cursor: b.cursor, entries: { likedTracks: [{ id: '1', value: null, updatedAt: 2000, deleted: true }] } }, token)).json();
    expect(del.entries.likedTracks[0]).toMatchObject({ id: '1', deleted: true });
  });

  it('reports MusicKit as unconfigured by default', async () => {
    expect((await app.inject({ method: 'GET', url: '/apple/developer-token' })).statusCode).toBe(404);
  });

  it('registers devices, transfers playback, and delivers remote commands via Connect SSE', async () => {
    const addr = await app.listen({ port: 0, host: '127.0.0.1' });
    const ac1 = new AbortController();
    const ac2 = new AbortController();
    try {
      const openStream = async (id: string, name: string, type: string, ac: AbortController) => {
        const res = await fetch(`${addr}/connect/events?deviceId=${id}&name=${encodeURIComponent(name)}&type=${type}&room=testroom`, {
          signal: ac.signal,
        });
        expect(res.status).toBe(200);
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        const events: Array<{ event: string; data: any }> = [];
        void (async () => {
          let buf = '';
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              const frames = buf.split('\n\n');
              buf = frames.pop() ?? '';
              for (const f of frames) {
                const evMatch = f.match(/^event:\s*(.+)$/m);
                const dataMatch = f.match(/^data:\s*(.+)$/m);
                if (evMatch && dataMatch) events.push({ event: evMatch[1].trim(), data: JSON.parse(dataMatch[1]) });
              }
            }
          } catch {
            /* aborted */
          }
        })();
        return events;
      };

      const ev1 = await openStream('dev1', 'Mac Desktop', 'desktop-mac', ac1);
      const ev2 = await openStream('dev2', 'iPhone', 'ios', ac2);
      await new Promise((r) => setTimeout(r, 80));

      const devRes = await fetch(`${addr}/connect/devices?room=testroom`);
      const list = (await devRes.json()) as { devices: Array<{ id: string }> };
      expect(list.devices.map((d) => d.id).sort()).toEqual(['dev1', 'dev2']);

      // Transfer playback from dev1 -> dev2
      const session = { current: { id: '42', title: 'One More Time' }, positionMs: 12000 };
      const tr = await fetch(`${addr}/connect/transfer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fromDeviceId: 'dev1', targetDeviceId: 'dev2', room: 'testroom', session, autoplay: true }),
      });
      expect(tr.status).toBe(200);

      // Send remote command to dev2
      const cmd = await fetch(`${addr}/connect/command`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetDeviceId: 'dev2', room: 'testroom', command: 'next' }),
      });
      expect(cmd.status).toBe(200);
      await new Promise((r) => setTimeout(r, 80));

      expect(ev1.some((e) => e.event === 'pause-handoff' && e.data.toDeviceId === 'dev2')).toBe(true);
      expect(ev2.some((e) => e.event === 'transfer-in' && e.data.session?.current?.id === '42')).toBe(true);
      expect(ev2.some((e) => e.event === 'command' && e.data.command === 'next')).toBe(true);
    } finally {
      ac1.abort();
      ac2.abort();
    }
  });
});
