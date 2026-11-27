import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import { getPool } from '../../db/pool.js';
import { render } from '../../lib/render.js';
import { createSession, deleteSession, getSessionUser, SESSION_COOKIE } from './sessions.js';
import type { Role } from './types.js';
import { verifyCredentials } from './users.js';

export function homeFor(role: Role): string {
  return role === 'organizer' ? '/organizer/events' : '/';
}

/** Aceita apenas caminhos relativos internos, para evitar open redirect. */
function safeNext(next: unknown): string | null {
  return typeof next === 'string' && /^\/(?!\/)[\w\-/?=&.%]*$/.test(next) ? next : null;
}

export function setSessionCookie(reply: import('fastify').FastifyReply, sessionId: string): void {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // ambiente local em http
    maxAge: config.sessionTtlHours * 3600,
  });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  // Carrega o usuário da sessão em toda requisição web.
  app.addHook('onRequest', async (req) => {
    const sid = req.cookies[SESSION_COOKIE];
    if (!sid) return;
    const user = await getSessionUser(getPool(), sid);
    if (user) {
      req.user = user;
      req.sessionId = sid;
    }
  });

  app.get('/login', async (req, reply) => {
    const { next } = req.query as { next?: string };
    if (req.user) return reply.redirect(homeFor(req.user.role), 302);
    return render(req, reply, 'login.ejs', { title: 'Entrar', error: null, email: '', next: safeNext(next) });
  });

  app.post('/login', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const next = safeNext(body.next);
    const user = email && password ? await verifyCredentials(getPool(), email, password) : null;
    if (!user) {
      return render(req, reply.code(401), 'login.ejs', {
        title: 'Entrar',
        error: 'E-mail ou senha inválidos.',
        email,
        next,
      });
    }
    const sid = await createSession(getPool(), user.id);
    setSessionCookie(reply, sid);
    return reply.redirect(next ?? homeFor(user.role), 302);
  });

  app.post('/logout', async (req, reply) => {
    if (req.sessionId) await deleteSession(getPool(), req.sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.redirect('/', 302);
  });
}
