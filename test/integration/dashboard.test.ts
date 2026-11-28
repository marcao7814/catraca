import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { closePool, getPool } from '../../src/db/pool.js';
import { cancelEvent } from '../../src/modules/cancellation/index.js';
import { getDashboard } from '../../src/modules/dashboard/index.js';
import {
  getGateway,
  getSeatStats,
  getTicket,
  processDuePayments,
  setGateway,
} from '../../src/modules/sales/index.js';
import { instantFastGateway, makeAttemptsDue } from '../helpers/cancellation.js';
import { expected, panel } from '../helpers/dashboard.js';
import { resetDb } from '../helpers/db.js';
import { createEventHttp, editHttp, insertTickets, publishHttp } from '../helpers/events.js';
import { loginAs, ORG_A, ORG_B, PARTICIPANT } from '../helpers/http.js';
import { buyInject } from '../helpers/partner.js';
import { CARD, insertEvent } from '../helpers/sales.js';
import { purchaseHttp } from '../helpers/storefront.js';

const ORG_A_ID = 'usr_seed_org_a';

let app: FastifyInstance;
let a: string;
let b: string;
let p: string;
const realGateway = getGateway();

beforeAll(async () => {
  app = await buildApp();
});
beforeEach(async () => {
  await resetDb();
  // Cartões rápidos respondem na hora; lentos (0003/0004) só quando o teste mandar (makeAttemptsDue).
  setGateway(instantFastGateway);
  a = await loginAs(app, ORG_A);
  b = await loginAs(app, ORG_B);
  p = await loginAs(app, PARTICIPANT);
});
afterEach(() => {
  setGateway(realGateway);
});
afterAll(async () => {
  await app.close();
  await closePool();
});

/** Compra pela API de parceiros (app.inject) e devolve o ticketId. */
async function buyApi(eventId: string, cardNumber: string, buyerEmail = 'api@example.com'): Promise<string> {
  const res = await buyInject(app, eventId, { buyerEmail, cardNumber });
  expect(res.statusCode, res.body).toBe(202);
  return (res.json() as { ticketId: string }).ticketId;
}

/** Compra pela vitrine como o participante da seed e devolve o id do ingresso criado. */
async function buyStorefront(eventId: string, cardNumber: string): Promise<string> {
  const before = new Set((await ticketsOf(eventId)).map((t) => t.id));
  const res = await purchaseHttp(app, p, eventId, cardNumber);
  expect(res.statusCode, res.body.slice(0, 300)).toBeLessThan(400);
  const created = (await ticketsOf(eventId)).filter((t) => !before.has(t.id));
  expect(created).toHaveLength(1);
  expect(created[0]!.channel).toBe('storefront');
  return created[0]!.id;
}

async function ticketsOf(eventId: string) {
  const { rows } = await getPool().query<{ id: string; channel: string; status: string }>(
    'SELECT id, channel, status FROM tickets WHERE event_id = $1',
    [eventId],
  );
  return rows;
}

/** Simula o check-in (F06 não existe nesta branch): preparação de cenário pela coluna da F01. */
async function checkIn(ticketId: string): Promise<void> {
  await getPool().query('UPDATE tickets SET checked_in_at = now() WHERE id = $1', [ticketId]);
}

/**
 * Cenário dos passos 2–9 do brief em E1: lotação 2 a R$ 100; T1 (vitrine, 0001) confirmado;
 * T2 (API, 0004) recusado; T3 (API, 0001) confirmado; redução para 1 rejeitada; preço → R$ 150 e
 * lotação → 3; T4 (API, 0001) confirmado a R$ 150.
 */
async function scenarioE1() {
  const e1 = await createEventHttp(app, a, { name: 'E1', capacity: '2', price: '100,00' });
  expect((await publishHttp(app, a, e1)).statusCode).toBe(302);

  const t1 = await buyStorefront(e1, CARD.approvedFast);
  await processDuePayments();
  const t2 = await buyApi(e1, CARD.declinedSlow, 't2@example.com');
  expect((await buyInject(app, e1, { buyerEmail: 'x@example.com', cardNumber: CARD.approvedFast })).statusCode).toBe(
    409,
  );
  await makeAttemptsDue([t2]);
  await processDuePayments();
  const t3 = await buyApi(e1, CARD.approvedFast, 't3@example.com');
  await processDuePayments();

  expect((await editHttp(app, a, e1, { name: 'E1', capacity: '1', price: '100,00' })).statusCode).toBe(422);
  expect((await editHttp(app, a, e1, { name: 'E1', capacity: '3', price: '150,00' })).statusCode).toBe(302);

  const t4 = await buyApi(e1, CARD.approvedFast, 't4@example.com');
  await processDuePayments();

  expect((await getTicket(t1))!.status).toBe('confirmed');
  expect((await getTicket(t2))!.status).toBe('declined');
  expect((await getTicket(t3))!.status).toBe('confirmed');
  expect((await getTicket(t4))!.status).toBe('confirmed');
  expect((await getTicket(t4))!.pricePaidCents).toBe(15000);
  return { e1, t1, t2, t3, t4 };
}

/** Cenário dos passos 12–14: E3 (lotação 5, R$ 50); T5 0003 pendente; T6 0001 confirmado; cancelado. */
async function scenarioE3() {
  const e3 = await createEventHttp(app, a, { name: 'E3', capacity: '5', price: '50,00' });
  expect((await publishHttp(app, a, e3)).statusCode).toBe(302);
  const t5 = await buyApi(e3, CARD.approvedSlow, 't5@example.com');
  const t6 = await buyApi(e3, CARD.approvedFast, 't6@example.com');
  await processDuePayments();
  expect((await getTicket(t6))!.status).toBe('confirmed');
  expect((await getTicket(t5))!.status).toBe('pending');
  return { e3, t5, t6 };
}

describe('F08 — painel do evento (R12)', () => {
  it('C1/AC-F08-1/AC-F08-4/AC-F08-5/CX-F04-F08: passo 9 — Confirmados 3, Pendentes 0, Check-ins 0, Vagas 0, Receita R$ 350,00, Estornados 0', async () => {
    const { e1 } = await scenarioE1();
    const res = await panel(app, a, e1);
    expect(res.status).toBe(200);
    expect(res.metrics).toStrictEqual(
      expected({ confirmed: 3, pending: 0, checkins: 0, available: 0, revenue: 'R$ 350,00', refunded: 0 }),
    );
    // Rótulos exatos de R12, na ordem.
    expect(res.text).toStrictEqual([
      'Confirmados 3',
      'Pendentes 0',
      'Check-ins 0',
      'Vagas disponíveis 0',
      'Receita R$ 350,00',
      'Estornados 0',
    ]);
    expect(await getDashboard(e1)).toStrictEqual({
      confirmed: 3,
      pending: 0,
      checkins: 0,
      available: 0,
      revenueCents: 35000,
      refunded: 0,
    });
  });

  it('C2/AC-F08-2/AC-F08-4: compra 0003 recém-feita → Pendentes 1 e Vagas = lotação − 1', async () => {
    const e = await createEventHttp(app, a, { name: 'Novo', capacity: '4', price: '30,00' });
    await publishHttp(app, a, e);
    const before = await panel(app, a, e);
    expect(before.metrics).toStrictEqual(
      expected({ confirmed: 0, pending: 0, checkins: 0, available: 4, revenue: 'R$ 0,00', refunded: 0 }),
    );
    await buyApi(e, CARD.approvedSlow);
    await processDuePayments(); // resposta lenta ainda não venceu
    const res = await panel(app, a, e);
    expect(res.metrics).toStrictEqual(
      expected({ confirmed: 0, pending: 1, checkins: 0, available: 3, revenue: 'R$ 0,00', refunded: 0 }),
    );
  });

  it('C2/AC-F08-4: recusa libera a vaga no painel (pendente → recusado)', async () => {
    const e = await insertEvent({ capacity: 2, priceCents: 1000 });
    const t = await buyApi(e, CARD.declinedSlow);
    expect((await getDashboard(e))!.available).toBe(1);
    await makeAttemptsDue([t]);
    await processDuePayments();
    expect(await getDashboard(e)).toMatchObject({ pending: 0, confirmed: 0, available: 2, revenueCents: 0 });
  });

  it('C3/AC-F08-3/CX-F06-F08: após check-in de C1, Check-ins 0 → 1 e Confirmados continua 3', async () => {
    const { e1, t1 } = await scenarioE1();
    expect((await panel(app, a, e1)).metrics.checkins).toBe('0');
    await checkIn(t1); // equivale ao "Entrada liberada" de C1 (F06 é exercitada no fluxo final)
    const res = await panel(app, a, e1);
    expect(res.metrics).toStrictEqual(
      expected({ confirmed: 3, pending: 0, checkins: 1, available: 0, revenue: 'R$ 350,00', refunded: 0 }),
    );
  });

  it('C3/AC-F08-3: check-in só conta ingresso confirmado (estornado com checked_in_at não conta)', async () => {
    const e = await insertEvent({ capacity: 5, priceCents: 1000 });
    const [conf] = await insertTickets(e, 'confirmed', 1, 1000);
    const [ref] = await insertTickets(e, 'refunded', 1, 1000);
    await checkIn(conf!);
    await checkIn(ref!);
    expect(await getDashboard(e)).toMatchObject({ confirmed: 1, checkins: 1, refunded: 1 });
  });

  it('C4/AC-F08-4/AC-F08-6/CX-F07-F08: passo 14 — cancelado: Confirmados 0, Pendentes 0, Check-ins 0, Vagas 0, Receita R$ 0,00, Estornados 1', async () => {
    const { e3, t5, t6 } = await scenarioE3();
    expect((await panel(app, a, e3)).metrics).toStrictEqual(
      expected({ confirmed: 1, pending: 1, checkins: 0, available: 3, revenue: 'R$ 50,00', refunded: 0 }),
    );
    await cancelEvent(ORG_A_ID, e3);
    // Resposta tardia do gateway (0003 aprovado) não muda nada.
    await makeAttemptsDue([t5]);
    await processDuePayments();
    expect((await getTicket(t5))!.status).toBe('cancelled');
    expect((await getTicket(t6))!.status).toBe('refunded');

    const res = await panel(app, a, e3);
    expect(res.status).toBe(200);
    expect(res.metrics).toStrictEqual(
      expected({ confirmed: 0, pending: 0, checkins: 0, available: 0, revenue: 'R$ 0,00', refunded: 1 }),
    );
    expect(res.text).toContain('Receita R$ 0,00');
    expect(res.text).toContain('Estornados 1');
  });

  it('C5/AC-F08-5/CX-F04-F08: rajada de 30 compras em lotação 5 a R$ 10 → Confirmados 5, Vagas 0, Receita R$ 50,00', async () => {
    const e4 = await createEventHttp(app, a, { name: 'E4', capacity: '5', price: '10,00' });
    await publishHttp(app, a, e4);
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        buyInject(app, e4, { buyerEmail: `carga${i}@example.com`, cardNumber: CARD.approvedFast }),
      ),
    );
    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses.filter((s) => s === 202)).toHaveLength(5);
    expect(statuses.filter((s) => s === 409)).toHaveLength(25);
    await processDuePayments();
    expect((await panel(app, a, e4)).metrics).toStrictEqual(
      expected({ confirmed: 5, pending: 0, checkins: 0, available: 0, revenue: 'R$ 50,00', refunded: 0 }),
    );
  });

  it('C6/AC-F08-1…6: mistura de canais e status — cada métrica conta só o que deve', async () => {
    const e = await insertEvent({ capacity: 20, priceCents: 10000 });
    // Vitrine e API somam igual (canal não importa).
    const web = await buyStorefront(e, CARD.approvedFast);
    const api = await buyApi(e, CARD.approvedFast);
    await processDuePayments();
    expect((await getTicket(web))!.status).toBe('confirmed');
    expect((await getTicket(api))!.status).toBe('confirmed');
    // Estados restantes inseridos diretamente, com preços distintos para flagrar soma errada.
    const [checked] = await insertTickets(e, 'confirmed', 1, 2500);
    await checkIn(checked!);
    await insertTickets(e, 'pending', 2, 7000);
    await insertTickets(e, 'declined', 3, 9900);
    await insertTickets(e, 'cancelled', 1, 9900);
    await insertTickets(e, 'refunded', 2, 4400);

    const d = await getDashboard(e);
    expect(d).toStrictEqual({
      confirmed: 3, // web + api + checked
      pending: 2,
      checkins: 1,
      available: 20 - 5, // lotação − (pendentes + confirmados)
      revenueCents: 10000 + 10000 + 2500, // só confirmados, com o preço pago de cada um
      refunded: 2,
    });
    // Vagas iguais às do motor de vendas e às da API de parceiros (R05).
    expect(d!.available).toBe((await getSeatStats(e))!.available);
    const listed = await app.inject({ url: '/api/partner/events', headers: { 'x-api-key': 'catraca-partner-dev-key' } });
    const row = (listed.json() as Array<{ id: string; availableSeats: number }>).find((x) => x.id === e);
    expect(row!.availableSeats).toBe(d!.available);

    expect((await panel(app, a, e)).metrics).toStrictEqual(
      expected({ confirmed: 3, pending: 2, checkins: 1, available: 15, revenue: 'R$ 225,00', refunded: 2 }),
    );
  });

  it('C6/AC-F08-5: receita formatada com milhar (R$ 1.234,56) e evento sem ingressos zerado', async () => {
    const e = await insertEvent({ capacity: 3, priceCents: 61728 });
    expect(await getDashboard(e)).toStrictEqual({
      confirmed: 0,
      pending: 0,
      checkins: 0,
      available: 3,
      revenueCents: 0,
      refunded: 0,
    });
    await insertTickets(e, 'confirmed', 2, 61728);
    expect((await panel(app, a, e)).metrics.revenue).toBe('R$ 1.234,56');
  });

  it('C6: evento inexistente → getDashboard devolve null', async () => {
    expect(await getDashboard('evt_naoexiste')).toBeNull();
  });

  it('C7/CX-F02-F08: organizador B, participante e visitante não veem nenhum número do painel de A', async () => {
    const { e1 } = await scenarioE1();
    const own = await panel(app, a, e1);
    expect(own.body).toContain('id="dashboard"');

    const asB = await panel(app, b, e1);
    expect(asB.status).toBe(404);
    expect(asB.body).not.toContain('data-metric');
    expect(asB.body).not.toContain('id="dashboard"');
    expect(asB.body).not.toContain('E1');
    expect(asB.body).not.toContain('R$ 350,00');

    const asP = await panel(app, p, e1);
    expect(asP.status).not.toBe(200);
    expect(asP.body).not.toContain('data-metric');

    const anon = await app.inject({ url: `/organizer/events/${e1}` });
    expect(anon.statusCode).not.toBe(200);
    expect(anon.body).not.toContain('data-metric');
  });
});
