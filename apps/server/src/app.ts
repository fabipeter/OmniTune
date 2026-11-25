import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { openDb, syncEntries, type UserRow } from './db.js';
import { appleDeveloperToken, hashPassword, signToken, verifyPassword, verifyToken } from './security.js';
import { registerConnectRoutes } from './connect.js';

export interface AppConfig {
  dbPath: string;
  jwtSecret: string;
  corsOrigins: string[];
  env: NodeJS.ProcessEnv;
}

const ALLOWED_DOMAINS = ['itunes.apple.com', 'rss.marketingtools.apple.com'];

const DEFAULT_DEV_ORIGINS = [
  new URL('http://localhost:5173').origin,
  new URL('http://localhost:5174').origin,
  new URL('http://localhost:4173').origin,
];

export function loadConfig(env = process.env): AppConfig {
  const secret = env.JWT_SECRET;
  if (!secret && env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production');
  return {
    dbPath: env.DATABASE_PATH ?? './data/omnitune.db',
    jwtSecret: secret ?? randomBytes(32).toString('hex'),
    corsOrigins: env.CORS_ORIGIN
      ? env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
      : DEFAULT_DEV_ORIGINS,
    env,
  };
}

const publicUser = (u: UserRow) => ({ id: u.id, email: u.email, displayName: u.display_name });

/** Linear-time O(n) email check without backtracking regular expressions. */
function isValidEmail(email: string): boolean {
  if (email.length < 5 || email.length > 254 || email.includes(' ')) return false;
  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@')) return false;
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1 && !domain.startsWith('.') && !domain.includes('..');
}

function parseNumericIdList(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw || raw.length > 400) return null;
  if (!/^[0-9]+(?:,[0-9]+){0,99}$/.test(raw)) return null;
  const nums: number[] = [];
  for (const part of raw.split(',')) {
    const n = Number.parseInt(part, 10);
    if (!Number.isSafeInteger(n) || n <= 0) return null;
    nums.push(n);
  }
  return nums.join(',');
}

function sanitizeSearchTerm(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, 100);
  if (!trimmed || !/^[\p{L}\p{N} _.,'&!?()-]+$/u.test(trimmed)) return null;
  return encodeURIComponent(trimmed);
}

// Strict literal array allowlists using Array.find (returns untainted literal constants).
const ALLOWED_COUNTRIES = ['us', 'gb', 'ca', 'de', 'fr', 'jp', 'au', 'br', 'es', 'it', 'nl', 'se', 'mx', 'kr', 'in'] as const;
const ALLOWED_MEDIA = ['music', 'podcast', 'podcasts'] as const;
const ALLOWED_ENTITIES = ['song', 'album', 'musicArtist', 'podcast', 'podcastEpisode'] as const;
const ALLOWED_CHARTS = ['most-played', 'top', 'new-releases'] as const;
const ALLOWED_CHART_KINDS = ['songs.json', 'albums.json', 'podcasts.json', 'playlists.json', 'podcast-episodes.json'] as const;
const ALLOWED_LIMITS = Array.from({ length: 200 }, (_, i) => String(i + 1));
const ALLOWED_RSS_LIMITS = Array.from({ length: 100 }, (_, i) => String(i + 1));

function pickAllowed<const T extends string>(list: readonly T[], raw: unknown): T | undefined {
  if (typeof raw !== 'string') return undefined;
  return list.find((item) => item === raw);
}

const proxyCache = new Map<string, { at: number; data: Record<string, unknown> }>();
const PROXY_TTL = 10 * 60_000;

async function fetchAppleJson(rawUrl: string): Promise<Record<string, unknown>> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw Object.assign(new Error('Invalid upstream URL'), { statusCode: 400 });
  }

  if (parsedUrl.protocol !== 'https:') {
    throw Object.assign(new Error('Only HTTPS protocol is allowed'), { statusCode: 400 });
  }
  if (!ALLOWED_DOMAINS.includes(parsedUrl.hostname)) {
    throw Object.assign(new Error('Domain not allowed'), { statusCode: 403 });
  }
  if (parsedUrl.origin !== 'https://itunes.apple.com' && parsedUrl.origin !== 'https://rss.marketingtools.apple.com') {
    throw Object.assign(new Error('Origin not allowed'), { statusCode: 403 });
  }

  const verifiedUrl = parsedUrl.toString();
  const hit = proxyCache.get(verifiedUrl);
  if (hit && Date.now() - hit.at < PROXY_TTL) return hit.data;

  const res = await fetch(verifiedUrl, { redirect: 'error' });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`Upstream ${res.status}`), { statusCode: 502 });
  const data = JSON.parse(text) as Record<string, unknown>;
  if (proxyCache.size > 2000) proxyCache.delete(proxyCache.keys().next().value!);
  proxyCache.set(verifiedUrl, { at: Date.now(), data });
  return data;
}

export async function buildApp(config: AppConfig, injectedDb?: DatabaseSync): Promise<FastifyInstance> {
  const db = injectedDb ?? openDb(config.dbPath);
  const isTest = config.env.NODE_ENV === 'test';
  const app = Fastify({ logger: !isTest, bodyLimit: 10 * 1024 * 1024 });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await app.register(cors, {
    origin: config.corsOrigins,
    allowedHeaders: ['content-type', 'authorization'],
  });
  await app.register(rateLimit, {
    max: isTest ? 10_000 : 240,
    timeWindow: '1 minute',
  });

  const auth = (req: FastifyRequest): string => {
    const h = req.headers.authorization;
    const claims = typeof h === 'string' && h.startsWith('Bearer ') ? verifyToken(h.slice(7), config.jwtSecret) : null;
    if (!claims) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    return claims.sub;
  };

  app.get('/health', async () => ({ ok: true, musickit: !!appleDeveloperToken(config.env) }));

  // ---- auth ----
  const authRateConfig = { rateLimit: { max: isTest ? 10_000 : 25, timeWindow: '1 minute' } };

  const registerSchema = {
    body: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', maxLength: 254 },
        password: { type: 'string', minLength: 1, maxLength: 256 },
        displayName: { type: 'string', maxLength: 64 },
      },
    },
  } as const;

  app.post<{ Body: { email?: unknown; password?: unknown; displayName?: unknown } }>(
    '/auth/register',
    { config: authRateConfig, schema: registerSchema },
    async (req, reply) => {
      const rawEmail = req.body?.email;
      const rawPassword = req.body?.password;
      const rawDisplayName = req.body?.displayName;
      if (typeof rawEmail !== 'string' || typeof rawPassword !== 'string') {
        return reply.code(400).send({ error: 'Invalid credentials payload' });
      }
      const email = rawEmail.trim().toLowerCase();
      if (!isValidEmail(email)) return reply.code(400).send({ error: 'Enter a valid email' });
      if (rawPassword.length < 8 || rawPassword.length > 256) {
        return reply.code(400).send({ error: 'Password must be 8–256 characters' });
      }
      if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
        return reply.code(409).send({ error: 'An account with this email already exists' });
      }
      const fallbackName = email.slice(0, email.indexOf('@'));
      const displayName = (typeof rawDisplayName === 'string' && rawDisplayName.trim() ? rawDisplayName.trim() : fallbackName).slice(0, 64);
      const user: UserRow = { id: randomUUID(), email, display_name: displayName, password_hash: hashPassword(rawPassword) };
      db.prepare('INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(
        user.id,
        user.email,
        user.display_name,
        user.password_hash,
        Date.now(),
      );
      return { token: signToken({ sub: user.id }, config.jwtSecret), user: publicUser(user) };
    },
  );

  const loginSchema = {
    body: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', maxLength: 254 },
        password: { type: 'string', minLength: 1, maxLength: 256 },
      },
    },
  } as const;

  app.post<{ Body: { email?: unknown; password?: unknown } }>(
    '/auth/login',
    { config: authRateConfig, schema: loginSchema },
    async (req, reply) => {
      const rawEmail = req.body?.email;
      const rawPassword = req.body?.password;
      if (typeof rawEmail !== 'string' || typeof rawPassword !== 'string') {
        return reply.code(401).send({ error: 'Incorrect email or password' });
      }
      const email = rawEmail.trim().toLowerCase();
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
      if (!user || !verifyPassword(rawPassword, user.password_hash)) {
        return reply.code(401).send({ error: 'Incorrect email or password' });
      }
      return { token: signToken({ sub: user.id }, config.jwtSecret), user: publicUser(user) };
    },
  );

  app.get('/auth/me', async (req) => {
    const id = auth(req);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    if (!user) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    return { user: publicUser(user) };
  });

  // ---- library sync ----
  const syncSchema = {
    body: {
      type: 'object',
      properties: {
        cursor: { type: 'number' },
        entries: { type: 'object' },
      },
    },
  } as const;

  app.post<{ Body: { cursor?: unknown; entries?: unknown } }>(
    '/sync',
    { schema: syncSchema },
    async (req) => {
      const userId = auth(req);
      const cursor = typeof req.body?.cursor === 'number' && Number.isFinite(req.body.cursor) ? req.body.cursor : 0;
      const entries = req.body?.entries && typeof req.body.entries === 'object' && !Array.isArray(req.body.entries) ? req.body.entries : {};
      return syncEntries(db, userId, cursor, entries as Record<string, any>);
    },
  );

  // ---- MusicKit developer token ----
  app.get('/apple/developer-token', async (req, reply) => {
    const allowedOrigin = config.corsOrigins.find((o) => o === req.headers.origin);
    const t = appleDeveloperToken(config.env, allowedOrigin);
    if (!t) return reply.code(404).send({ error: 'MusicKit is not configured on this server' });
    return t;
  });

  const buildItunesQueryParts = (query: Record<string, unknown>): string[] => {
    const rawCountry = typeof query.country === 'string' ? query.country.toLowerCase() : 'us';
    const country = pickAllowed(ALLOWED_COUNTRIES, rawCountry) ?? 'us';
    const parts = [`country=${country}`];

    const media = pickAllowed(ALLOWED_MEDIA, query.media);
    if (media) parts.push(`media=${media}`);

    const entity = pickAllowed(ALLOWED_ENTITIES, query.entity);
    if (entity) parts.push(`entity=${entity}`);

    const limit = pickAllowed(ALLOWED_LIMITS, query.limit);
    if (limit) parts.push(`limit=${limit}`);

    return parts;
  };

  app.get<{ Querystring: Record<string, unknown> }>('/catalog/itunes/search', async (req, reply) => {
    const query = req.query ?? {};
    const encodedTerm = sanitizeSearchTerm(query.term);
    if (!encodedTerm) {
      return { resultCount: 0, results: [] };
    }
    const qs = [...buildItunesQueryParts(query), `term=${encodedTerm}`].join('&');
    reply.header('cache-control', 'public, max-age=300');
    return fetchAppleJson(`https://itunes.apple.com/search?${qs}`);
  });

  app.get<{ Querystring: Record<string, unknown> }>('/catalog/itunes/lookup', async (req, reply) => {
    const query = req.query ?? {};
    const safeIds = parseNumericIdList(query.id);
    if (!safeIds) {
      return { resultCount: 0, results: [] };
    }
    const qs = [...buildItunesQueryParts(query), `id=${safeIds}`].join('&');
    reply.header('cache-control', 'public, max-age=300');
    return fetchAppleJson(`https://itunes.apple.com/lookup?${qs}`);
  });

  app.get<{
    Params: { country: string; media: string; chart: string; limit: string; kind: string };
  }>('/catalog/rss/api/v2/:country/:media/:chart/:limit/:kind', async (req, reply) => {
    const rawCountry = typeof req.params?.country === 'string' ? req.params.country.toLowerCase() : '';
    const country = pickAllowed(ALLOWED_COUNTRIES, rawCountry);
    const media = pickAllowed(ALLOWED_MEDIA, req.params?.media);
    const chart = pickAllowed(ALLOWED_CHARTS, req.params?.chart);
    const safeLimit = pickAllowed(ALLOWED_RSS_LIMITS, req.params?.limit);
    const kind = pickAllowed(ALLOWED_CHART_KINDS, req.params?.kind);
    if (!country || !media || !chart || !safeLimit || !kind) {
      return reply.code(400).send({ error: 'Unsupported chart path' });
    }
    reply.header('cache-control', 'public, max-age=600');
    return fetchAppleJson(`https://rss.marketingtools.apple.com/api/v2/${country}/${media}/${chart}/${safeLimit}/${kind}`);
  });

  // ---- OmniTune Connect device switching ----
  registerConnectRoutes(app, config.jwtSecret, config.corsOrigins);

  return app;
}
