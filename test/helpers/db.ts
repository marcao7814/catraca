import { getPool } from '../../src/db/pool.js';
import { seed } from '../../src/seed/seed.js';

/** Esvazia todas as tabelas de domínio e recria as contas da seed. */
export async function resetDb(): Promise<void> {
  await getPool().query('TRUNCATE payment_attempts, tickets, events, sessions, users CASCADE');
  await seed(getPool());
}
