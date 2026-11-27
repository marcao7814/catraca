import { withTx } from '../../db/tx.js';
import { lockOwnedEvent } from '../events/index.js';

export type CancellationErrorCode = 'not_found' | 'not_cancellable';

export class CancellationError extends Error {
  constructor(
    public readonly code: CancellationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface CancellationResult {
  /** Ingressos que estavam confirmados e passaram a estornados. */
  refunded: number;
  /** Ingressos que estavam pendentes e passaram a cancelados. */
  cancelled: number;
}

/**
 * Cancela um evento publicado (R11, ADR-007, TDR §5.3), de forma irreversível.
 *
 * Tudo numa transação: trava a linha do evento (ADR-004) conferindo a posse (R13), exige
 * `published`, marca o evento como cancelado e faz a transição em massa dos ingressos com
 * updates condicionais ao status de origem (ADR-006). O worker do gateway trava o mesmo evento
 * antes de aplicar uma resposta e só altera ingresso `pending`; logo, uma resposta que chegue
 * depois vira no-op e nunca há janela entre a mudança do evento e a dos ingressos.
 */
export async function cancelEvent(organizerId: string, eventId: string): Promise<CancellationResult> {
  return withTx(async (client) => {
    const event = await lockOwnedEvent(client, organizerId, eventId);
    if (!event) throw new CancellationError('not_found', 'Evento não encontrado.');
    if (event.status === 'cancelled')
      throw new CancellationError('not_cancellable', 'Este evento já foi cancelado.');
    if (event.status !== 'published')
      throw new CancellationError('not_cancellable', 'Só eventos publicados podem ser cancelados.');

    await client.query(
      `UPDATE events SET status = 'cancelled', cancelled_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'published'`,
      [eventId],
    );
    const refunded = await client.query(
      `UPDATE tickets SET status = 'refunded' WHERE event_id = $1 AND status = 'confirmed'`,
      [eventId],
    );
    const cancelled = await client.query(
      `UPDATE tickets SET status = 'cancelled' WHERE event_id = $1 AND status = 'pending'`,
      [eventId],
    );
    return { refunded: refunded.rowCount ?? 0, cancelled: cancelled.rowCount ?? 0 };
  });
}
