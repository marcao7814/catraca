import type { FastifyPluginAsync } from 'fastify';
import { requireApiKey } from './auth.js';

/**
 * API de parceiros (contrato fixo do brief, docs/tdr.md §4.2). Registrada encapsulada com
 * prefixo /api/partner: hook de chave, parser de corpo e tratamento de erro valem só aqui.
 */
export const partnerApiPlugin: FastifyPluginAsync = async (api) => {
  api.addHook('onRequest', requireApiKey);

  api.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'not_found' }));
};
