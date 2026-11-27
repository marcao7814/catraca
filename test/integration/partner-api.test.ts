import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { config } from '../../src/config.js';
import { closePool, getPool } from '../../src/db/pool.js';
import { toIsoOffset } from '../../src/lib/dates.js';
import { getEvent } from '../../src/modules/events/index.js';
import {
  getGateway,
  getTicket,
  purchaseTicket,
  setGateway,
  startGatewayWorker,
  type PaymentGateway,
} from '../../src/modules/sales/index.js';
import { resetDb } from '../helpers/db.js';
import { createEventHttp, insertTickets, publishHttp } from '../helpers/events.js';
import { loginAs, ORG_A } from '../helpers/http.js';
import { auth, buyInject, KEY } from '../helpers/partner.js';
import { CARD, insertEvent, waitFor } from '../helpers/sales.js';

const realGateway = getGateway();
/** Gateway que nunca responde dentro do teste (mantém o ingresso pendente). */
const neverGateway: PaymentGateway = { authorize: (card) => ({ ...realGateway.authorize(card), delayMs: 3_600_000 }) };

const VALID = { buyerEmail: 'ana@example.com', cardNumber: CARD.approvedFast };
const UNAUTHORIZED = { error: 'unauthorized' };
const INVALID = { error: 'invalid_request' };
const NOT_AVAILABLE = { error: 'event_not_available' };
const SOLD_OUT = { error: 'sold_out' };
const TICKET_RE = /^tkt_[a-z2-7]+$/;
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

let app: FastifyInstance;
let a: string;
let stopWorker: (() => Promise<void>) | null = null;

beforeAll(async () => {
  app = await buildApp();
});
beforeEach(async () => {
  await resetDb();
  setGateway(neverGateway);
  a = await loginAs(app, ORG_A);
});
afterEach(async () => {
  setGateway(realGateway);
  if (stopWorker) await stopWorker();
  stopWorker = null;
});
afterAll(async () => {
  await app.close();
  await closePool();
});

const listEvents = () => app.inject({ url: '/api/partner/events', headers: auth() });
const getTicketApi = (id: string) => app.inject({ url: `/api/partner/tickets/${id}`, headers: auth() });

/** Status + corpo JSON, conferindo que a resposta é sempre application/json. */
function out(res: { statusCode: number; headers: Record<string, unknown>; body: string }) {
  expect(res.headers['content-type']).toMatch(/^application\/json/);
  return { status: res.statusCode, body: JSON.parse(res.body) as unknown };
}

describe('F05 — autenticação (T4)', () => {
  const routes = [
    { method: 'GET' as const, url: '/api/partner/events' },
    { method: 'POST' as const, url: '/api/partner/events/evt_qualquer/purchases' },
    { method: 'GET' as const, url: '/api/partner/tickets/tkt_qualquer' },
  ];

  it('C1/AC-F05-1: as três rotas sem X-Api-Key ou com chave errada respondem 401 unauthorized', async () => {
    for (const r of routes) {
      for (const headers of [{}, { 'x-api-key': 'errada' }, { 'x-api-key': '' }, { 'x-api-key': `${KEY}x` }]) {
        const res = await app.inject({
          method: r.method,
          url: r.url,
          headers: { ...headers, 'content-type': 'application/json' },
          payload: r.method === 'POST' ? JSON.stringify(VALID) : undefined,
        });
        expect(out(res), `${r.method} ${r.url} ${JSON.stringify(headers)}`).toStrictEqual({
          status: 401,
          body: UNAUTHORIZED,
        });
      }
    }
  });

  it('C1/AC-F05-1: a chave é checada antes do parsing (JSON malformado ou content-type errado sem chave → 401)', async () => {
    const id = await insertEvent();
    for (const res of [
      await buyInject(app, id, '{"buyerEmail":', { key: null, raw: true }),
      await buyInject(app, id, 'x=1', { key: 'errada', raw: true, contentType: 'text/plain' }),
      await buyInject(app, id, '{', { key: null, raw: true, contentType: 'application/x-www-form-urlencoded' }),
    ]) {
      expect(out(res)).toStrictEqual({ status: 401, body: UNAUTHORIZED });
    }
    const { rows } = await getPool().query('SELECT count(*) AS n FROM tickets');
    expect(rows[0].n).toBe(0);
  });

  it('C1/AC-F05-1: rota inexistente sob o prefixo também exige a chave', async () => {
    expect(out(await app.inject({ url: '/api/partner/nada' }))).toStrictEqual({ status: 401, body: UNAUTHORIZED });
    expect(out(await app.inject({ url: '/api/partner/nada', headers: auth() }))).toStrictEqual({
      status: 404,
      body: { error: 'not_found' },
    });
  });

  it('C14/CX-F01-F05: a chave configurada no compose (a mesma documentada no README) é a aceita', async () => {
    expect(readFileSync('compose.yml', 'utf8')).toContain(`PARTNER_API_KEY: ${KEY}`);
    expect(config.partnerApiKey).toBe(KEY);
    expect(out(await listEvents()).status).toBe(200);
  });
});

describe('F05 — listagem (R02, R05)', () => {
  it('C2/C3/AC-F05-2/CX-F02-F05: rascunho ausente; publicado aparece com exatamente id,name,startsAt,priceCents,availableSeats', async () => {
    const id = await createEventHttp(app, a, { name: 'Jazz no Porão', capacity: '2', price: '100,00' });
    expect(out(await listEvents())).toStrictEqual({ status: 200, body: [] });

    await publishHttp(app, a, id);
    const event = (await getEvent(id))!;
    const res = out(await listEvents());
    expect(res).toStrictEqual({
      status: 200,
      body: [{ id, name: 'Jazz no Porão', startsAt: toIsoOffset(event.startsAt), priceCents: 10000, availableSeats: 2 }],
    });
    expect((res.body as Array<{ startsAt: string }>)[0]!.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/);
  });

  it('AC-F05-2: availableSeats segue R05 (pendente e confirmado ocupam; recusado não); cancelado some; ordenado por startsAt', async () => {
    const later = await insertEvent({ capacity: 5 });
    await getPool().query("UPDATE events SET starts_at = now() + interval '60 days' WHERE id = $1", [later]);
    const sooner = await insertEvent({ capacity: 4 });
    const cancelled = await insertEvent({ status: 'cancelled' });
    await insertTickets(sooner, 'pending', 1);
    await insertTickets(sooner, 'confirmed', 1);
    await insertTickets(sooner, 'declined', 2);
    const body = out(await listEvents()).body as Array<{ id: string; availableSeats: number }>;
    expect(body.map((e) => e.id)).toStrictEqual([sooner, later]);
    expect(body.map((e) => e.availableSeats)).toStrictEqual([2, 5]);
    expect(body.some((e) => e.id === cancelled)).toBe(false);
  });

  it('AC-F05-2: evento esgotado continua listado com availableSeats 0', async () => {
    const id = await insertEvent({ capacity: 1 });
    await insertTickets(id, 'confirmed', 1);
    const body = out(await listEvents()).body as Array<{ id: string; availableSeats: number }>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id, availableSeats: 0 });
  });
});

describe('F05 — compra (R06, R07)', () => {
  it('C4/AC-F05-3: compra válida → 202 {ticketId, code, status:"pending"} e ingresso de canal partner', async () => {
    const id = await insertEvent({ capacity: 2 });
    const res = out(await buyInject(app, id, VALID));
    expect(res).toStrictEqual({
      status: 202,
      body: { ticketId: expect.stringMatching(TICKET_RE), code: expect.stringMatching(CODE_RE), status: 'pending' },
    });
    const { ticketId, code } = res.body as { ticketId: string; code: string };
    expect(await getTicket(ticketId)).toMatchObject({
      eventId: id,
      code,
      channel: 'partner',
      buyerUserId: null,
      buyerEmail: 'ana@example.com',
      status: 'pending',
    });
    const body = out(await listEvents()).body as Array<{ availableSeats: number }>;
    expect(body[0]!.availableSeats).toBe(1);
  });

  it('C5/AC-F05-4: corpo inválido → 422 invalid_request (e nenhum ingresso criado)', async () => {
    const id = await insertEvent();
    const cases: Array<[string, Parameters<typeof buyInject>[2], Parameters<typeof buyInject>[3]?]> = [
      ['cartão 123', { ...VALID, cardNumber: '123' }],
      ['cartão com 17 dígitos', { ...VALID, cardNumber: '40000000000000011' }],
      ['cartão com letras', { ...VALID, cardNumber: '400000000000000a' }],
      ['cartão numérico', { ...VALID, cardNumber: 4000000000000001 }],
      ['corpo {}', {}],
      ['sem cardNumber', { buyerEmail: VALID.buyerEmail }],
      ['sem buyerEmail', { cardNumber: VALID.cardNumber }],
      ['e-mail "x"', { ...VALID, buyerEmail: 'x' }],
      ['e-mail sem domínio', { ...VALID, buyerEmail: 'ana@' }],
      ['e-mail null', { ...VALID, buyerEmail: null }],
      ['corpo array', [VALID]],
      ['corpo null', null],
      ['corpo string', 'texto'],
      ['JSON malformado', '{"buyerEmail":"ana@example.com",', { raw: true }],
      ['corpo vazio', '', { raw: true }],
      ['content-type text/plain', JSON.stringify(VALID), { raw: true, contentType: 'text/plain' }],
      ['content-type form', 'buyerEmail=ana%40example.com&cardNumber=4000000000000001', { raw: true, contentType: 'application/x-www-form-urlencoded' }],
      ['sem content-type', JSON.stringify(VALID), { raw: true, contentType: null }],
    ];
    for (const [label, body, opts] of cases) {
      expect(out(await buyInject(app, id, body, opts)), label).toStrictEqual({ status: 422, body: INVALID });
    }
    const { rows } = await getPool().query('SELECT count(*) AS n FROM tickets');
    expect(rows[0].n).toBe(0);
  });

  it('C5/AC-F05-4: corpo acima do limite → 422 (nunca 413/500)', async () => {
    const id = await insertEvent();
    const res = await buyInject(app, id, { ...VALID, pad: 'x'.repeat(100_000) });
    expect(out(res)).toStrictEqual({ status: 422, body: INVALID });
  });

  it('AC-F05-4: content-type JSON com charset é aceito', async () => {
    const id = await insertEvent();
    const res = await buyInject(app, id, VALID, { contentType: 'application/json; charset=utf-8' });
    expect(res.statusCode).toBe(202);
  });

  it('C6/AC-F05-4: id inexistente com cartão 123 → 422 (validação antes da existência)', async () => {
    expect(out(await buyInject(app, 'evt_naoexiste', { ...VALID, cardNumber: '123' }))).toStrictEqual({
      status: 422,
      body: INVALID,
    });
  });

  it('C7/AC-F05-4: evento inexistente, rascunho ou cancelado → 404 event_not_available', async () => {
    const draft = await insertEvent({ status: 'draft' });
    const cancelled = await insertEvent({ status: 'cancelled' });
    for (const id of ['evt_naoexiste', draft, cancelled, 'id%00nulo']) {
      expect(out(await buyInject(app, id, VALID)), id).toStrictEqual({ status: 404, body: NOT_AVAILABLE });
    }
    const { rows } = await getPool().query('SELECT count(*) AS n FROM tickets');
    expect(rows[0].n).toBe(0);
  });

  it('C8/C9/AC-F05-4: esgotado → 409 sold_out; esgotado com cartão 123 → 422 (ordem)', async () => {
    const id = await insertEvent({ capacity: 1 });
    expect((await buyInject(app, id, VALID)).statusCode).toBe(202);
    expect(out(await buyInject(app, id, VALID))).toStrictEqual({ status: 409, body: SOLD_OUT });
    expect(out(await buyInject(app, id, { ...VALID, cardNumber: '123' }))).toStrictEqual({ status: 422, body: INVALID });
    const { rows } = await getPool().query('SELECT count(*) AS n FROM tickets WHERE event_id = $1', [id]);
    expect(rows[0].n).toBe(1);
  });

  it('AC-F05-4: cartão inválido em evento cancelado → 422 (ordem)', async () => {
    const id = await insertEvent({ status: 'cancelled' });
    expect(out(await buyInject(app, id, { ...VALID, cardNumber: '123' }))).toStrictEqual({ status: 422, body: INVALID });
  });
});

describe('F05 — consulta de ingresso', () => {
  it('C10/AC-F05-5: ingresso comprado pela API → 200 com exatamente ticketId,code,eventId,status,checkedIn', async () => {
    const id = await insertEvent();
    const { ticketId, code } = JSON.parse((await buyInject(app, id, VALID)).body) as { ticketId: string; code: string };
    expect(out(await getTicketApi(ticketId))).toStrictEqual({
      status: 200,
      body: { ticketId, code, eventId: id, status: 'pending', checkedIn: false },
    });
  });

  it('C10/AC-F05-5: ingresso da vitrine também é consultável; checkedIn reflete o check-in', async () => {
    const id = await insertEvent();
    const r = await purchaseTicket({
      eventId: id,
      channel: 'storefront',
      buyerUserId: 'usr_seed_part',
      buyerEmail: 'participante@catraca.dev',
      cardNumber: CARD.approvedFast,
    });
    if (!r.ok) throw new Error(r.error);
    await getPool().query("UPDATE tickets SET status = 'confirmed' WHERE id = $1 AND status = 'pending'", [r.ticket.id]);
    expect(out(await getTicketApi(r.ticket.id))).toStrictEqual({
      status: 200,
      body: { ticketId: r.ticket.id, code: r.ticket.code, eventId: id, status: 'confirmed', checkedIn: false },
    });
    await getPool().query('UPDATE tickets SET checked_in_at = now() WHERE id = $1', [r.ticket.id]);
    expect(out(await getTicketApi(r.ticket.id)).body).toStrictEqual({
      ticketId: r.ticket.id,
      code: r.ticket.code,
      eventId: id,
      status: 'confirmed',
      checkedIn: true,
    });
  });

  it('C11/AC-F05-5: ingresso inexistente → 404 ticket_not_found', async () => {
    for (const id of ['tkt_naoexiste', 'id%00nulo']) {
      expect(out(await getTicketApi(id)), id).toStrictEqual({ status: 404, body: { error: 'ticket_not_found' } });
    }
  });
});

describe('F05 — integração com o gateway (F04)', () => {
  it('C13/CX-F04-F05: cartão 0004 deixa availableSeats 0; após a recusa, declined e availableSeats volta a 1', async () => {
    setGateway(realGateway); // atrasos reais escalados por GATEWAY_DELAY_SCALE nos gates
    const id = await insertEvent({ capacity: 2 });
    await insertTickets(id, 'confirmed', 1);
    const seats = async () => ((out(await listEvents()).body as Array<{ availableSeats: number }>)[0]!.availableSeats);

    const buy = out(await buyInject(app, id, { buyerEmail: 't2@example.com', cardNumber: CARD.declinedSlow }));
    expect(buy.status).toBe(202);
    const { ticketId } = buy.body as { ticketId: string };
    expect(await seats()).toBe(0);
    expect(out(await buyInject(app, id, VALID))).toStrictEqual({ status: 409, body: SOLD_OUT });

    stopWorker = startGatewayWorker(10);
    await waitFor(async () => (out(await getTicketApi(ticketId)).body as { status: string }).status === 'declined', 10_000);
    expect(out(await getTicketApi(ticketId)).body).toMatchObject({ status: 'declined', checkedIn: false });
    expect(await seats()).toBe(1);
  });
});
