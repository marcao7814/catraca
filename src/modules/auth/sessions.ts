import { randomBytes } from 'node:crypto';
import { config } from '../../config.js';
import type { Db } from '../../db/pool.js';
import type { SessionUser } from './types.js';

export const SESSION_COOKIE = 'sid';

export async function createSession(db: Db, userId: string): Promise<string> {
  const id = randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sessions (id, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(hours => $3))`,
    [id, userId, config.sessionTtlHours],
  );
  return id;
}

export async function getSessionUser(db: Db, sessionId: string): Promise<SessionUser | null> {
  const { rows } = await db.query<SessionUser>(
    `SELECT u.id, u.name, u.email, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now()`,
    [sessionId],
  );
  return rows[0] ?? null;
}

export async function deleteSession(db: Db, sessionId: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}
