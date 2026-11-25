import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyToken } from './security.js';

export type DeviceType = 'web' | 'desktop-mac' | 'desktop-win' | 'ios' | 'android';

export interface ConnectTrackSummary {
  id: string;
  title: string;
  artistName: string;
  artworkUrl: string;
}

export interface ConnectDevice {
  id: string;
  name: string;
  type: DeviceType;
  isActive: boolean;
  volume: number;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  currentTrack?: ConnectTrackSummary | null;
  lastSeen: number;
}

interface LiveClient {
  device: ConnectDevice;
  reply: FastifyReply;
  keepalive: ReturnType<typeof setInterval>;
}

interface RoomState {
  clients: Map<string, LiveClient>;
  activeDeviceId: string | null;
  lastSession: Record<string, unknown> | null;
}

type SseEventName = 'devices' | 'transfer-in' | 'pause-handoff' | 'command';

const ALLOWED_EVENTS: Record<SseEventName, SseEventName> = {
  devices: 'devices',
  'transfer-in': 'transfer-in',
  'pause-handoff': 'pause-handoff',
  command: 'command',
};

const ALLOWED_DEVICE_TYPES = new Map<string, DeviceType>([
  ['web', 'web'],
  ['desktop-mac', 'desktop-mac'],
  ['desktop-win', 'desktop-win'],
  ['ios', 'ios'],
  ['android', 'android'],
]);

const ALLOWED_COMMANDS = new Map<string, string>([
  ['toggle', 'toggle'],
  ['play', 'play'],
  ['pause', 'pause'],
  ['next', 'next'],
  ['previous', 'previous'],
  ['seek', 'seek'],
  ['volume', 'volume'],
  ['shuffle', 'shuffle'],
  ['repeat', 'repeat'],
]);

const rooms = new Map<string, RoomState>();
const sseTickets = new Map<string, { userId: string; expiresAt: number }>();

function cleanText(raw: unknown, fallback: string, maxLen = 64): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, maxLen);
  return cleaned || fallback;
}

function cleanId(raw: unknown, maxLen = 64): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, maxLen);
}

function issueSseTicket(userId: string): string {
  const now = Date.now();
  for (const [k, v] of sseTickets) if (v.expiresAt < now) sseTickets.delete(k);
  const ticket = randomBytes(24).toString('base64url');
  sseTickets.set(ticket, { userId, expiresAt: now + 30_000 });
  return ticket;
}

function consumeSseTicket(ticket: string): string | null {
  const entry = sseTickets.get(ticket);
  if (!entry) return null;
  sseTickets.delete(ticket);
  if (entry.expiresAt < Date.now()) return null;
  return entry.userId;
}

function getRoom(key: string): RoomState {
  let r = rooms.get(key);
  if (!r) {
    r = { clients: new Map(), activeDeviceId: null, lastSession: null };
    rooms.set(key, r);
  }
  return r;
}

/** Escape HTML metacharacters inside JSON frames before writing to the SSE stream. */
function safeJsonFrame(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function sendEvent(reply: FastifyReply, event: SseEventName, data: unknown) {
  const safeEvent = ALLOWED_EVENTS[event];
  const frame = Buffer.from(`event: ${safeEvent}\ndata: ${safeJsonFrame(data)}\n\n`, 'utf8');
  try {
    reply.raw.write(frame);
  } catch {
    /* client disconnected */
  }
}

function roomSnapshot(room: RoomState) {
  const devices = [...room.clients.values()].map((c) => ({
    ...c.device,
    isActive: c.device.id === room.activeDeviceId,
  }));
  return { devices, activeDeviceId: room.activeDeviceId };
}

function broadcastDevices(room: RoomState) {
  const snap = roomSnapshot(room);
  for (const c of room.clients.values()) sendEvent(c.reply, 'devices', snap);
}

function resolveRoomKey(req: FastifyRequest, jwtSecret: string, explicitRoom?: string): string {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) {
    const claims = verifyToken(h.slice(7), jwtSecret);
    if (claims?.sub) return `user:${claims.sub}`;
  }
  const q = (req.query ?? {}) as Record<string, string | undefined>;
  if (q.ticket) {
    const uid = consumeSseTicket(q.ticket);
    if (uid) return `user:${uid}`;
  }
  const code = cleanId(explicitRoom || q.room || 'local', 32).toLowerCase() || 'local';
  return `room:${code}`;
}

export function registerConnectRoutes(app: FastifyInstance, jwtSecret: string, allowedOrigins: string[]) {
  app.post('/connect/ticket', async (req, reply) => {
    const h = req.headers.authorization;
    const claims = h?.startsWith('Bearer ') ? verifyToken(h.slice(7), jwtSecret) : null;
    if (!claims) return reply.code(401).send({ error: 'Unauthorized' });
    return { ticket: issueSseTicket(claims.sub) };
  });

  app.get('/connect/events', async (req, reply) => {
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    const deviceId = cleanId(q.deviceId);
    if (!deviceId) return reply.code(400).send({ error: 'deviceId is required' });

    const roomKey = resolveRoomKey(req, jwtSecret, q.room);
    const room = getRoom(roomKey);
    const type = ALLOWED_DEVICE_TYPES.get(q.type ?? '') ?? 'web';
    const name = cleanText(q.name, 'OmniTune Device');

    const prev = room.clients.get(deviceId);
    if (prev) {
      clearInterval(prev.keepalive);
      try {
        prev.reply.raw.end();
      } catch {
        /* ignore */
      }
    }

    // Match strictly against configured allowlist; emit the allowlist value (never raw request header).
    const matchedOrigin = allowedOrigins.find((allowed) => allowed === req.headers.origin);
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff',
      'X-Accel-Buffering': 'no',
    };
    if (matchedOrigin) {
      headers['Access-Control-Allow-Origin'] = matchedOrigin;
      headers['Vary'] = 'Origin';
    }

    reply.hijack();
    reply.raw.writeHead(200, headers);

    const device: ConnectDevice = {
      id: deviceId,
      name,
      type,
      isActive: room.activeDeviceId === deviceId || room.clients.size === 0,
      volume: prev?.device.volume ?? 1,
      playing: prev?.device.playing ?? false,
      positionMs: prev?.device.positionMs ?? 0,
      durationMs: prev?.device.durationMs ?? 0,
      currentTrack: prev?.device.currentTrack ?? null,
      lastSeen: Date.now(),
    };
    if (!room.activeDeviceId) room.activeDeviceId = deviceId;

    const keepalive = setInterval(() => {
      try {
        reply.raw.write(Buffer.from(': keepalive\n\n', 'utf8'));
      } catch {
        clearInterval(keepalive);
      }
    }, 20_000);

    room.clients.set(deviceId, { device, reply, keepalive });
    broadcastDevices(room);

    req.raw.on('close', () => {
      clearInterval(keepalive);
      const cur = room.clients.get(deviceId);
      if (cur?.reply === reply) {
        room.clients.delete(deviceId);
        if (room.activeDeviceId === deviceId) {
          room.activeDeviceId = room.clients.keys().next().value ?? null;
        }
        if (room.clients.size === 0) rooms.delete(roomKey);
        else broadcastDevices(room);
      }
    });
  });

  app.get('/connect/devices', async (req) => {
    const roomKey = resolveRoomKey(req, jwtSecret);
    const room = rooms.get(roomKey);
    if (!room) return { devices: [], activeDeviceId: null };
    return roomSnapshot(room);
  });

  app.post<{
    Body: {
      deviceId: string;
      room?: string;
      name?: string;
      type?: DeviceType;
      playing?: boolean;
      positionMs?: number;
      durationMs?: number;
      volume?: number;
      currentTrack?: ConnectTrackSummary | null;
      session?: Record<string, unknown>;
      claimActive?: boolean;
    };
  }>('/connect/state', async (req, reply) => {
    const body = req.body;
    const deviceId = cleanId(body?.deviceId);
    if (!deviceId) return reply.code(400).send({ error: 'deviceId is required' });
    const room = getRoom(resolveRoomKey(req, jwtSecret, body.room));
    const entry = room.clients.get(deviceId);
    if (entry) {
      if (body.name) entry.device.name = cleanText(body.name, entry.device.name);
      const nextType = body.type ? ALLOWED_DEVICE_TYPES.get(body.type) : undefined;
      if (nextType) entry.device.type = nextType;
      if (typeof body.playing === 'boolean') entry.device.playing = body.playing;
      if (typeof body.positionMs === 'number' && Number.isFinite(body.positionMs)) entry.device.positionMs = body.positionMs;
      if (typeof body.durationMs === 'number' && Number.isFinite(body.durationMs)) entry.device.durationMs = body.durationMs;
      if (typeof body.volume === 'number' && Number.isFinite(body.volume)) entry.device.volume = Math.max(0, Math.min(1, body.volume));
      if (body.currentTrack === null) {
        entry.device.currentTrack = null;
      } else if (body.currentTrack) {
        entry.device.currentTrack = {
          id: cleanId(body.currentTrack.id),
          title: cleanText(body.currentTrack.title, '', 140),
          artistName: cleanText(body.currentTrack.artistName, '', 140),
          artworkUrl: cleanText(body.currentTrack.artworkUrl, '', 512),
        };
      }
      entry.device.lastSeen = Date.now();
    }
    if (body.claimActive || body.playing) {
      const prevActive = room.activeDeviceId;
      room.activeDeviceId = deviceId;
      if (prevActive && prevActive !== deviceId && body.playing) {
        const prevClient = room.clients.get(prevActive);
        if (prevClient) {
          prevClient.device.playing = false;
          sendEvent(prevClient.reply, 'pause-handoff', { toDeviceId: deviceId });
        }
      }
    }
    if (body.session && typeof body.session === 'object') room.lastSession = body.session;
    broadcastDevices(room);
    return { ok: true, activeDeviceId: room.activeDeviceId };
  });

  app.post<{
    Body: {
      fromDeviceId?: string;
      targetDeviceId: string;
      room?: string;
      session?: Record<string, unknown>;
      autoplay?: boolean;
    };
  }>('/connect/transfer', async (req, reply) => {
    const body = req.body;
    const targetDeviceId = cleanId(body?.targetDeviceId);
    if (!targetDeviceId) return reply.code(400).send({ error: 'targetDeviceId is required' });
    const room = getRoom(resolveRoomKey(req, jwtSecret, body.room));
    const target = room.clients.get(targetDeviceId);
    if (!target) return reply.code(404).send({ error: 'Target device is not connected' });

    const prevId = room.activeDeviceId;
    const session = body.session ?? room.lastSession;
    if (session && typeof session === 'object') room.lastSession = session;

    if (prevId && prevId !== targetDeviceId) {
      const prev = room.clients.get(prevId);
      if (prev) {
        prev.device.playing = false;
        sendEvent(prev.reply, 'pause-handoff', { toDeviceId: targetDeviceId });
      }
    }

    room.activeDeviceId = targetDeviceId;
    const autoplay = body.autoplay !== false;
    target.device.playing = autoplay;
    sendEvent(target.reply, 'transfer-in', {
      fromDeviceId: cleanId(body.fromDeviceId) || prevId,
      session,
      autoplay,
    });
    broadcastDevices(room);
    return { ok: true, activeDeviceId: room.activeDeviceId };
  });

  app.post<{
    Body: {
      targetDeviceId: string;
      room?: string;
      command: string;
      value?: number;
    };
  }>('/connect/command', async (req, reply) => {
    const body = req.body;
    const targetDeviceId = cleanId(body?.targetDeviceId);
    const command = ALLOWED_COMMANDS.get(body?.command ?? '');
    if (!targetDeviceId || !command) return reply.code(400).send({ error: 'targetDeviceId and valid command are required' });
    const room = getRoom(resolveRoomKey(req, jwtSecret, body.room));
    const target = room.clients.get(targetDeviceId);
    if (!target) return reply.code(404).send({ error: 'Target device is not connected' });
    const value = typeof body.value === 'number' && Number.isFinite(body.value) ? body.value : undefined;
    sendEvent(target.reply, 'command', { command, value });
    return { ok: true };
  });
}
