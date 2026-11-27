import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../../src/db/pool.js';
import { getEvent } from '../../src/modules/events/index.js';
import { updateEvent } from '../../src/modules/events/events.service.js';
import {
  applyGatewayResult,
  getGateway,
  getSeatStats,
  getTicket,
  processDuePayments,
  purchaseTicket,
  setGateway,
  startGatewayWorker,
  type PaymentGateway,
} from '../../src/modules/sales/index.js';
import { resetDb } from '../helpers/db.js';
import { CARD, insertEvent, waitFor } from '../helpers/sales.js';

const realGateway = getGateway();
let stopWorker: (() => Promise<void>) | null = null;

beforeEach(async () => {
  await resetDb();
});
afterEach(async () => {
  setGateway(realGateway);
  if (stopWorker) await stopWorker();
  stopWorker = null;
});
afterAll(async () => {
  await closePool();
});

/** Gateway que nunca responde dentro do teste (mantém o ingresso pendente). */
const neverGateway: PaymentGateway = { authorize: (card) => ({ ...realGateway.authorize(card), delayMs: 3_600_000 }) };

const buy = (eventId: string, cardNumber: string = CARD.approvedFast, buyerEmail = 'ana@example.com') =>
  purchaseTicket({ eventId, channel: 'partner', buyerEmail, cardNumber });

async function eventInput(eventId: string, over: Partial<{ capacity: number; priceCents: number }>) {
  const e = (await getEvent(eventId))!;
  return { name: e.name, startsAt: e.startsAt, venue: e.venue, capacity: e.capacity, priceCents: e.priceCents, ...over };
}

describe('F04 — compra (R06, R09)', () => {
  it('C1/AC-F04-1: cria ingresso pendente com código de 8 caracteres, sem esperar o gateway', async () => {
    const id = await insertEvent();
    const started = Date.now();
    const res = await buy(id, CARD.approvedSlow); // gateway de 30–40 s (escalado) não é aguardado
    const elapsed = Date.now() - started;
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ticket.status).toBe('pending');
    expect(res.ticket.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(res.ticket.id).toMatch(/^tkt_/);
    expect(elapsed).toBeLessThan(500);
    const { rows } = await getPool().query('SELECT card_last4 FROM payment_attempts WHERE ticket_id = $1', [
      res.ticket.id,
    ]);
    expect(rows[0].card_last4).toBe('0003'); // número completo nunca é persistido
  });

  it('códigos são únicos entre ingressos', async () => {
    const id = await insertEvent({ capacity: 50 });
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const r = await buy(id);
      if (r.ok) codes.add(r.ticket.code);
    }
    expect(codes.size).toBe(50);
  });
});

describe('F04 — vagas (R05, R07)', () => {
  it('C2/AC-F04-2: pendente ocupa vaga; evento cancelado tem 0 vagas disponíveis', async () => {
    setGateway(neverGateway);
    const id = await insertEvent({ capacity: 2 });
    expect(await getSeatStats(id)).toEqual({ capacity: 2, occupied: 0, available: 2 });
    await buy(id, CARD.approvedSlow);
    expect(await getSeatStats(id)).toEqual({ capacity: 2, occupied: 1, available: 1 });
    await getPool().query("UPDATE events SET status = 'cancelled' WHERE id = $1", [id]);
    expect((await getSeatStats(id))!.available).toBe(0);
  });

  it('C3/AC-F04-3: sem vaga retorna sold_out e não cria ingresso', async () => {
    setGateway(neverGateway);
    const id = await insertEvent({ capacity: 1 });
    expect((await buy(id)).ok).toBe(true);
    expect(await buy(id)).toEqual({ ok: false, error: 'sold_out' });
    const { rows } = await getPool().query('SELECT count(*) AS n FROM tickets WHERE event_id = $1', [id]);
    expect(rows[0].n).toBe(1);
  });
});

describe('F04 — gateway (R08)', () => {
  it('C8/AC-F04-6: recusa libera a vaga', async () => {
    const id = await insertEvent({ capacity: 1 });
    const first = await buy(id, CARD.declinedFast);
    expect(first.ok).toBe(true);
    expect(await buy(id)).toEqual({ ok: false, error: 'sold_out' });
    stopWorker = startGatewayWorker(10);
    if (!first.ok) return;
    await waitFor(async () => (await getTicket(first.ticket.id))?.status === 'declined');
    expect((await getSeatStats(id))!.available).toBe(1);
    expect((await buy(id)).ok).toBe(true);
  });

  it('AC-F04-5: cada final de cartão chega ao status esperado (atrasos escalados)', async () => {
    const id = await insertEvent({ capacity: 10 });
    const expected: Array<[string, string]> = [
      [CARD.approvedFast, 'confirmed'],
      [CARD.declinedFast, 'declined'],
      [CARD.approvedSlow, 'confirmed'],
      [CARD.declinedSlow, 'declined'],
      [CARD.other, 'declined'],
    ];
    const tickets: string[] = [];
    for (const [card] of expected) {
      const r = await buy(id, card);
      if (!r.ok) throw new Error(r.error);
      tickets.push(r.ticket.id);
    }
    stopWorker = startGatewayWorker(10);
    for (const [i, [, status]] of expected.entries()) {
      await waitFor(async () => (await getTicket(tickets[i]!))?.status === status, 10_000);
    }
  });

  it('C12/AC-F04-10: resultado sobre ingresso que não está pendente é no-op', async () => {
    setGateway(neverGateway);
    const id = await insertEvent();
    const r = await buy(id);
    if (!r.ok) throw new Error(r.error);
    await getPool().query("UPDATE tickets SET status = 'cancelled' WHERE id = $1", [r.ticket.id]);
    expect(await applyGatewayResult(r.ticket.id, 'approved')).toBe(false);
    expect((await getTicket(r.ticket.id))!.status).toBe('cancelled');

    const r2 = await buy(id);
    if (!r2.ok) throw new Error(r2.error);
    expect(await applyGatewayResult(r2.ticket.id, 'approved')).toBe(true);
    await getPool().query("UPDATE tickets SET status = 'refunded' WHERE id = $1", [r2.ticket.id]);
    expect(await applyGatewayResult(r2.ticket.id, 'approved')).toBe(false);
    expect(await applyGatewayResult(r2.ticket.id, 'declined')).toBe(false);
    expect((await getTicket(r2.ticket.id))!.status).toBe('refunded');
  });

  it('worker marca a tentativa como processada e não aplica duas vezes', async () => {
    const id = await insertEvent();
    const r = await buy(id);
    if (!r.ok) throw new Error(r.error);
    await getPool().query("UPDATE payment_attempts SET respond_at = now() - interval '1 second'");
    expect(await processDuePayments()).toBe(1);
    expect(await processDuePayments()).toBe(0);
    const { rows } = await getPool().query('SELECT processed_at, applied FROM payment_attempts WHERE ticket_id = $1', [
      r.ticket.id,
    ]);
    expect(rows[0].processed_at).not.toBeNull();
    expect(rows[0].applied).toBe(true);
  });

  it('C15/CX-F01-F04: retoma respostas vencidas após reinício (estado persistido)', async () => {
    setGateway(neverGateway);
    const id = await insertEvent();
    const r = await buy(id, CARD.approvedSlow);
    if (!r.ok) throw new Error(r.error);
    // Simula app fora do ar enquanto a resposta venceu.
    await getPool().query("UPDATE payment_attempts SET respond_at = now() - interval '10 seconds'");
    expect((await getTicket(r.ticket.id))!.status).toBe('pending');
    stopWorker = startGatewayWorker(10); // "app voltou"
    await waitFor(async () => (await getTicket(r.ticket.id))?.status === 'confirmed');
  });
});

describe('F04 — validação e disponibilidade', () => {
  it.each([
    ['cartão 123', { cardNumber: '123' }],
    ['cartão 17 dígitos', { cardNumber: '40000000000000011' }],
    ['cartão com letras', { cardNumber: '400000000000000a' }],
    ['e-mail sem domínio', { buyerEmail: 'x@' }],
    ['e-mail vazio', { buyerEmail: '' }],
  ])('C9/AC-F04-7: %s -> invalid_request sem criar ingresso', async (_l, over) => {
    const id = await insertEvent();
    const res = await purchaseTicket({
      eventId: id,
      channel: 'partner',
      buyerEmail: 'ana@example.com',
      cardNumber: CARD.approvedFast,
      ...over,
    });
    expect(res).toEqual({ ok: false, error: 'invalid_request' });
    const { rows } = await getPool().query('SELECT count(*) AS n FROM tickets');
    expect(rows[0].n).toBe(0);
  });

  it('C9: validação vem antes da existência do evento (ordem do contrato)', async () => {
    expect(
      await purchaseTicket({ eventId: 'evt_naoexiste', channel: 'partner', buyerEmail: 'a@b.co', cardNumber: '123' }),
    ).toEqual({ ok: false, error: 'invalid_request' });
  });

  it.each(['inexistente', 'draft', 'cancelled'] as const)('C10/AC-F04-8: evento %s -> event_not_available', async (kind) => {
    const id = kind === 'inexistente' ? 'evt_naoexiste0000' : await insertEvent({ status: kind });
    expect(await buy(id)).toEqual({ ok: false, error: 'event_not_available' });
  });

  it('indisponível vem antes de esgotado (ordem do contrato)', async () => {
    setGateway(neverGateway);
    const id = await insertEvent({ capacity: 1 });
    await buy(id);
    await getPool().query("UPDATE events SET status = 'cancelled' WHERE id = $1", [id]);
    expect(await buy(id)).toEqual({ ok: false, error: 'event_not_available' });
  });
});

describe('F04 — preço vigente (R03, R12)', () => {
  it('C11/AC-F04-9: ingresso grava o preço do momento da compra', async () => {
    setGateway(neverGateway);
    const id = await insertEvent({ capacity: 5, priceCents: 10000 });
    const t1 = await buy(id);
    await updateEvent('usr_seed_org_a', id, await eventInput(id, { priceCents: 15000 }));
    const t2 = await buy(id);
    if (!t1.ok || !t2.ok) throw new Error('compra falhou');
    expect((await getTicket(t1.ticket.id))!.pricePaidCents).toBe(10000);
    expect((await getTicket(t2.ticket.id))!.pricePaidCents).toBe(15000);
  });
});

describe('F04 — integração com F02 (cross-feature)', () => {
  it('C13/CX-F02-F04: rascunho não vende; publicado vende com preço vigente; mudança de preço só vale para compras novas', async () => {
    setGateway(neverGateway);
    const id = await insertEvent({ status: 'draft', capacity: 5, priceCents: 10000 });
    expect(await buy(id)).toEqual({ ok: false, error: 'event_not_available' });
    await getPool().query("UPDATE events SET status = 'published', published_at = now() WHERE id = $1", [id]);
    const before = await buy(id);
    if (!before.ok) throw new Error(before.error);
    expect(before.ticket.pricePaidCents).toBe(10000);
    await updateEvent('usr_seed_org_a', id, await eventInput(id, { priceCents: 15000 }));
    const after = await buy(id);
    if (!after.ok) throw new Error(after.error);
    expect(after.ticket.pricePaidCents).toBe(15000);
    expect((await getTicket(before.ticket.id))!.pricePaidCents).toBe(10000);
  });

  it('C14/CX-F02-F04b: lotação não desce abaixo de pendentes criados pela compra; a recusa libera', async () => {
    const id = await insertEvent({ capacity: 2 });
    setGateway(neverGateway);
    const keep = await buy(id, CARD.approvedSlow);
    setGateway(realGateway);
    const declined = await buy(id, CARD.declinedFast);
    if (!keep.ok || !declined.ok) throw new Error('compra falhou');

    await expect(updateEvent('usr_seed_org_a', id, await eventInput(id, { capacity: 1 }))).rejects.toThrow(
      'A lotação não pode ser menor que as vagas ocupadas (2).',
    );
    stopWorker = startGatewayWorker(10);
    await waitFor(async () => (await getTicket(declined.ticket.id))?.status === 'declined');
    const updated = await updateEvent('usr_seed_org_a', id, await eventInput(id, { capacity: 1 }));
    expect(updated.capacity).toBe(1);
  });
});
