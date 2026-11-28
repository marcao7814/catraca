// Integração da W4: F06 (check-in) e F08 (painel) foram implementadas em paralelo, e a F08
// simulou o check-in gravando `checked_in_at`. Aqui o check-in é o REAL (POST da página de gestão),
// com vitrine (F03), API de parceiros (F05), worker do gateway (F04) e cancelamento (F07) juntos.
// Cobre CX-F06-F08 sem simulação e repete o trecho dos passos 9, 10 e 14 do brief em um evento só.
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { closePool, getPool } from '../../src/db/pool.js';
import { startGatewayWorker } from '../../src/modules/sales/index.js';
import { cancelHttp } from '../helpers/cancellation.js';
import { checkinHttp, checkinResult } from '../helpers/checkin.js';
import { expected, panel } from '../helpers/dashboard.js';
import { resetDb } from '../helpers/db.js';
import { createEventHttp, publishHttp } from '../helpers/events.js';
import { loginAs, ORG_A, ORG_B } from '../helpers/http.js';
import { buyFetch, getJson } from '../helpers/partner.js';
import { CARD, waitFor } from '../helpers/sales.js';
import { purchaseHttp, signupAs } from '../helpers/storefront.js';

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

type ApiTicket = { ticketId: string; code: string; eventId: string; status: string; checkedIn: boolean };
const apiTicket = async (id: string) => (await getJson(base, `/api/partner/tickets/${id}`)).body as ApiTicket;
const waitStatus = (id: string, status: string) =>
  waitFor(async () => (await apiTicket(id)).status === status, 15_000, 50);
const checkin = async (eventId: string, code: string) => checkinResult((await checkinHttp(app, a, eventId, code)).body);

describe('Integração W4 — check-in real no painel (CX-F06-F08) com todas as features', () => {
  it('vitrine + API + gateway + check-in + painel + cancelamento, no mesmo evento', async () => {
    const e1 = await createEventHttp(app, a, { name: 'E1 integração', capacity: '3', price: '100,00' });
    expect((await publishHttp(app, a, e1)).statusCode).toBe(302);

    // C1 pela vitrine (cartão 0001), C2 pela API com cartão lento recusado (0004), C3 pela API aprovado.
    const participant = await signupAs(app);
    expect((await purchaseHttp(app, participant, e1, CARD.approvedFast)).statusCode).toBe(302);
    const { rows } = await getPool().query<{ code: string }>(
      "SELECT code FROM tickets WHERE event_id = $1 AND channel = 'storefront'",
      [e1],
    );
    const c1Code = rows[0]?.code;
    expect(c1Code).toBeDefined();
    const mine = await app.inject({ url: '/me/tickets', headers: { cookie: participant } });
    expect(mine.body).toContain(c1Code!);

    const t2 = (await buyFetch(base, e1, { buyerEmail: 't2@example.com', cardNumber: CARD.declinedSlow })).body as ApiTicket;
    const t3 = (await buyFetch(base, e1, { buyerEmail: 't3@example.com', cardNumber: CARD.approvedFast })).body as ApiTicket;

    // Pendente ainda não entra.
    expect(await checkin(e1, t2.code)).toBe('Ingresso não confirmado');

    await waitStatus(t3.ticketId, 'confirmed');
    await waitFor(async () => (await panel(app, a, e1)).metrics.confirmed === '2', 15_000, 50);

    // Check-in real de C1 (vitrine) e de T3 (API): o painel conta os dois; Confirmados não muda.
    expect(await checkin(e1, c1Code!)).toBe('Entrada liberada');
    expect((await panel(app, a, e1)).metrics).toMatchObject({ confirmed: '2', checkins: '1' });
    expect(await checkin(e1, t3.code.toLowerCase())).toBe('Entrada liberada');
    expect(await checkin(e1, t3.code)).toBe('Ingresso já utilizado');
    expect((await apiTicket(t3.ticketId)).checkedIn).toBe(true);

    await waitStatus(t2.ticketId, 'declined');
    expect((await panel(app, a, e1)).metrics).toEqual(
      expected({ confirmed: 2, pending: 0, checkins: 2, available: 1, revenue: 'R$ 200,00', refunded: 0 }),
    );

    // B não vê nada de E1, nem pelo painel nem pelo check-in.
    const asB = await panel(app, b, e1);
    expect(asB.status).toBe(404);
    expect(asB.body).not.toContain('data-metric');
    expect((await checkinHttp(app, b, e1, t3.code)).statusCode).toBe(404);

    // Cancelamento: confirmados viram estornados; receita e check-ins zeram; check-in passa a recusar.
    expect((await cancelHttp(app, a, e1)).statusCode).toBe(302);
    expect((await panel(app, a, e1)).metrics).toEqual(
      expected({ confirmed: 0, pending: 0, checkins: 0, available: 0, revenue: 'R$ 0,00', refunded: 2 }),
    );
    expect(await checkin(e1, c1Code!)).toBe('Evento cancelado');
    expect(await checkin(e1, 'ZZZZZZZZ')).toBe('Ingresso inválido para este evento');
    expect((await getJson(base, '/api/partner/events')).body).toEqual([]);
  });
});
