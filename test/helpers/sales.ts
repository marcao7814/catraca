import { getPool } from '../../src/db/pool.js';
import { newId } from '../../src/lib/ids.js';

/** Cria um evento diretamente no banco, já no status pedido. */
export async function insertEvent(
  opts: {
    capacity?: number;
    priceCents?: number;
    status?: 'draft' | 'published' | 'cancelled';
    organizerId?: string;
  } = {},
): Promise<string> {
  const id = newId('evt');
  await getPool().query(
    `INSERT INTO events (id, organizer_id, name, starts_at, venue, capacity, price_cents, status, published_at)
     VALUES ($1, $2, $3, now() + interval '30 days', 'Local', $4, $5, $6,
             CASE WHEN $6 = 'draft' THEN NULL ELSE now() END)`,
    [id, opts.organizerId ?? 'usr_seed_org_a', `Evento ${id}`, opts.capacity ?? 5, opts.priceCents ?? 10000, opts.status ?? 'published'],
  );
  return id;
}

export const CARD = {
  approvedFast: '4000000000000001',
  declinedFast: '4000000000000002',
  approvedSlow: '4000000000000003',
  declinedSlow: '4000000000000004',
  other: '4000000000000009',
};

export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 5000, stepMs = 20): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor: tempo esgotado (${timeoutMs} ms)`);
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

/** Invariante de R07: nenhum evento com pendentes + confirmados acima da lotação. */
export async function overbookedEvents(): Promise<string[]> {
  const { rows } = await getPool().query<{ id: string }>(
    `SELECT e.id FROM events e
       JOIN tickets t ON t.event_id = e.id AND t.status IN ('pending', 'confirmed')
      GROUP BY e.id, e.capacity
     HAVING count(*) > e.capacity`,
  );
  return rows.map((r) => r.id);
}
