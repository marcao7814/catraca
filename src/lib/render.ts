import type { FastifyReply, FastifyRequest } from 'fastify';
import { formatBRL } from './money.js';
import { formatDisplay } from './dates.js';

/** Renderiza uma view dentro do layout, sempre com o usuário da sessão e helpers de formatação. */
export function render(
  req: FastifyRequest,
  reply: FastifyReply,
  template: string,
  data: Record<string, unknown> & { title: string },
) {
  return reply.type('text/html; charset=utf-8').view(template, {
    user: req.user ?? null,
    formatBRL,
    formatDisplay,
    ...data,
  });
}
