// Seed idempotente: pode rodar quantas vezes for preciso sem erro e sem duplicar.
// Credenciais documentadas no README. Nenhum evento é semeado.
import { pathToFileURL } from 'node:url';
import type pg from 'pg';
import { closePool, getPool } from '../db/pool.js';
import { createUser } from '../modules/auth/users.js';
import type { Role } from '../modules/auth/types.js';

export const SEED_PASSWORD = 'catraca123';

export const SEED_USERS: Array<{ id: string; name: string; email: string; role: Role }> = [
  { id: 'usr_seed_org_a', name: 'Organizador A', email: 'org.a@catraca.dev', role: 'organizer' },
  { id: 'usr_seed_org_b', name: 'Organizador B', email: 'org.b@catraca.dev', role: 'organizer' },
  { id: 'usr_seed_part', name: 'Participante Seed', email: 'participante@catraca.dev', role: 'participant' },
];

export async function seed(pool: pg.Pool = getPool()): Promise<number> {
  let created = 0;
  for (const u of SEED_USERS) {
    const row = await createUser(pool, { ...u, password: SEED_PASSWORD });
    if (row) created++;
  }
  return created;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed()
    .then((created) => {
      console.log(`seed: ${created} usuário(s) criados, ${SEED_USERS.length - created} já existiam`);
      return closePool();
    })
    .catch(async (err) => {
      console.error(err);
      await closePool();
      process.exit(1);
    });
}
