// Painel do evento (F08, R12). Uma única consulta agregada (tdr §5.6): os seis números
// saem do mesmo instante (mesmo snapshot do Postgres), então são consistentes entre si.
import { getPool } from '../../db/pool.js';

export interface Dashboard {
  /** Ingressos `confirmed`, inclusive os que já passaram pelo check-in. */
  confirmed: number;
  /** Ingressos `pending`. */
  pending: number;
  /** Ingressos `confirmed` com `checked_in_at` não nulo. */
  checkins: number;
  /** R05: 0 se o evento está cancelado; senão lotação − (pending + confirmed). */
  available: number;
  /** Soma de `price_paid_cents` dos `confirmed` (preço vigente em cada compra, ADR-009). */
  revenueCents: number;
  /** Ingressos `refunded`. */
  refunded: number;
}

interface Row {
  capacity: number;
  status: string;
  confirmed: number;
  pending: number;
  checkins: number;
  refunded: number;
  revenue_cents: number;
  occupied: number;
}

/** Devolve o painel do evento, ou null se o evento não existe. Canal da compra não importa. */
export async function getDashboard(eventId: string): Promise<Dashboard | null> {
  const { rows } = await getPool().query<Row>(
    `SELECT e.capacity, e.status, agg.*
       FROM events e
      CROSS JOIN LATERAL (
        SELECT
          count(*) FILTER (WHERE t.status = 'confirmed')                                AS confirmed,
          count(*) FILTER (WHERE t.status = 'pending')                                  AS pending,
          count(*) FILTER (WHERE t.status = 'confirmed' AND t.checked_in_at IS NOT NULL) AS checkins,
          count(*) FILTER (WHERE t.status = 'refunded')                                 AS refunded,
          coalesce(sum(t.price_paid_cents) FILTER (WHERE t.status = 'confirmed'), 0)    AS revenue_cents,
          count(*) FILTER (WHERE t.status IN ('pending', 'confirmed'))                  AS occupied
          FROM tickets t
         WHERE t.event_id = e.id
      ) agg
      WHERE e.id = $1`,
    [eventId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    confirmed: Number(r.confirmed),
    pending: Number(r.pending),
    checkins: Number(r.checkins),
    available: r.status === 'cancelled' ? 0 : Math.max(0, Number(r.capacity) - Number(r.occupied)),
    revenueCents: Number(r.revenue_cents),
    refunded: Number(r.refunded),
  };
}
