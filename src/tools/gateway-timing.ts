// Ferramenta de avaliação (F04, contrato C5–C7): mede, no ambiente real, quanto tempo um
// ingresso leva de "pending" até a resposta do gateway, para cada cartão informado.
// A resposta é aplicada pelo worker do app em execução; este script só compra e observa.
//
// Uso (com o produto no ar):
//   docker compose exec app node dist/tools/gateway-timing.js 4000000000000001 4000000000000002
//
// Cria um evento temporário publicado do Organizador A e o remove ao final.
import { closePool, getPool } from '../db/pool.js';
import { newId } from '../lib/ids.js';
import { getTicket, purchaseTicket } from '../modules/sales/index.js';

const cards = process.argv.slice(2);
if (cards.length === 0) {
  console.error('informe ao menos um número de cartão');
  process.exit(2);
}

const db = getPool();
const eventId = newId('evt');
await db.query(
  `INSERT INTO events (id, organizer_id, name, starts_at, venue, capacity, price_cents, status, published_at)
   VALUES ($1, 'usr_seed_org_a', 'gateway-timing (temporário)', now() + interval '30 days', 'n/a', $2, 100, 'published', now())`,
  [eventId, cards.length],
);

try {
  const runs = await Promise.all(
    cards.map(async (card) => {
      const started = Date.now();
      const res = await purchaseTicket({ eventId, channel: 'partner', buyerEmail: 'timing@example.com', cardNumber: card });
      if (!res.ok) return { card, error: res.error };
      const responseMs = Date.now() - started;
      for (;;) {
        const t = await getTicket(res.ticket.id);
        if (t && t.status !== 'pending') {
          return { card, initial: res.ticket.status, purchaseResponseMs: responseMs, final: t.status, seconds: (Date.now() - started) / 1000 };
        }
        if (Date.now() - started > 60_000) return { card, final: 'timeout' };
        await new Promise((r) => setTimeout(r, 100));
      }
    }),
  );
  for (const r of runs) console.log(JSON.stringify(r));
} finally {
  await db.query(
    'DELETE FROM payment_attempts WHERE ticket_id IN (SELECT id FROM tickets WHERE event_id = $1)',
    [eventId],
  );
  await db.query('DELETE FROM tickets WHERE event_id = $1', [eventId]);
  await db.query('DELETE FROM events WHERE id = $1', [eventId]);
  await closePool();
}
