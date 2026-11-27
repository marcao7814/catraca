import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { closePool, getPool } from '../../src/db/pool.js';
import { getEvent, listSellableEvents } from '../../src/modules/events/index.js';
import { resetDb } from '../helpers/db.js';
import { createEventHttp, editHttp, eventForm, insertTickets, localInDays, publishHttp } from '../helpers/events.js';
import { form, loginAs, ORG_A, ORG_B, PARTICIPANT } from '../helpers/http.js';

let app: FastifyInstance;
let a: string;
let b: string;
let p: string;

beforeAll(async () => {
  app = await buildApp();
});
beforeEach(async () => {
  await resetDb();
  a = await loginAs(app, ORG_A);
  b = await loginAs(app, ORG_B);
  p = await loginAs(app, PARTICIPANT);
});
afterAll(async () => {
  await app.close();
  await closePool();
});

const countEvents = async () => (await getPool().query<{ n: number }>('SELECT count(*) AS n FROM events')).rows[0]!.n;

describe('F02 — criação (R01, R02)', () => {
  it('C1/AC-F02-1: cria evento em rascunho e redireciona para a página de gestão', async () => {
    const id = await createEventHttp(app, a, { name: 'E1' });
    const event = await getEvent(id);
    expect(event).toMatchObject({ name: 'E1', status: 'draft', capacity: 2, priceCents: 10000 });
    const page = await app.inject({ url: `/organizer/events/${id}`, headers: { cookie: a } });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Rascunho');
  });

  it('C2/AC-F02-2: data de ontem é rejeitada e nada é criado', async () => {
    const f = form(eventForm({ startsAt: localInDays(-1) }));
    const res = await app.inject({
      method: 'POST',
      url: '/organizer/events/new',
      payload: f.payload,
      headers: { ...f.headers, cookie: a },
    });
    expect(res.statusCode).toBe(422);
    expect(res.body).toContain('A data de início precisa estar no futuro.');
    expect(await countEvents()).toBe(0);
  });

  it.each([
    ['lotação 0', { capacity: '0' }],
    ['lotação 1.5', { capacity: '1.5' }],
    ['preço 0', { price: '0' }],
  ])('C3/AC-F02-2: %s é rejeitado', async (_l, over) => {
    const f = form(eventForm(over));
    const res = await app.inject({
      method: 'POST',
      url: '/organizer/events/new',
      payload: f.payload,
      headers: { ...f.headers, cookie: a },
    });
    expect(res.statusCode).toBe(422);
    expect(await countEvents()).toBe(0);
  });

  it('nome com HTML é escapado (XSS)', async () => {
    const id = await createEventHttp(app, a, { name: '<script>alert(1)</script>' });
    const page = await app.inject({ url: `/organizer/events/${id}`, headers: { cookie: a } });
    expect(page.body).not.toContain('<script>alert(1)</script>');
    expect(page.body).toContain('&lt;script&gt;');
  });
});

describe('F02 — edição (R01, R03)', () => {
  it('C4/AC-F02-2: editar com data de ontem é rejeitado e a data original é mantida', async () => {
    const id = await createEventHttp(app, a);
    const before = await getEvent(id);
    const res = await editHttp(app, a, id, { startsAt: localInDays(-1) });
    expect(res.statusCode).toBe(422);
    expect(res.body).toContain('A data de início precisa estar no futuro.');
    expect((await getEvent(id))!.startsAt.getTime()).toBe(before!.startsAt.getTime());
  });

  it('C7/AC-F02-4: reduzir lotação abaixo das vagas ocupadas é rejeitado', async () => {
    const id = await createEventHttp(app, a, { capacity: '2' });
    await publishHttp(app, a, id);
    await insertTickets(id, 'pending', 1);
    await insertTickets(id, 'confirmed', 1);
    const res = await editHttp(app, a, id, { capacity: '1' });
    expect(res.statusCode).toBe(422);
    expect(res.body).toContain('A lotação não pode ser menor que as vagas ocupadas (2).');
    expect((await getEvent(id))!.capacity).toBe(2);
  });

  it('C7/AC-F02-4: ingressos recusados, cancelados e estornados não contam como ocupados', async () => {
    const id = await createEventHttp(app, a, { capacity: '3' });
    await publishHttp(app, a, id);
    await insertTickets(id, 'confirmed', 1);
    await insertTickets(id, 'declined', 2);
    const res = await editHttp(app, a, id, { capacity: '1' });
    expect(res.statusCode).toBe(302);
    expect((await getEvent(id))!.capacity).toBe(1);
  });

  it('C8/AC-F02-4: aumentar a lotação é aceito', async () => {
    const id = await createEventHttp(app, a, { capacity: '2' });
    await publishHttp(app, a, id);
    await insertTickets(id, 'confirmed', 2);
    const res = await editHttp(app, a, id, { capacity: '3' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`/organizer/events/${id}?saved=1`);
    expect((await getEvent(id))!.capacity).toBe(3);
  });

  it('C9/AC-F02-5: mudar o preço não altera o preço pago de ingressos existentes', async () => {
    const id = await createEventHttp(app, a, { price: '100,00' });
    await publishHttp(app, a, id);
    const [t] = await insertTickets(id, 'confirmed', 1, 10000);
    const res = await editHttp(app, a, id, { price: '150,00' });
    expect(res.statusCode).toBe(302);
    expect((await getEvent(id))!.priceCents).toBe(15000);
    const { rows } = await getPool().query('SELECT price_paid_cents FROM tickets WHERE id = $1', [t]);
    expect(rows[0].price_paid_cents).toBe(10000);
  });

  it('evento cancelado não pode ser editado nem publicado', async () => {
    const id = await createEventHttp(app, a);
    await publishHttp(app, a, id);
    await getPool().query("UPDATE events SET status = 'cancelled', cancelled_at = now() WHERE id = $1", [id]);
    const edit = await editHttp(app, a, id, { name: 'Outro nome' });
    expect(edit.statusCode).toBe(409);
    expect((await getEvent(id))!.name).toBe('Jazz no Porão');
    const pub = await publishHttp(app, a, id);
    expect(pub.statusCode).toBe(409);
    const page = await app.inject({ url: `/organizer/events/${id}`, headers: { cookie: a } });
    expect(page.body).not.toContain('id="event-form"');
  });
});

describe('F02 — publicação e vitrine (R02)', () => {
  it('C5/C6/AC-F02-3: rascunho fora de listSellableEvents; publicado dentro', async () => {
    const id = await createEventHttp(app, a, { name: 'E1' });
    expect((await listSellableEvents()).map((e) => e.id)).not.toContain(id);
    const res = await publishHttp(app, a, id);
    expect(res.statusCode).toBe(302);
    expect((await getEvent(id))!.status).toBe('published');
    expect((await listSellableEvents()).map((e) => e.id)).toContain(id);
    const page = await app.inject({ url: `/organizer/events/${id}`, headers: { cookie: a } });
    expect(page.body).toContain('Publicado');
  });

  it('publicar duas vezes é rejeitado', async () => {
    const id = await createEventHttp(app, a);
    await publishHttp(app, a, id);
    expect((await publishHttp(app, a, id)).statusCode).toBe(409);
  });

  it('cancelado sai de listSellableEvents', async () => {
    const id = await createEventHttp(app, a);
    await publishHttp(app, a, id);
    await getPool().query("UPDATE events SET status = 'cancelled' WHERE id = $1", [id]);
    expect((await listSellableEvents()).map((e) => e.id)).not.toContain(id);
  });
});

describe('F02 — página de gestão e acesso (R04, R13)', () => {
  it('C10/AC-F02-6: cada evento tem página própria com formulário de edição', async () => {
    const id1 = await createEventHttp(app, a, { name: 'Primeiro' });
    const id2 = await createEventHttp(app, a, { name: 'Segundo' });
    const p1 = await app.inject({ url: `/organizer/events/${id1}`, headers: { cookie: a } });
    const p2 = await app.inject({ url: `/organizer/events/${id2}`, headers: { cookie: a } });
    expect(p1.body).toContain('Primeiro');
    expect(p1.body).toContain('id="event-form"');
    expect(p2.body).toContain('Segundo');
  });

  it('C11/AC-F02-7: a lista de B não mostra eventos de A', async () => {
    await createEventHttp(app, a, { name: 'Evento-de-A' });
    await createEventHttp(app, b, { name: 'Evento-de-B' });
    const listB = await app.inject({ url: '/organizer/events', headers: { cookie: b } });
    expect(listB.body).toContain('Evento-de-B');
    expect(listB.body).not.toContain('Evento-de-A');
    const listA = await app.inject({ url: '/organizer/events', headers: { cookie: a } });
    expect(listA.body).toContain('Evento-de-A');
    expect(listA.body).not.toContain('Evento-de-B');
  });

  it('C12/AC-F02-7: B abrindo a URL de E1 recebe 404 sem nenhum dado de E1', async () => {
    const id = await createEventHttp(app, a, {
      name: 'Nome-Secreto-E1',
      venue: 'Local-Secreto',
      capacity: '777',
      price: '123,45',
    });
    const res = await app.inject({ url: `/organizer/events/${id}`, headers: { cookie: b } });
    expect(res.statusCode).toBe(404);
    for (const secret of ['Nome-Secreto-E1', 'Local-Secreto', '777', '123,45']) expect(res.body).not.toContain(secret);
    // Indistinguível de um id inexistente.
    const missing = await app.inject({ url: '/organizer/events/evt_naoexiste0000', headers: { cookie: b } });
    expect(missing.statusCode).toBe(404);
    expect(res.body).toBe(missing.body);
  });

  it('C13/AC-F02-7: B não edita nem publica E1', async () => {
    const id = await createEventHttp(app, a, { name: 'E1' });
    expect((await editHttp(app, b, id, { name: 'Hackeado' })).statusCode).toBe(404);
    expect((await publishHttp(app, b, id)).statusCode).toBe(404);
    expect(await getEvent(id)).toMatchObject({ name: 'E1', status: 'draft' });
  });

  it('C14/CX-F01-F02: participante recebe 403 e visitante vai para o login em todas as rotas', async () => {
    const id = await createEventHttp(app, a);
    for (const url of ['/organizer/events', '/organizer/events/new', `/organizer/events/${id}`]) {
      expect((await app.inject({ url, headers: { cookie: p } })).statusCode).toBe(403);
      const anon = await app.inject({ url });
      expect(anon.statusCode).toBe(302);
      expect(anon.headers.location).toMatch(/^\/login/);
    }
    expect((await publishHttp(app, p, id)).statusCode).toBe(403);
    expect((await editHttp(app, p, id, { name: 'x' })).statusCode).toBe(403);
    expect(await getEvent(id)).toMatchObject({ status: 'draft', name: 'Jazz no Porão' });
  });
});
