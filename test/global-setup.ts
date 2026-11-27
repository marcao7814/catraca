// Aplica as migrações no banco de teste (DATABASE_URL) uma vez antes da suíte.
import { closePool, getPool } from '../src/db/pool.js';
import { migrate, waitForDb } from '../src/db/migrate.js';

export default async function setup() {
  await waitForDb(getPool(), 30_000);
  await migrate(getPool());
  await closePool();
}
