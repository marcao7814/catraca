import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { toIsoOffset } from '../../lib/dates.js';
import { listSellableEvents } from '../events/index.js';
import { CARD_RE, EMAIL_RE, getSeatStats, getTicket, purchaseTicket, type PurchaseError } from '../sales/index.js';
import { requireApiKey } from './auth.js';

/** Marca de corpo que não pôde ser lido como JSON (vira 422, nunca 400). */
const INVALID_BODY = Symbol('invalid_body');

const PURCHASE_ERROR_STATUS: Record<PurchaseError, number> = {
  invalid_request: 422,
  event_not_available: 404,
  sold_out: 409,
};

// IDs do domínio são `evt_`/`tkt_` + base32; qualquer coisa fora disso (ex.: byte nulo,
// que o Postgres rejeita) é tratada como inexistente sem ir ao banco.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const isJsonContentType = (ct: string | undefined) =>
  typeof ct === 'string' && /^application\/json\s*(;|$)/i.test(ct.trim());

interface PurchaseBody {
  buyerEmail: string;
  cardNumber: string;
}

function readPurchaseBody(req: FastifyRequest): PurchaseBody | null {
  if (!isJsonContentType(req.headers['content-type'])) return null;
  const body = req.body as unknown;
  if (body === INVALID_BODY || typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const { buyerEmail, cardNumber } = body as Record<string, unknown>;
  if (typeof buyerEmail !== 'string' || typeof cardNumber !== 'string') return null;
  // Mesmas regras do motor de vendas (que normaliza o e-mail antes de validar).
  if (!EMAIL_RE.test(buyerEmail.trim().toLowerCase()) || !CARD_RE.test(cardNumber)) return null;
  return { buyerEmail, cardNumber };
}

const sendError = (reply: FastifyReply, status: number, error: string) => reply.code(status).send({ error });

/**
 * API de parceiros (contrato fixo do brief, docs/tdr.md §4.2). Registrada encapsulada com
 * prefixo /api/partner: hook de chave, parser de corpo e tratamento de erro valem só aqui.
 */
export const partnerApiPlugin: FastifyPluginAsync = async (api) => {
  // 1º: chave (onRequest roda antes do parsing do corpo).
  api.addHook('onRequest', requireApiKey);

  // Parser tolerante: qualquer corpo é lido como texto e JSON inválido vira uma marca,
  // tratada como invalid_request na rota (o parser padrão responderia 400).
  api.removeAllContentTypeParsers();
  api.addContentTypeParser('*', { parseAs: 'string', bodyLimit: 16 * 1024 }, (_req, body, done) => {
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(null, INVALID_BODY);
    }
  });

  api.get('/events', async () => {
    const events = await listSellableEvents();
    return Promise.all(
      events.map(async (e) => ({
        id: e.id,
        name: e.name,
        startsAt: toIsoOffset(e.startsAt),
        priceCents: e.priceCents,
        availableSeats: (await getSeatStats(e.id))?.available ?? 0,
      })),
    );
  });

  api.post<{ Params: { eventId: string } }>('/events/:eventId/purchases', async (req, reply) => {
    // Ordem do contrato: corpo inválido (422) → evento indisponível (404) → sem vaga (409).
    const body = readPurchaseBody(req);
    if (!body) return sendError(reply, 422, 'invalid_request');
    const { eventId } = req.params;
    if (!ID_RE.test(eventId)) return sendError(reply, 404, 'event_not_available');
    const result = await purchaseTicket({ eventId, channel: 'partner', ...body });
    if (!result.ok) return sendError(reply, PURCHASE_ERROR_STATUS[result.error], result.error);
    req.log.info({ eventId, ticketId: result.ticket.id, channel: 'partner' }, 'compra via API de parceiros');
    return reply.code(202).send({ ticketId: result.ticket.id, code: result.ticket.code, status: result.ticket.status });
  });

  api.get<{ Params: { ticketId: string } }>('/tickets/:ticketId', async (req, reply) => {
    const { ticketId } = req.params;
    const ticket = ID_RE.test(ticketId) ? await getTicket(ticketId) : null;
    if (!ticket) return sendError(reply, 404, 'ticket_not_found');
    return {
      ticketId: ticket.id,
      code: ticket.code,
      eventId: ticket.eventId,
      status: ticket.status,
      checkedIn: ticket.checkedInAt !== null,
    };
  });

  // Parâmetro acima de maxParamLength (100) não casa com a rota: responde como a rota
  // responderia a um id inexistente, mantendo a ordem dos erros.
  api.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0] ?? '';
    if (req.method === 'POST' && /^\/api\/partner\/events\/[^/]+\/purchases$/.test(path)) {
      return readPurchaseBody(req)
        ? sendError(reply, 404, 'event_not_available')
        : sendError(reply, 422, 'invalid_request');
    }
    if (req.method === 'GET' && /^\/api\/partner\/tickets\/[^/]+$/.test(path)) {
      return sendError(reply, 404, 'ticket_not_found');
    }
    return sendError(reply, 404, 'not_found');
  });

  // Erros do próprio Fastify ao ler o corpo (tamanho, content-type...) são corpo inválido;
  // o resto é falha interna. Sempre JSON, nunca o tratador global em HTML.
  api.setErrorHandler((err: { statusCode?: number }, req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 400 && status < 500) return sendError(reply, 422, 'invalid_request');
    req.log.error(err);
    return sendError(reply, 500, 'internal_error');
  });
};
