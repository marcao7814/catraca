import pg from 'pg';
import { config } from '../config.js';

// COUNT(*) retorna bigint como string; converte para number (valores pequenos neste domínio).
pg.types.setTypeParser(20, (v) => Number(v));

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: config.pgPoolMax });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

export type Db = pg.Pool | pg.PoolClient;
