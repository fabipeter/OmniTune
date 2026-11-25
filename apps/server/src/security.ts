import { createHmac, randomBytes, scryptSync, timingSafeEqual, createPrivateKey, sign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

/** Minimal HS256 JWT (no external dependency). */
export function signToken(payload: Record<string, unknown>, secret: string, ttlSeconds = 60 * 60 * 24 * 90): string {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string, secret: string): { sub: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  if (!h || !p || !s) return null;
  try {
    // Explicitly enforce HS256 to prevent algorithm-confusion attacks.
    const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as { alg?: string; typ?: string };
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;

    const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest();
    const given = Buffer.from(s, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as { sub?: unknown; exp?: unknown };
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

function readSafeKeyFile(rawPath: string): string | null {
  if (!rawPath || rawPath.includes('\0')) return null;
  const resolved = resolve(rawPath);
  const ext = extname(resolved).toLowerCase();
  if (ext !== '.p8' && ext !== '.pem') return null;
  if (!existsSync(resolved)) return null;
  return readFileSync(resolved, 'utf8');
}

/**
 * MusicKit developer token (ES256 JWT). Requires a developer program membership and a MusicKit key:
 * APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY (the .p8 contents) or APPLE_PRIVATE_KEY_PATH.
 */
export function appleDeveloperToken(env: NodeJS.ProcessEnv, origin?: string): { token: string; expiresAt: number } | null {
  const teamId = env.APPLE_TEAM_ID;
  const keyId = env.APPLE_KEY_ID;
  let pem = env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n') ?? null;
  if (!pem && env.APPLE_PRIVATE_KEY_PATH) pem = readSafeKeyFile(env.APPLE_PRIVATE_KEY_PATH);
  if (!teamId || !keyId || !pem) return null;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 12;
  const header = b64u(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: teamId, iat: now, exp, ...(origin ? { origin: [origin] } : {}) }));
  const sig = sign('sha256', Buffer.from(`${header}.${body}`), { key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' });
  return { token: `${header}.${body}.${b64u(sig)}`, expiresAt: exp * 1000 };
}
