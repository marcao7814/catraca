import { getPool } from '../../db/pool.js';
import { loadOwnedEvent, type EventStatus } from '../events/index.js';
import { findTicketByCode, type Ticket } from '../sales/index.js';

/** As cinco mensagens de R10, copiadas literalmente do brief. */
export const CHECKIN_MESSAGES = {
  invalid: 'Ingresso inválido para este evento',
  eventCancelled: 'Evento cancelado',
  notConfirmed: 'Ingresso não confirmado',
  alreadyUsed: 'Ingresso já utilizado',
  allowed: 'Entrada liberada',
} as const;

export type CheckinResult = (typeof CHECKIN_MESSAGES)[keyof typeof CHECKIN_MESSAGES];

export class CheckinError extends Error {
  constructor(public readonly code: 'not_found') {
    super('Evento não encontrado.');
  }
}

/**
 * Decide a mensagem de R10 para um ingresso (já buscado por `event_id` + código) e o status do
 * evento. A ordem das verificações é exatamente a do brief: a primeira situação verdadeira vence.
 * `Entrada liberada` aqui significa "elegível"; a marcação atômica é feita por `checkIn`.
 */
export function decideCheckin(
  ticket: Pick<Ticket, 'status' | 'checkedInAt'> | null,
  eventStatus: EventStatus,
): CheckinResult {
  if (!ticket) return CHECKIN_MESSAGES.invalid;
  if (eventStatus === 'cancelled') return CHECKIN_MESSAGES.eventCancelled;
  if (ticket.status !== 'confirmed') return CHECKIN_MESSAGES.notConfirmed;
  if (ticket.checkedInAt !== null) return CHECKIN_MESSAGES.alreadyUsed;
  return CHECKIN_MESSAGES.allowed;
}

/** Tentativas de reavaliação após perder uma corrida (cada perda muda o estado de forma definitiva). */
const MAX_ATTEMPTS = 5;

/**
 * Check-in por código (R10, TDR §5.4). O código é normalizado (`trim` + maiúsculas) e procurado
 * sempre dentro do evento: código de outro evento é tratado como inexistente.
 *
 * A marcação é um UPDATE condicional (`status = 'confirmed' AND checked_in_at IS NULL`): se outra
 * requisição marcou antes, ou o evento foi cancelado no meio, 0 linhas mudam e a decisão é refeita
 * com o estado novo (a partir da situação 2). Dois check-ins simultâneos → exatamente um
 * `Entrada liberada`.
 */
export async function checkIn(organizerId: string, eventId: string, rawCode: string): Promise<CheckinResult> {
  const pool = getPool();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const event = await loadOwnedEvent(organizerId, eventId);
    if (!event) throw new CheckinError('not_found');
    const ticket = await findTicketByCode(event.id, rawCode);
    const decision = decideCheckin(ticket, event.status);
    if (decision !== CHECKIN_MESSAGES.allowed || !ticket) return decision;

    const res = await pool.query(
      `UPDATE tickets SET checked_in_at = now()
        WHERE id = $1 AND status = 'confirmed' AND checked_in_at IS NULL`,
      [ticket.id],
    );
    if (res.rowCount === 1) return CHECKIN_MESSAGES.allowed;
    // Perdeu a corrida: reavalia com o estado atual do evento e do ingresso.
  }
  throw new Error('check-in: estado instável após várias tentativas');
}
