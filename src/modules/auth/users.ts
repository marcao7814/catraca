import bcrypt from 'bcryptjs';
import type { Db } from '../../db/pool.js';
import { newId } from '../../lib/ids.js';
import type { Role, SessionUser } from './types.js';

const BCRYPT_COST = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createUser(
  db: Db,
  input: { name: string; email: string; password: string; role: Role; id?: string },
): Promise<SessionUser | null> {
  const id = input.id ?? newId('usr');
  const hash = await hashPassword(input.password);
  const { rows } = await db.query<SessionUser>(
    `INSERT INTO users (id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, name, email, role`,
    [id, input.name.trim(), normalizeEmail(input.email), hash, input.role],
  );
  return rows[0] ?? null;
}

// Hash usado quando o e-mail não existe, para o tempo de resposta não revelar contas.
let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync('catraca-dummy-password', BCRYPT_COST));

export async function verifyCredentials(db: Db, email: string, password: string): Promise<SessionUser | null> {
  const { rows } = await db.query<SessionUser & { password_hash: string }>(
    'SELECT id, name, email, role, password_hash FROM users WHERE email = $1',
    [normalizeEmail(email)],
  );
  const row = rows[0];
  const ok = await bcrypt.compare(password, row?.password_hash ?? getDummyHash());
  if (!row || !ok) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}
