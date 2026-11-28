import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { closePool, getPool } from '../../src/db/pool.js';
import { startGatewayWorker } from '../../src/modules/sales/index.js';
import { cancelHttp } from '../helpers/cancellation.js';
import { checkinHttp, checkinResult } from '../helpers/checkin.js';
import { resetDb } from '../helpers/db.js';
import { createEventHttp, publishHttp } from '../helpers/events.js';
import { loginAs, ORG_A, ORG_B, PARTICIPANT } from '../helpers/http.js';
import { buyFetch, getJson } from '../helpers/partner.js';
import { CARD, waitFor } from '../helpers/sales.js';
import { purchaseHttp, signupAs } from '../helpers/storefront.js';

// Passos 10, 11 (trecho do check-in e do acesso de B) e 14 (check-in em evento cancelado) do fluxo
// do avaliador, com o worker do gateway rodando (atrasos escalados por GATEWAY_DELAY_SCALE nos gates)
// e a API de parceiros em HTTP real.
let app: FastifyInstance;
let base: string;
let a: string;
let b: string;
let stopWorker: () => Promise<void>;

beforeAll(async () => {
  await resetDb();
  app = await buildApp();
  await app.listen({ host: '127.0.0.1', port: 0 });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  stopWorker = startGatewayWorker(10);
  a = await loginAs(app, ORG_A);
  b = await loginAs(app, ORG_B);
});
afterAll(async () => {
  await stopWorker();
  await app.close();
  await closePool();
});

type ApiTicket = { ticketId: string; code: string; status: string; checkedIn: boolean };
const apiTicket = async (id: string) => (await getJson(base, `/api/partner/tickets/${id}`)).body as ApiTicket;
const waitStatus = (id: string, status: string) =>
  waitFor(async () => (await apiTicket(id)).status === status, 15_000, 50);

async function buyApi(eventId: string, card: string, email = 'e2e@example.com') {
  const res = await buyFetch(base, eventId, { buyerEmail: email, cardNumber: card });
  expect(res.status).toBe(202);
  return res.body as { ticketId: string; code: string; status: string };
}

const checkin = async (eventId: string, code: string, cookie = a) => {
  const res = await checkinHttp(app, cookie, eventId, code);
  return { status: res.statusCode, message: checkinResult(res.body), body: res.body };
};

describe('F06 — fluxo do avaliador: check-in (E2E)', () => {
  let e1: string;
  let c1: { id: string; code: string };

  it('passo 10: C1 → Entrada liberada; de novo → já utilizado; C2 → não confirmado; ZZZZZZZZ → inválido', async () => {
    e1 = await createEventHttp(app, a, { name: 'E1 do fluxo', capacity: '3', price: '100,00' });
    expect((await publishHttp(app, a, e1)).statusCode).toBe(302);

    // C1: comprado na vitrine por um participante novo, cartão 0001.
    const participant = await signupAs(app);
    const buy = await purchaseHttp(app, participant, e1, '4000000000000001');
    expect(buy.statusCode).toBe(302);
    const { rows } = await getPool().query<{ id: string; code: string }>(
      `SELECT id, code FROM tickets WHERE event_id = $1 AND channel = 'storefront'`,
      [e1],
    );
    c1 = rows[0]!;
    await waitStatus(c1.id, 'confirmed');

    // C2: pela API com 0004 (pendente e depois recusado: não confirmado em qualquer dos dois).
    const t2 = await buyApi(e1, CARD.declinedSlow, 't2@example.com');
    expect(await checkin(e1, t2.code)).toMatchObject({ status: 200, message: 'Ingresso não confirmado' });
    await waitStatus(t2.ticketId, 'declined');

    // T3: pela API com 0001, confirmado.
    const t3 = await buyApi(e1, CARD.approvedFast, 't3@example.com');
    await waitStatus(t3.ticketId, 'confirmed');

    expect(await checkin(e1, c1.code)).toMatchObject({ status: 200, message: 'Entrada liberada' });
    expect(await checkin(e1, c1.code)).toMatchObject({ status: 200, message: 'Ingresso já utilizado' });
    expect(await checkin(e1, t2.code)).toMatchObject({ status: 200, message: 'Ingresso não confirmado' });
    expect(await checkin(e1, 'ZZZZZZZZ')).toMatchObject({ status: 200, message: 'Ingresso inválido para este evento' });

    expect((await apiTicket(c1.id)).checkedIn).toBe(true);
    expect((await apiTicket(t3.ticketId)).checkedIn).toBe(false);
    const { rows: n } = await getPool().query<{ n: number }>(
      'SELECT count(*)::int AS n FROM tickets WHERE event_id = $1 AND checked_in_at IS NOT NULL',
      [e1],
    );
    expect(n[0]!.n).toBe(1); // base do "Check-ins 1" do painel
  });

  it('passo 11: B não faz check-in nem vê E1; C3 (de E2, de B) no check-in de E1 → inválido', async () => {
    const page = await app.inject({ url: `/organizer/events/${e1}`, headers: { cookie: b } });
    expect(page.statusCode).toBe(404);
    expect(page.body).not.toContain('E1 do fluxo');
    const post = await checkin(e1, c1.code, b);
    expect(post.status).toBe(404);
    expect(post.body).not.toContain('E1 do fluxo');
    expect(post.message).toBeNull();

    const p = await loginAs(app, PARTICIPANT);
    expect((await checkinHttp(app, p, e1, c1.code)).statusCode).toBe(403);
    expect((await checkinHttp(app, null, e1, c1.code)).statusCode).toBe(302);

    const e2 = await createEventHttp(app, b, { name: 'E2', capacity: '1', price: '20,00' });
    expect((await publishHttp(app, b, e2)).statusCode).toBe(302);
    const c3 = await buyApi(e2, CARD.approvedFast, 'c3@example.com');
    await waitStatus(c3.ticketId, 'confirmed');

    expect(await checkin(e1, c3.code)).toMatchObject({ status: 200, message: 'Ingresso inválido para este evento' });
    expect((await apiTicket(c3.ticketId)).checkedIn).toBe(false);
  });

  it('passos 12–14: E3 cancelado; C6 (agora estornado) no check-in → Evento cancelado, no lugar do campo', async () => {
    const e3 = await createEventHttp(app, a, { name: 'E3', capacity: '5', price: '50,00' });
    expect((await publishHttp(app, a, e3)).statusCode).toBe(302);
    await buyApi(e3, CARD.approvedSlow, 't5@example.com');
    const t6 = await buyApi(e3, CARD.approvedFast, 't6@example.com');
    await waitStatus(t6.ticketId, 'confirmed');

    expect((await cancelHttp(app, a, e3)).statusCode).toBe(302);
    await waitStatus(t6.ticketId, 'refunded');

    expect(await checkin(e3, t6.code)).toMatchObject({ status: 200, message: 'Evento cancelado' });
    const page = await app.inject({ url: `/organizer/events/${e3}`, headers: { cookie: a } });
    expect(page.body).toContain('<p id="checkin-closed"><strong>Evento cancelado</strong></p>');
    expect(page.body).not.toContain('id="checkin-form"');
    expect((await apiTicket(t6.ticketId)).checkedIn).toBe(false);
  });
});
