import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { closePool, getPool } from '../../src/db/pool.js';
import { getGateway, purchaseTicket, setGateway, startGatewayWorker, type PaymentGateway } from '../../src/modules/sales/index.js';
import { resetDb } from '../helpers/db.js';
import { createEventHttp, publishHttp } from '../helpers/events.js';
import { form, loginAs, ORG_A, PARTICIPANT } from '../helpers/http.js';
import { CARD, insertEvent, overbookedEvents, waitFor } from '../helpers/sales.js';
import { CARD_FORM_MARK, purchaseHttp, signupAs, signupHttp, uniqueEmail } from '../helpers/storefront.js';

const SOLD_OUT = 'Ingressos esgotados';
const CODE_RE = /<code>([A-HJ-NP-Z2-9]{8})<\/code>/;

let app: FastifyInstance;
let a: string;
const realGateway = getGateway();
let stopWorker: (() => Promise<void>) | null = null;

/** Gateway que não responde dentro do teste (ingresso fica pendente). */
const neverGateway: PaymentGateway = { authorize: (card) => ({ ...realGateway.authorize(card), delayMs: 3_600_000 }) };

beforeAll(async () => {
  app = await buildApp();
});
beforeEach(async () => {
  await resetDb();
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

const get = (url: string, cookie?: string) => app.inject({ url, headers: cookie ? { cookie } : {} });
const countTickets = async (eventId: string) =>
  (await getPool().query<{ n: number }>('SELECT count(*)::int AS n FROM tickets WHERE event_id = $1', [eventId])).rows[0]!
    .n;

describe('F03 — vitrine (R02)', () => {
  it('C1/CX-F02-F03: evento em rascunho não aparece na vitrine', async () => {
    const id = await createEventHttp(app, a, { name: 'Show Rascunho E1' });
    const res = await get('/');
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('Show Rascunho E1');
    expect((await get(`/events/${id}`)).statusCode).toBe(404);
  });

  it('C2/CX-F02-F03: após publicar, aparece com nome, local, preço e vagas', async () => {
    const id = await createEventHttp(app, a, { name: 'Show Publicado E1', venue: 'Teatro Azul', capacity: '7' });
    expect((await publishHttp(app, a, id)).statusCode).toBe(302);
    const res = await get('/');
    expect(res.body).toContain('Show Publicado E1');
    expect(res.body).toContain('Teatro Azul');
    expect(res.body).toContain('R$');
    expect(res.body).toContain('<td>7</td>');
    expect(res.body).toContain(`/events/${id}`);
  });

  it('AC-F03-1: evento cancelado não aparece e sua página responde 404', async () => {
    const id = await insertEvent({ status: 'cancelled' });
    expect((await get('/')).body).not.toContain(id);
    expect((await get(`/events/${id}`)).statusCode).toBe(404);
  });
});

describe('F03 — cadastro, login e logout', () => {
  it('C3/AC-F03-2: cadastro cria participante, já loga e redireciona; Meus ingressos vazio', async () => {
    const email = uniqueEmail();
    const res = await signupHttp(app, { name: 'Nova', email: email.toUpperCase(), password: 'abc123', role: 'organizer' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/me/tickets');
    const sid = res.cookies.find((c) => c.name === 'sid');
    expect(sid).toBeDefined();
    const { rows } = await getPool().query('SELECT email, role FROM users WHERE email = $1', [email.toLowerCase()]);
    expect(rows).toEqual([{ email: email.toLowerCase(), role: 'participant' }]);
    const page = await get('/me/tickets', `sid=${sid!.value}`);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Meus ingressos');
    expect(page.body).toContain('Você ainda não tem ingressos.');
  });

  it('C4/AC-F03-2: e-mail duplicado (inclusive com maiúsculas) é rejeitado com 422', async () => {
    const email = uniqueEmail();
    expect((await signupHttp(app, { email })).statusCode).toBe(302);
    const dup = await signupHttp(app, { email: email.toUpperCase() });
    expect(dup.statusCode).toBe(422);
    expect(dup.body).toContain('e-mail já cadastrado');
    expect(dup.cookies.find((c) => c.name === 'sid')).toBeUndefined();
    const seedDup = await signupHttp(app, { email: PARTICIPANT });
    expect(seedDup.statusCode).toBe(422);
  });

  it('AC-F03-2: senha curta, e-mail inválido e nome vazio são rejeitados', async () => {
    for (const data of [{ password: '12345' }, { email: 'x@' }, { name: '  ' }]) {
      const res = await signupHttp(app, data);
      expect(res.statusCode).toBe(422);
    }
    const { rows } = await getPool().query("SELECT count(*)::int AS n FROM users WHERE role = 'participant'");
    expect(rows[0].n).toBe(1); // só o da seed
  });

  it('C5/AC-F03-2: logout encerra a sessão; Meus ingressos volta para o login; novo login funciona', async () => {
    const email = uniqueEmail();
    const n = await signupAs(app, email);
    const out = await app.inject({ method: 'POST', url: '/logout', headers: { cookie: n } });
    expect(out.statusCode).toBe(302);
    const after = await get('/me/tickets', n);
    expect(after.statusCode).toBe(302);
    expect(after.headers.location).toMatch(/^\/login/);
    const again = await loginAs(app, email, 'segredo1');
    expect((await get('/me/tickets', again)).statusCode).toBe(200);
  });
});

describe('F03 — compra pela vitrine (R06, R07, R09)', () => {
  it('C6/AC-F03-3: visitante vê o evento sem formulário de cartão e com link para login; POST leva ao login', async () => {
    const id = await insertEvent();
    const page = await get(`/events/${id}`);
    expect(page.statusCode).toBe(200);
    expect(page.body).not.toContain(CARD_FORM_MARK);
    expect(page.body).toContain('Entre para comprar');
    expect(page.body).toContain(`/login?next=${encodeURIComponent(`/events/${id}`)}`);
    const post = await purchaseHttp(app, null, id, CARD.approvedFast);
    expect(post.statusCode).toBe(302);
    expect(post.headers.location).toMatch(/^\/login/);
    expect(await countTickets(id)).toBe(0);
  });

  it('C7/CX-F04-F03: compra aparece pendente com código e depois confirmada com o mesmo código', async () => {
    const id = await insertEvent({ capacity: 3 });
    const n = await signupAs(app);
    const form1 = await get(`/events/${id}`, n);
    expect(form1.body).toContain(CARD_FORM_MARK);

    const res = await purchaseHttp(app, n, id, '4000 0000 0000 0001'); // espaços são removidos
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/me/tickets');

    const first = await get('/me/tickets', n);
    expect(first.body).toContain(`Evento ${id}`);
    expect(first.body).toContain('pendente');
    const code = CODE_RE.exec(first.body)?.[1];
    expect(code).toBeDefined();

    const { rows } = await getPool().query('SELECT channel, buyer_user_id, code FROM tickets WHERE event_id = $1', [id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].channel).toBe('storefront');
    expect(rows[0].code).toBe(code);

    stopWorker = startGatewayWorker(10);
    const second = await waitFor(async () => {
      const p = await get('/me/tickets', n);
      return p.body.includes('confirmado') ? p : null;
    });
    expect(second.body).not.toContain('pendente');
    expect(CODE_RE.exec(second.body)?.[1]).toBe(code);
  });

  it('C7/AC-F03-5: rótulos em português para recusado e estornado', async () => {
    const id = await insertEvent({ capacity: 3 });
    const n = await signupAs(app);
    await purchaseHttp(app, n, id, CARD.declinedFast);
    stopWorker = startGatewayWorker(10);
    await waitFor(async () => ((await get('/me/tickets', n)).body.includes('recusado') ? true : null));
    await purchaseHttp(app, n, id, CARD.approvedFast);
    await waitFor(async () => ((await get('/me/tickets', n)).body.includes('confirmado') ? true : null));
    await getPool().query("UPDATE tickets SET status = 'refunded' WHERE event_id = $1 AND status = 'confirmed'", [id]);
    const page = await get('/me/tickets', n);
    expect(page.body).toContain('recusado');
    expect(page.body).toContain('estornado');
  });

  it('AC-F03-3: cartão inválido mostra a mensagem no formulário (422) e não cria ingresso', async () => {
    const id = await insertEvent();
    const n = await signupAs(app);
    for (const card of ['123', '40000000000000011', '4000a00000000001', '']) {
      const res = await purchaseHttp(app, n, id, card);
      expect(res.statusCode).toBe(422);
      expect(res.body).toContain('Número de cartão inválido (16 dígitos)');
      expect(res.body).toContain(CARD_FORM_MARK);
    }
    expect(await countTickets(id)).toBe(0);
  });

  it('AC-F03-3: compra em evento rascunho ou inexistente responde 404', async () => {
    const draft = await insertEvent({ status: 'draft' });
    const n = await signupAs(app);
    expect((await purchaseHttp(app, n, draft, CARD.approvedFast)).statusCode).toBe(404);
    expect((await purchaseHttp(app, n, 'evt_naoexiste', CARD.approvedFast)).statusCode).toBe(404);
    expect(await countTickets(draft)).toBe(0);
  });

  it('C8/CX-F04-F03b: evento esgotado por compra de parceiro mostra "Ingressos esgotados" sem formulário', async () => {
    setGateway(neverGateway);
    const id = await insertEvent({ capacity: 1 });
    const n = await signupAs(app);
    const r = await purchaseTicket({ eventId: id, channel: 'partner', buyerEmail: 'api@example.com', cardNumber: CARD.approvedSlow });
    expect(r.ok).toBe(true);
    for (const cookie of [n, undefined]) {
      const page = await get(`/events/${id}`, cookie);
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain(SOLD_OUT);
      expect(page.body).not.toContain(CARD_FORM_MARK);
      expect(page.body).not.toContain('Entre para comprar');
    }
    expect((await get('/')).body).toContain(SOLD_OUT);
    const late = await purchaseHttp(app, n, id, CARD.approvedFast);
    expect(late.statusCode).toBe(409);
    expect(late.body).toContain(SOLD_OUT);
  });

  it('C9/AC-F03-4: duas compras quase simultâneas na lotação 1 — a perdedora recebe "Ingressos esgotados"', async () => {
    setGateway(neverGateway);
    for (let round = 0; round < 5; round++) {
      const id = await insertEvent({ capacity: 1 });
      const [n1, n2] = await Promise.all([signupAs(app), signupAs(app)]);
      const results = await Promise.all([
        purchaseHttp(app, n1, id, CARD.approvedFast),
        purchaseHttp(app, n2, id, CARD.approvedFast),
      ]);
      const codes = results.map((r) => r.statusCode).sort();
      expect(codes).toEqual([302, 409]);
      const loser = results.find((r) => r.statusCode === 409)!;
      expect(loser.body).toContain(SOLD_OUT);
      expect(loser.body).not.toContain(CARD_FORM_MARK);
      expect(await countTickets(id)).toBe(1);
    }
    expect(await overbookedEvents()).toEqual([]);
  });

  it('C10/AC-F03-5: Meus ingressos lista só os ingressos do usuário logado', async () => {
    const id = await insertEvent({ capacity: 5 });
    const n = await signupAs(app);
    await purchaseHttp(app, n, id, CARD.approvedFast);
    const nPage = await get('/me/tickets', n);
    const code = CODE_RE.exec(nPage.body)?.[1];
    expect(code).toBeDefined();
    const p = await loginAs(app, PARTICIPANT);
    const pPage = await get('/me/tickets', p);
    expect(pPage.statusCode).toBe(200);
    expect(pPage.body).not.toContain(code!);
    expect(pPage.body).not.toContain(`Evento ${id}`);
  });
});

describe('F03 — acesso por papel (R13)', () => {
  it('C11/CX-F01-F03: participante da seed entra pela tela de login, vê Meus ingressos e não acessa /organizer/events', async () => {
    const login = await app.inject({ method: 'POST', url: '/login', ...form({ email: PARTICIPANT, password: 'catraca123' }) });
    expect(login.statusCode).toBe(302);
    expect(login.headers.location).toBe('/');
    const p = `sid=${login.cookies.find((c) => c.name === 'sid')!.value}`;
    const home = await get('/', p);
    expect(home.body).toContain('href="/me/tickets"');
    expect((await get('/me/tickets', p)).statusCode).toBe(200);
    expect((await get('/organizer/events', p)).statusCode).toBe(403);
  });

  it('AC-F03-5: organizador não acessa Meus ingressos nem compra pela vitrine (403)', async () => {
    const id = await insertEvent();
    expect((await get('/me/tickets', a)).statusCode).toBe(403);
    expect((await purchaseHttp(app, a, id, CARD.approvedFast)).statusCode).toBe(403);
    expect((await get(`/events/${id}`, a)).body).not.toContain(CARD_FORM_MARK);
    expect(await countTickets(id)).toBe(0);
  });

  it('cadastro com usuário já logado redireciona para a vitrine', async () => {
    const n = await signupAs(app);
    const res = await get('/signup', n);
    expect(res.statusCode).toBe(302);
    expect((await get('/signup')).statusCode).toBe(200);
  });
});
