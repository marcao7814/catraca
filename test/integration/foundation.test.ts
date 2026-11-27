import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { closePool, getPool } from '../../src/db/pool.js';
import { seed } from '../../src/seed/seed.js';
import { resetDb } from '../helpers/db.js';
import { form, loginAs, ORG_A, PARTICIPANT } from '../helpers/http.js';

let app: FastifyInstance;

beforeAll(async () => {
  await resetDb();
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
  await closePool();
});

describe('F01 — saúde e seed', () => {
  it('GET /healthz responde 200', async () => {
    const res = await app.inject('/healthz');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('seed é idempotente (AC-F01-5)', async () => {
    expect(await seed(getPool())).toBe(0);
    expect(await seed(getPool())).toBe(0);
    const { rows } = await getPool().query(
      "SELECT email, role FROM users WHERE email LIKE '%@catraca.dev' ORDER BY email",
    );
    expect(rows).toEqual([
      { email: 'org.a@catraca.dev', role: 'organizer' },
      { email: 'org.b@catraca.dev', role: 'organizer' },
      { email: 'participante@catraca.dev', role: 'participant' },
    ]);
  });
});

describe('F01 — autenticação', () => {
  it('organizador entra e é levado à área de organizador', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/login',
      ...form({ email: ORG_A, password: 'catraca123' }),
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/organizer/events');
    const sid = res.cookies.find((c) => c.name === 'sid');
    expect(sid?.httpOnly).toBe(true);
    expect(sid?.sameSite).toBe('Lax');
  });

  it('e-mail é case-insensitive no login', async () => {
    await expect(loginAs(app, 'ORG.B@Catraca.dev')).resolves.toMatch(/^sid=/);
  });

  it('senha errada ou e-mail inexistente -> 401 com mensagem genérica', async () => {
    for (const email of [ORG_A, 'ninguem@catraca.dev']) {
      const res = await app.inject({
        method: 'POST',
        url: '/login',
        ...form({ email, password: 'errada' }),
      });
      expect(res.statusCode).toBe(401);
      expect(res.body).toContain('E-mail ou senha inválidos.');
    }
  });

  it('logout invalida a sessão', async () => {
    const cookie = await loginAs(app, ORG_A);
    const out = await app.inject({ method: 'POST', url: '/logout', headers: { cookie } });
    expect(out.statusCode).toBe(302);
    const after = await app.inject({ url: '/organizer/events', headers: { cookie } });
    expect(after.statusCode).toBe(302);
    expect(after.headers.location).toMatch(/^\/login/);
  });

  it('next só aceita caminho interno (sem open redirect)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/login',
      ...form({ email: ORG_A, password: 'catraca123', next: '//evil.example.com' }),
    });
    expect(res.headers.location).toBe('/organizer/events');
  });

  it('POST de formulário com Origin de outro host é recusado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: new URLSearchParams({ email: ORG_A, password: 'catraca123' }).toString(),
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'http://evil.example.com',
        host: 'localhost:3000',
      },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('F01 — papéis na área de organizador (R13, AC-F01-8)', () => {
  it('visitante é redirecionado ao login', async () => {
    const res = await app.inject('/organizer/events');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/login?next=%2Forganizer%2Fevents');
  });

  it('participante recebe 403', async () => {
    const cookie = await loginAs(app, PARTICIPANT);
    const res = await app.inject({ url: '/organizer/events', headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  it('organizador acessa', async () => {
    const cookie = await loginAs(app, ORG_A);
    const res = await app.inject({ url: '/organizer/events', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Meus eventos');
  });
});

describe('F01 — esquema', () => {
  it('trigger rejeita transição de status fora da tabela (ADR-006)', async () => {
    const db = getPool();
    await db.query(
      `INSERT INTO events (id, organizer_id, name, starts_at, venue, capacity, price_cents, status)
       VALUES ('evt_schematest01', 'usr_seed_org_a', 'X', now() + interval '1 day', 'Y', 1, 100, 'published')`,
    );
    await db.query(
      `INSERT INTO tickets (id, event_id, code, channel, buyer_email, price_paid_cents, status)
       VALUES ('tkt_schematest01', 'evt_schematest01', 'ABCDEFGH', 'partner', 'a@b.co', 100, 'refunded')`,
    );
    await expect(
      db.query("UPDATE tickets SET status = 'confirmed' WHERE id = 'tkt_schematest01'"),
    ).rejects.toThrow(/transição de status inválida/);
  });
});
