import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const COLLECTIONS = ['likedTracks', 'savedAlbums', 'followedArtists', 'followedPodcasts', 'playlists', 'history', 'episodeProgress', 'settings'] as const;
export type Collection = (typeof COLLECTIONS)[number];

export interface Entry {
  id: string;
  value: unknown;
  updatedAt: number;
  deleted?: boolean;
}

export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
}

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      seq INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entries (
      user_id TEXT NOT NULL,
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      value TEXT,
      updated_at INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      seq INTEGER NOT NULL,
      PRIMARY KEY (user_id, collection, id)
    );
    CREATE INDEX IF NOT EXISTS entries_seq ON entries (user_id, seq);
  `);
  return db;
}

/** Last-write-wins merge of client entries, then return everything newer than `cursor`. */
export function syncEntries(db: DatabaseSync, userId: string, cursor: number, pushed: Partial<Record<Collection, Entry[]>>) {
  const get = db.prepare('SELECT updated_at FROM entries WHERE user_id = ? AND collection = ? AND id = ?');
  const upsert = db.prepare(`
    INSERT INTO entries (user_id, collection, id, value, updated_at, deleted, seq) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, collection, id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, deleted = excluded.deleted, seq = excluded.seq`);
  const bump = db.prepare('UPDATE users SET seq = seq + 1 WHERE id = ? RETURNING seq');

  db.exec('BEGIN');
  try {
    for (const c of COLLECTIONS) {
      for (const e of pushed[c] ?? []) {
        const existing = get.get(userId, c, e.id) as { updated_at: number } | undefined;
        if (existing && existing.updated_at >= e.updatedAt) continue;
        const { seq } = bump.get(userId) as { seq: number };
        upsert.run(userId, c, e.id, JSON.stringify(e.value ?? null), e.updatedAt, e.deleted ? 1 : 0, seq);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const rows = db
    .prepare('SELECT collection, id, value, updated_at, deleted, seq FROM entries WHERE user_id = ? AND seq > ? ORDER BY seq')
    .all(userId, cursor) as Array<{ collection: Collection; id: string; value: string; updated_at: number; deleted: number; seq: number }>;
  const entries: Partial<Record<Collection, Entry[]>> = {};
  for (const r of rows) {
    (entries[r.collection] ??= []).push({ id: r.id, value: JSON.parse(r.value), updatedAt: r.updated_at, deleted: !!r.deleted || undefined });
  }
  const { seq } = db.prepare('SELECT seq FROM users WHERE id = ?').get(userId) as { seq: number };
  return { cursor: seq, entries };
}
