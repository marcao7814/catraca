import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { closePool, getPool } from '../../src/db/pool.js';
import { CancellationError, cancelEvent } from '../../src/modules/cancellation/index.js';
import { getEvent, listSellableEvents } from '../../src/modules/events/index.js';
import {
  applyGatewayResult,
  getGateway,
  getSeatStats,
  getTicket,
  processDuePayments,
  purchaseTicket,
  setGateway,
} from '../../src/modules/sales/index.js';
import { cancelHttp, instantFastGateway, makeAttemptsDue, ticketStatuses } from '../helpers/cancellation.js';
import { resetDb } from '../helpers/db.js';
import { createEventHttp, editHttp, insertTickets, publishHttp } from '../helpers/events.js';
import { loginAs, ORG_A, ORG_B, PARTICIPANT } from '../helpers/http.js';
import { CARD } from '../helpers/sales.js';

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

const buy = (eventId: string, cardNumber: string) =>
  purchaseTicket({ eventId, channel: 'partner', buyerEmail: 'eval@example.com', cardNumber });

const page = (id: string, cookie = a) => app.inject({ url: `/organizer/events/${id}`, headers: { cookie } });

/**
 * Cenário dos passos 12–14 do brief: E3 publicado (lotação 5, R$ 50); T5 com 0003 (fica pendente),
 * T6 com 0001 (confirmado). Devolve os ids.
 */
async function scenarioE3() {
  const e3 = await createEventHttp(app, a, { name: 'E3', capacity: '5', price: '50,00' });
  expect((await publishHttp(app, a, e3)).statusCode).toBe(302);
  const t5 = await buy(e3, CARD.approvedSlow);
  const t6 = await buy(e3, CARD.approvedFast);
  if (!t5.ok || !t6.ok) throw new Error('compra falhou');
  await processDuePayments();
  expect((await getTicket(t6.ticket.id))!.status).toBe('confirmed');
  expect((await getTicket(t5.ticket.id))!.status).toBe('pending');
  return { e3, t5: t5.ticket.id, t6: t6.ticket.id };
}

describe('F07 — cancelamento pela página de gestão (R11)', () => {
  it('C1/AC-F07-1/CX-F04-F07: cancelar evento publicado responde 302 e a página mostra "Evento cancelado"', async () => {
    const { e3 } = await scenarioE3();
    const res = await cancelHttp(app, a, e3);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`/organizer/events/${e3}?cancelled=1`);
    const event = (await getEvent(e3))!;
    expect(event.status).toBe('cancelled');
    expect(event.cancelledAt).toBeInstanceOf(Date);

    const after = await app.inject({ url: res.headers.location as string, headers: { cookie: a } });
    expect(after.statusCode).toBe(200);
    expect(after.body).toContain('Evento cancelado');
    expect(after.body).toContain('data-status="cancelled"');
  });

  it('C2/AC-F07-2/CX-F04-F07: na mesma transação, confirmado vira estornado e pendente vira cancelado', async () => {
    const { e3, t5, t6 } = await scenarioE3();
    const declined = await buy(e3, CARD.declinedFast);
    await processDuePayments();
    const started = Date.now();
    expect((await cancelHttp(app, a, e3)).statusCode).toBe(302);
    expect((await getTicket(t6))!.status).toBe('refunded');
    expect((await getTicket(t5))!.status).toBe('cancelled');
    expect(Date.now() - started).toBeLessThan(10_000);
    // Recusado não muda (não é transição válida).
    if (declined.ok) expect((await getTicket(declined.ticket.id))!.status).toBe('declined');
    // Cancelado tem 0 vagas (R05).
    expect((await getSeatStats(e3))!.available).toBe(0);
  });

  it('C3/AC-F07-3/CX-F04-F07: resposta tardia do gateway (0003 aprovado) não muda T5 nem T6', async () => {
    const { e3, t5, t6 } = await scenarioE3();
    await cancelHttp(app, a, e3);
    await makeAttemptsDue([t5]); // "passaram 45 s": a resposta aprovada de T5 chega agora
    expect(await processDuePayments()).toBe(1);
    expect((await getTicket(t5))!.status).toBe('cancelled');
    expect((await getTicket(t6))!.status).toBe('refunded');
    const { rows } = await getPool().query('SELECT processed_at, applied FROM payment_attempts WHERE ticket_id = $1', [
      t5,
    ]);
    expect(rows[0].processed_at).not.toBeNull();
    expect(rows[0].applied).toBe(false);
  });

  it('C3/AC-F07-3: applyGatewayResult depois do cancelamento é no-op', async () => {
    const { e3, t5, t6 } = await scenarioE3();
    await cancelHttp(app, a, e3);
    expect(await applyGatewayResult(t5, 'approved')).toBe(false);
    expect(await applyGatewayResult(t6, 'declined')).toBe(false);
    expect(await ticketStatuses(e3)).toEqual({ [t5]: 'cancelled', [t6]: 'refunded' });
  });
});

describe('F07 — efeitos em outras features (CX-F02-F07)', () => {
  it('C4/CX-F02-F07: evento cancelado some de listSellableEvents (vitrine e API) e da página inicial', async () => {
    const { e3 } = await scenarioE3();
    expect((await listSellableEvents()).map((e) => e.id)).toContain(e3);
    await cancelHttp(app, a, e3);
    expect((await listSellableEvents()).map((e) => e.id)).not.toContain(e3);
    const home = await app.inject({ url: '/' });
    expect(home.body).not.toContain(e3);
  });

  it('C5/CX-F02-F07: compra em evento cancelado -> event_not_available, sem criar ingresso', async () => {
    const { e3 } = await scenarioE3();
    await cancelHttp(app, a, e3);
    const before = Object.keys(await ticketStatuses(e3)).length;
    expect(await buy(e3, CARD.approvedFast)).toEqual({ ok: false, error: 'event_not_available' });
    expect(Object.keys(await ticketStatuses(e3)).length).toBe(before);
  });
});

describe('F07 — irreversibilidade e bloqueios (AC-F07-1, AC-F07-4, AC-F07-5)', () => {
  it('C6/AC-F07-4: página de cancelado não tem formulário de edição nem botões; edição e publicação rejeitadas', async () => {
    const { e3 } = await scenarioE3();
    await cancelHttp(app, a, e3);
    const before = await getEvent(e3);

    const view = await page(e3);
    expect(view.statusCode).toBe(200);
    expect(view.body).toContain('Evento cancelado');
    expect(view.body).not.toContain('id="event-form"');
    expect(view.body).not.toContain('id="publish-form"');
    expect(view.body).not.toContain('id="cancel-form"');

    const edit = await editHttp(app, a, e3, { name: 'Outro nome', capacity: '9', price: '10,00' });
    expect(edit.statusCode).toBe(409);
    expect(edit.body).toContain('Evento cancelado não pode ser editado.');

    const pub = await publishHttp(app, a, e3);
    expect(pub.statusCode).toBe(409);
    expect(pub.body).toContain('Evento cancelado não pode ser editado.');

    expect(await getEvent(e3)).toEqual(before);
  });

  it('C7/AC-F07-1: cancelar de novo é rejeitado e nada muda', async () => {
    const { e3 } = await scenarioE3();
    await cancelHttp(app, a, e3);
    const event = await getEvent(e3);
    const tickets = await ticketStatuses(e3);

    const again = await cancelHttp(app, a, e3);
    expect(again.statusCode).toBe(409);
    expect(again.body).toContain('Este evento já foi cancelado.');
    expect(await getEvent(e3)).toEqual(event);
    expect(await ticketStatuses(e3)).toEqual(tickets);
    await expect(cancelEvent(ORG_A_ID, e3)).rejects.toMatchObject({ code: 'not_cancellable' });
  });

  it('C8/AC-F07-5: rascunho não pode ser cancelado e continua rascunho', async () => {
    const e9 = await createEventHttp(app, a, { name: 'E9' });
    expect((await page(e9)).body).not.toContain('id="cancel-form"');
    const res = await cancelHttp(app, a, e9);
    expect(res.statusCode).toBe(409);
    expect(res.body).toContain('Só eventos publicados podem ser cancelados.');
    const event = (await getEvent(e9))!;
    expect(event.status).toBe('draft');
    expect(event.cancelledAt).toBeNull();
    await expect(cancelEvent(ORG_A_ID, e9)).rejects.toBeInstanceOf(CancellationError);
  });

  it('C9/AC-F07-1: organizador B recebe 404 genérico ao cancelar evento de A; evento intacto', async () => {
    const { e3, t5, t6 } = await scenarioE3();
    const res = await cancelHttp(app, b, e3);
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('Evento não encontrado.');
    expect(res.body).not.toContain('E3');
    expect((await getEvent(e3))!.status).toBe('published');
    expect(await ticketStatuses(e3)).toEqual({ [t5]: 'pending', [t6]: 'confirmed' });

    // Mesmo 404 para id inexistente.
    const missing = await cancelHttp(app, b, 'evt_inexistente');
    expect(missing.statusCode).toBe(404);
    await expect(cancelEvent('usr_seed_org_b', e3)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('C9: participante recebe 403 e visitante é levado ao login; evento intacto', async () => {
    const { e3 } = await scenarioE3();
    expect((await cancelHttp(app, p, e3)).statusCode).toBe(403);
    const anon = await app.inject({ method: 'POST', url: `/organizer/events/${e3}/cancel` });
    expect(anon.statusCode).toBe(302);
    expect(anon.headers.location).toBe('/login');
    expect((await getEvent(e3))!.status).toBe('published');
  });
});

describe('F07 — slot da página de gestão e serviço', () => {
  it('C1/AC-F07-1: evento publicado mostra o botão "Cancelar evento" com confirmação', async () => {
    const id = await createEventHttp(app, a);
    await publishHttp(app, a, id);
    const body = (await page(id)).body;
    expect(body).toContain('id="slot-cancel"');
    expect(body).toContain(`action="/organizer/events/${id}/cancel"`);
    expect(body).toContain('onsubmit="return confirm(');
    expect(body).toContain('Cancelar evento</button>');
  });

  it('C2/AC-F07-2: cancelEvent devolve as contagens e não toca recusados/estornados/cancelados existentes', async () => {
    const id = await createEventHttp(app, a, { capacity: '20' });
    await publishHttp(app, a, id);
    await insertTickets(id, 'confirmed', 3);
    await insertTickets(id, 'pending', 2);
    const declined = await insertTickets(id, 'declined', 1);
    expect(await cancelEvent(ORG_A_ID, id)).toEqual({ refunded: 3, cancelled: 2 });
    const statuses = Object.values(await ticketStatuses(id)).sort();
    expect(statuses).toEqual(['cancelled', 'cancelled', 'declined', 'refunded', 'refunded', 'refunded']);
    expect((await getTicket(declined[0]!))!.status).toBe('declined');
  });
});
