import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config.js';

// Compara digests de tamanho fixo: timingSafeEqual exige buffers do mesmo tamanho e o
// hash evita vazar o comprimento da chave pelo tempo de resposta.
const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();

export function isValidApiKey(provided: unknown): boolean {
  if (typeof provided !== 'string' || provided === '') return false;
  return timingSafeEqual(digest(provided), digest(config.partnerApiKey));
}

/**
 * Hook onRequest do prefixo /api/partner (T4): roda antes de qualquer parsing do corpo,
 * inclusive em rota inexistente sob o prefixo.
 */
export async function requireApiKey(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!isValidApiKey(req.headers['x-api-key'])) {
    await reply.code(401).send({ error: 'unauthorized' });
  }
}
