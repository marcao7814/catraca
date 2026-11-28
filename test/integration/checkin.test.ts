import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { closePool, getPool } from '../../src/db/pool.js';
import { cancelEvent } from '../../src/modules/cancellation/index.js';
import { CheckinError, checkIn } from '../../src/modules/checkin/index.js';
import {
  getGateway,
  getTicket,
  processDuePayments,
  purchaseTicket,
  setGateway,
  type Ticket,
} from '../../src/modules/sales/index.js';
import { instantFastGateway } from '../helpers/cancellation.js';
import { checkinHttp, checkinResult } from '../helpers/checkin.js';
import { resetDb } from '../helpers/db.js';
import { createEventHttp, insertTickets, publishHttp } from '../helpers/events.js';
import { loginAs, ORG_A, ORG_B, PARTICIPANT } from '../helpers/http.js';
import { buyInject } from '../helpers/partner.js';
import { CARD, insertEvent } from '../helpers/sales.js';

const ORG_A_ID = 'usr_seed_org_a';
const ORG_B_ID = 'usr_seed_org_b';

let app: FastifyInstance;
let a: string;
let b: string;
const realGateway = getGateway();

beforeAll(async () => {
  app = await buildApp();
});
beforeEach(async () => {
  await resetDb();
  // 0001/0002 respondem na hora (ao rodar processDuePayments); 0003/0004 ficam pendentes.
  setGateway(instantFastGateway);
  a = await loginAs(app, ORG_A);
  b = await loginAs(app, ORG_B);
});
afterEach(() => {
  setGateway(realGateway);
});
afterAll(async () => {
  await app.close();
  await closePool();
});

async function buy(eventId: string, cardNumber: string): Promise<Ticket> {
  const r = await purchaseTicket({ eventId, channel: 'partner', buyerEmail: 'eval@example.com', cardNumber });
  if (!r.ok) throw new Error(`compra falhou: ${r.error}`);
  await processDuePayments();
  return (await getTicket(r.ticket.id))!;
}

async function publishedEvent(cookie: string, over: { name?: string; capacity?: string; price?: string } = {}) {
  const id = await createEventHttp(app, cookie, { capacity: '5', ...over });
  expect((await publishHttp(app, cookie, id)).statusCode).toBe(302);
  return id;
}

/** POST de check-in pela página de gestão: devolve status HTTP e a mensagem em #checkin-result. */
async function post(eventId: string, code: string, cookie = a) {
  const res = await checkinHttp(app, cookie, eventId, code);
  return { status: res.statusCode, message: checkinResult(res.body), body: res.body };
}

const checkedInAt = async (ticketId: string) => (await getTicket(ticketId))!.checkedInAt;

describe('F06 — check-in pela página de gestão (R10)', () => {
  it('C1/AC-F06-1/CX-F04-F06: código inexistente (ZZZZZZZZ) → Ingresso inválido para este evento', async () => {
    const e1 = await publishedEvent(a, { name: 'E1' });
    await buy(e1, CARD.approvedFast);
    expect(await post(e1, 'ZZZZZZZZ')).toMatchObject({ status: 200, message: 'Ingresso inválido para este evento' });
    expect(await post(e1, '')).toMatchObject({ status: 200, message: 'Ingresso inválido para este evento' });
  });

  it('C2/AC-F06-1/CX-F04-F06: código de outro evento (de B e do próprio A) → Ingresso inválido para este evento', async () => {
    const e1 = await publishedEvent(a, { name: 'E1' });
    const e2 = await publishedEvent(b, { name: 'E2', capacity: '1', price: '20,00' });
    const eOther = await publishedEvent(a, { name: 'Outro de A' });
    const c3 = await buy(e2, CARD.approvedFast);
    const cOther = await buy(eOther, CARD.approvedFast);
    expect(c3.status).toBe('confirmed');
    expect(await post(e1, c3.code)).toMatchObject({ status: 200, message: 'Ingresso inválido para este evento' });
    expect(await post(e1, cOther.code)).toMatchObject({ message: 'Ingresso inválido para este evento' });
    // Nenhuma marcação no ingresso do outro evento.
    expect(await checkedInAt(c3.id)).toBeNull();
    expect(await checkedInAt(cOther.id)).toBeNull();
  });

  it('C3/AC-F06-2/CX-F07-F06: evento cancelado → Evento cancelado no POST e no lugar do campo no GET', async () => {
    const e3 = await publishedEvent(a, { name: 'E3', capacity: '5', price: '50,00' });
    const t5 = await buy(e3, CARD.approvedSlow);
    const c6 = await buy(e3, CARD.approvedFast);
    expect(c6.status).toBe('confirmed');

    // Antes do cancelamento, a página tem o campo.
    const before = await app.inject({ url: `/organizer/events/${e3}`, headers: { cookie: a } });
    expect(before.body).toContain('id="checkin-form"');
    expect(before.body).toContain('Código do ingresso');

    await cancelEvent(ORG_A_ID, e3);
    expect((await getTicket(c6.id))!.status).toBe('refunded');
    expect((await getTicket(t5.id))!.status).toBe('cancelled');

    expect(await post(e3, c6.code)).toMatchObject({ status: 200, message: 'Evento cancelado' });
    expect(await post(e3, t5.code)).toMatchObject({ message: 'Evento cancelado' });
    expect(await checkedInAt(c6.id)).toBeNull();

    const page = await app.inject({ url: `/organizer/events/${e3}`, headers: { cookie: a } });
    expect(page.statusCode).toBe(200);
    expect(page.body).toMatch(/<p id="checkin-closed"><strong>Evento cancelado<\/strong><\/p>/);
    expect(page.body).not.toContain('id="checkin-form"');
    expect(page.body).not.toContain('name="code"');
  });

  it('C4/AC-F06-3/CX-F04-F06: ingresso pendente ou recusado → Ingresso não confirmado', async () => {
    const e1 = await publishedEvent(a, { name: 'E1' });
    const pending = await buy(e1, CARD.declinedSlow);
    const declined = await buy(e1, CARD.declinedFast);
    expect(pending.status).toBe('pending');
    expect(declined.status).toBe('declined');
    expect(await post(e1, pending.code)).toMatchObject({ status: 200, message: 'Ingresso não confirmado' });
    expect(await post(e1, declined.code)).toMatchObject({ message: 'Ingresso não confirmado' });
    expect(await checkedInAt(pending.id)).toBeNull();
  });

  it('C5/AC-F06-5: confirmado → Entrada liberada, grava checked_in_at e a API mostra checkedIn: true', async () => {
    const e1 = await publishedEvent(a, { name: 'E1' });
    const c1 = await buy(e1, CARD.approvedFast);
    const api = () => app.inject({ url: `/api/partner/tickets/${c1.id}`, headers: { 'x-api-key': 'catraca-partner-dev-key' } });
    expect((await api()).json()).toMatchObject({ checkedIn: false, status: 'confirmed' });

    expect(await post(e1, c1.code)).toMatchObject({ status: 200, message: 'Entrada liberada' });
    expect(await checkedInAt(c1.id)).toBeInstanceOf(Date);
    expect((await api()).json()).toMatchObject({ checkedIn: true, status: 'confirmed' });
  });

  it('C6/AC-F06-4: o mesmo código de novo → Ingresso já utilizado (sem regravar checked_in_at)', async () => {
    const e1 = await publishedEvent(a, { name: 'E1' });
    const c1 = await buy(e1, CARD.approvedFast);
    expect((await post(e1, c1.code)).message).toBe('Entrada liberada');
    const first = await checkedInAt(c1.id);
    expect(await post(e1, c1.code)).toMatchObject({ status: 200, message: 'Ingresso já utilizado' });
    expect(await post(e1, c1.code.toLowerCase())).toMatchObject({ message: 'Ingresso já utilizado' });
    expect(await checkedInAt(c1.id)).toStrictEqual(first);
  });

  it('C7/AC-F06-5: código com espaços e minúsculas é normalizado → Entrada liberada', async () => {
    const e1 = await publishedEvent(a, { name: 'E1' });
    const c = await buy(e1, CARD.approvedFast);
    expect(await post(e1, `  ${c.code.toLowerCase()}  `)).toMatchObject({ status: 200, message: 'Entrada liberada' });
    expect(await checkedInAt(c.id)).toBeInstanceOf(Date);
  });

  it('C8/AC-F06-5: check-in concorrente do mesmo código → exatamente 1 Entrada liberada e 1 Ingresso já utilizado', async () => {
    const e1 = await publishedEvent(a, { name: 'E1', capacity: '50' });
    // Várias rodadas: uma corrida que passa uma vez não prova nada.
    for (let round = 0; round < 15; round++) {
      const t = await buy(e1, CARD.approvedFast);
      const results = await Promise.all([checkIn(ORG_A_ID, e1, t.code), checkIn(ORG_A_ID, e1, t.code)]);
      expect(results.sort()).toStrictEqual(['Entrada liberada', 'Ingresso já utilizado']);
    }
    // Também pela rota HTTP, com mais requisições ao mesmo tempo.
    const t = await buy(e1, CARD.approvedFast);
    const http = await Promise.all(Array.from({ length: 8 }, () => post(e1, t.code)));
    const messages = http.map((r) => r.message);
    expect(messages.filter((m) => m === 'Entrada liberada')).toHaveLength(1);
    expect(messages.filter((m) => m === 'Ingresso já utilizado')).toHaveLength(7);
  });

  it('C9/AC-F06-6: ordem de R10 com duas condições verdadeiras no banco', async () => {
    const live = await publishedEvent(a, { name: 'Vivo' });
    const liveTicket = await buy(live, CARD.approvedFast);
    // Evento já cancelado com ingressos em cada status (inserção direta, para combinar condições).
    const cancelled = await insertEvent({ status: 'cancelled', organizerId: ORG_A_ID });
    const [pendingId] = await insertTickets(cancelled, 'pending');
    const [confirmedId] = await insertTickets(cancelled, 'confirmed');
    const [usedId] = await insertTickets(cancelled, 'confirmed');
    await getPool().query('UPDATE tickets SET checked_in_at = now() WHERE id = $1', [usedId]);
    const code = async (id: string) => (await getTicket(id))!.code;

    // 1 antes de 2: cancelado + código de outro evento / inexistente → inválido.
    expect(await checkIn(ORG_A_ID, cancelled, liveTicket.code)).toBe('Ingresso inválido para este evento');
    expect(await checkIn(ORG_A_ID, cancelled, 'ZZZZZZZZ')).toBe('Ingresso inválido para este evento');
    // 2 antes de 3: cancelado + pendente.
    expect(await checkIn(ORG_A_ID, cancelled, await code(pendingId!))).toBe('Evento cancelado');
    // 2 antes de 4 e de 5: cancelado + já utilizado / cancelado + confirmado sem check-in.
    expect(await checkIn(ORG_A_ID, cancelled, await code(usedId!))).toBe('Evento cancelado');
    expect(await checkIn(ORG_A_ID, cancelled, await code(confirmedId!))).toBe('Evento cancelado');
    expect(await checkedInAt(confirmedId!)).toBeNull();

    // 3 antes de 4: já passou pelo check-in, mas deixou de estar confirmado.
    const [refundedUsed] = await insertTickets(live, 'confirmed');
    await getPool().query('UPDATE tickets SET checked_in_at = now() WHERE id = $1', [refundedUsed]);
    await getPool().query(`UPDATE tickets SET status = 'refunded' WHERE id = $1 AND status = 'confirmed'`, [
      refundedUsed,
    ]);
    expect(await checkIn(ORG_A_ID, live, await code(refundedUsed!))).toBe('Ingresso não confirmado');
  });

  it('C10/CX-F02-F06: organizador B fazendo check-in no evento de A → 404 sem dados de E1', async () => {
    const e1 = await publishedEvent(a, { name: 'Jazz Secreto de A' });
    const c1 = await buy(e1, CARD.approvedFast);
    const res = await checkinHttp(app, b, e1, c1.code);
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('Jazz Secreto de A');
    expect(res.body).not.toContain(c1.code);
    expect(checkinResult(res.body)).toBeNull();
    expect(await checkedInAt(c1.id)).toBeNull();
    // Evento inexistente: mesmo 404.
    const missing = await checkinHttp(app, b, 'evt_inexistente', c1.code);
    expect(missing.statusCode).toBe(404);
    // O serviço também não aceita evento de outro organizador.
    await expect(checkIn(ORG_B_ID, e1, c1.code)).rejects.toBeInstanceOf(CheckinError);

    // Participante e visitante não acessam a rota.
    const p = await loginAs(app, PARTICIPANT);
    expect((await checkinHttp(app, p, e1, c1.code)).statusCode).toBe(403);
    const anon = await checkinHttp(app, null, e1, c1.code);
    expect(anon.statusCode).toBe(302);
    expect(anon.headers.location).toMatch(/^\/login/);
    expect(await checkedInAt(c1.id)).toBeNull();
    // Dono do evento continua conseguindo.
    expect((await post(e1, c1.code)).message).toBe('Entrada liberada');
  });

  it('C11/CX-F04-F06: ingresso comprado pela API e confirmado → Entrada liberada; pendente da API → não confirmado', async () => {
    const e1 = await publishedEvent(a, { name: 'E1' });
    const t3 = await buyInject(app, e1, { buyerEmail: 't3@example.com', cardNumber: CARD.approvedFast });
    const t2 = await buyInject(app, e1, { buyerEmail: 't2@example.com', cardNumber: CARD.declinedSlow });
    expect(t3.statusCode).toBe(202);
    expect(t2.statusCode).toBe(202);
    await processDuePayments();
    const { ticketId, code } = t3.json() as { ticketId: string; code: string };
    expect((await getTicket(ticketId))!.status).toBe('confirmed');

    expect(await post(e1, (t2.json() as { code: string }).code)).toMatchObject({ message: 'Ingresso não confirmado' });
    expect(await post(e1, code)).toMatchObject({ status: 200, message: 'Entrada liberada' });
    const api = await app.inject({ url: `/api/partner/tickets/${ticketId}`, headers: { 'x-api-key': 'catraca-partner-dev-key' } });
    expect(api.json()).toMatchObject({ ticketId, status: 'confirmed', checkedIn: true });
  });

  it('AC-F06-5: cancelamento depois do check-in não desfaz a marcação; novo POST → Evento cancelado', async () => {
    const e = await publishedEvent(a, { name: 'Depois cancelado' });
    const t = await buy(e, CARD.approvedFast);
    expect((await post(e, t.code)).message).toBe('Entrada liberada');
    await cancelEvent(ORG_A_ID, e);
    expect(await post(e, t.code)).toMatchObject({ message: 'Evento cancelado' });
  });
});
