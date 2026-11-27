import { join } from 'node:path';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import view from '@fastify/view';
import ejs from 'ejs';
import Fastify, { type FastifyInstance } from 'fastify';
import { getPool } from './db/pool.js';
import { render } from './lib/render.js';
import './modules/auth/types.js';
import { authRoutes } from './modules/auth/routes.js';
import { eventsRoutes } from './modules/events/routes.js';
import { partnerApiPlugin } from './modules/partner-api/index.js';

export interface BuildAppOptions {
  logger?: boolean;
}

/**
 * Monta a aplicação. Os módulos de feature são chamados diretamente (sem encapsulamento
 * de plugin) para que hooks globais, como o carregamento da sessão, valham em todas as rotas.
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ? { redact: ['req.headers["x-api-key"]', 'req.headers.cookie'] } : false,
    trustProxy: false,
  });

  await app.register(cookie);
  await app.register(formbody);
  await app.register(view, {
    engine: { ejs },
    root: join(process.cwd(), 'views'),
    layout: 'layout.ejs',
  });

  // Proteção CSRF complementar ao SameSite=Lax: POST de formulário com Origin de outro host é recusado.
  app.addHook('onRequest', async (req, reply) => {
    if (req.method !== 'POST' || req.url.startsWith('/api/')) return;
    const origin = req.headers.origin;
    if (origin && origin !== 'null') {
      let host: string | null;
      try {
        host = new URL(origin).host;
      } catch {
        host = null;
      }
      if (host !== req.headers.host) return reply.code(403).send('Origem não permitida');
    }
  });

  app.get('/healthz', async (_req, reply) => {
    try {
      await getPool().query('SELECT 1');
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  await authRoutes(app);
  await eventsRoutes(app);
  await app.register(partnerApiPlugin, { prefix: '/api/partner' });

  // Vitrine provisória; F03 substitui.
  app.get('/', async (req, reply) => render(req, reply, 'home.ejs', { title: 'Catraca' }));

  app.setNotFoundHandler((req, reply) =>
    render(req, reply.code(404), 'error.ejs', { title: 'Não encontrado', message: 'Página não encontrada.' }),
  );

  app.setErrorHandler((err, req, reply) => {
    req.log.error(err);
    if (req.url.startsWith('/api/')) return reply.code(500).send({ error: 'internal_error' });
    return render(req, reply.code(500), 'error.ejs', { title: 'Erro', message: 'Erro inesperado.' });
  });

  return app;
}
