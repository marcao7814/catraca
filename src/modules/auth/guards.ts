import type { FastifyReply, FastifyRequest } from 'fastify';
import { render } from '../../lib/render.js';
import type { Role } from './types.js';

/**
 * preHandler de papel (R13).
 * Visitante -> 302 /login. Papel errado -> 403 com página genérica.
 */
export function requireRole(role: Role) {
  return async function guard(req: FastifyRequest, reply: FastifyReply) {
    if (!req.user) {
      const next = req.method === 'GET' ? `?next=${encodeURIComponent(req.url)}` : '';
      return reply.redirect(`/login${next}`, 302);
    }
    if (req.user.role !== role) {
      return render(req, reply.code(403), 'error.ejs', {
        title: 'Acesso negado',
        message: 'Você não tem permissão para acessar esta área.',
      });
    }
  };
}
