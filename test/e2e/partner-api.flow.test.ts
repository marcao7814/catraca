import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { closePool } from '../../src/db/pool.js';
import { startGatewayWorker } from '../../src/modules/sales/index.js';
import { resetDb } from '../helpers/db.js';
import { createEventHttp, publishHttp } from '../helpers/events.js';
import { loginAs, ORG_A } from '../helpers/http.js';
import { buyFetch, countStatuses, getJson } from '../helpers/partner.js';
import { CARD, waitFor } from '../helpers/sales.js';

// Passos 2, 4, 6, 7, 8, 15 e 16 do fluxo do avaliador (brief), pela API de parceiros em HTTP real,
// com o worker do gateway rodando (atrasos escalados por GATEWAY_DELAY_SCALE nos gates).
let app: FastifyInstance;
let base: string;
let a: string;
let stopWorker: () => Promise<void>;

beforeAll(async () => {
  await resetDb();
  app = await buildApp();
  await app.listen({ host: '127.0.0.1', port: 0 });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  stopWorker = startGatewayWorker(10);
  a = await loginAs(app, ORG_A);
});
afterAll(async () => {
  await stopWorker();
  await app.close();
  await closePool();
});

type Listed = { id: string; name: string; startsAt: string; priceCents: number; availableSeats: number };
const listed = async (id: string) =>
  ((await getJson(base, '/api/partner/events')).body as Listed[]).find((e) => e.id === id);
const ticketStatus = async (id: string) =>
  ((await getJson(base, `/api/partner/tickets/${id}`)).body as { status: string }).status;

describe('F05 — fluxo do avaliador pela API (E2E)', () => {
  it('passos 2–8: rascunho fora, publicado com 2 vagas, 0004 ocupa vaga até recusar, 0001 confirma', async () => {
    const e1 = await createEventHttp(app, a, { name: 'E1', capacity: '2', price: '100,00' });
    expect(await listed(e1)).toBeUndefined(); // passo 2

    await publishHttp(app, a, e1); // passo 4
    expect(await listed(e1)).toMatchObject({ id: e1, name: 'E1', priceCents: 10000, availableSeats: 2 });

    // passo 5 (vitrine) substituído por uma compra aprovada para ocupar a 1ª vaga
    const c1 = await buyFetch(base, e1, { buyerEmail: 'p@example.com', cardNumber: CARD.approvedFast });
    expect(c1.status).toBe(202);
    const t1 = (c1.body as { ticketId: string }).ticketId;
    await waitFor(async () => (await ticketStatus(t1)) === 'confirmed', 10_000);

    // Worker pausado durante os passos 6–7: com atrasos escalados (0004 ≈ 0,3 s) a recusa
    // poderia chegar antes das verificações; no ambiente real há 30–40 s de janela.
    await stopWorker();

    // passo 6
    const c2 = await buyFetch(base, e1, { buyerEmail: 't2@example.com', cardNumber: CARD.declinedSlow });
    expect(c2).toStrictEqual({
      status: 202,
      body: { ticketId: expect.any(String), code: expect.any(String), status: 'pending' },
    });
    const t2 = (c2.body as { ticketId: string }).ticketId;
    expect((await listed(e1))!.availableSeats).toBe(0);

    // passo 7 (a resposta lenta ainda não chegou)
    expect(await ticketStatus(t2)).toBe('pending');
    expect(await buyFetch(base, e1, { buyerEmail: 'x@example.com', cardNumber: CARD.approvedFast })).toStrictEqual({
      status: 409,
      body: { error: 'sold_out' },
    });

    // passo 8
    stopWorker = startGatewayWorker(10);
    await waitFor(async () => (await ticketStatus(t2)) === 'declined', 10_000);
    expect((await listed(e1))!.availableSeats).toBe(1);
    const c3 = await buyFetch(base, e1, { buyerEmail: 't3@example.com', cardNumber: CARD.approvedFast });
    expect(c3.status).toBe(202);
    const t3 = (c3.body as { ticketId: string }).ticketId;
    await waitFor(async () => (await ticketStatus(t3)) === 'confirmed', 10_000);
    expect((await listed(e1))!.availableSeats).toBe(0);
  });

  it('passo 15: rajada de 30 em E4 e E5 novos (lotação 5) → 5×202 e 25×409, e os 5 confirmam', async () => {
    for (const name of ['E4', 'E5']) {
      const id = await createEventHttp(app, a, { name, capacity: '5', price: '10,00' });
      await publishHttp(app, a, id);
      const results = await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          buyFetch(base, id, { buyerEmail: `carga${i}@example.com`, cardNumber: CARD.approvedFast }),
        ),
      );
      expect(countStatuses(results.map((r) => r.status)), name).toStrictEqual({ 202: 5, 409: 25 });
      const ids = results.filter((r) => r.status === 202).map((r) => (r.body as { ticketId: string }).ticketId);
      await waitFor(async () => (await Promise.all(ids.map(ticketStatus))).every((s) => s === 'confirmed'), 10_000);
      expect((await listed(id))!.availableSeats).toBe(0);
    }
  });

  it('passo 16: 401 sem chave/chave errada nas três rotas; cartão 123 → 422; ticket inexistente → 404', async () => {
    const paths: Array<[string, RequestInit]> = [
      ['/api/partner/events', {}],
      [
        '/api/partner/events/evt_x/purchases',
        { method: 'POST', body: JSON.stringify({ buyerEmail: 'a@example.com', cardNumber: CARD.approvedFast }) },
      ],
      ['/api/partner/tickets/tkt_x', {}],
    ];
    for (const [path, init] of paths) {
      for (const key of [null, 'chave-errada']) {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (key) headers['x-api-key'] = key;
        const res = await fetch(`${base}${path}`, { ...init, headers });
        expect({ status: res.status, body: await res.json() }, `${path} ${key}`).toStrictEqual({
          status: 401,
          body: { error: 'unauthorized' },
        });
      }
    }
    const e = await createEventHttp(app, a, { name: 'E6' });
    await publishHttp(app, a, e);
    expect(await buyFetch(base, e, { buyerEmail: 'a@example.com', cardNumber: '123' })).toStrictEqual({
      status: 422,
      body: { error: 'invalid_request' },
    });
    expect(await getJson(base, '/api/partner/tickets/tkt_naoexiste')).toStrictEqual({
      status: 404,
      body: { error: 'ticket_not_found' },
    });
  });
});
