import type { FastifyInstance } from 'fastify';
import { form } from './http.js';

/** POST do formulário de check-in da página de gestão. */
export function checkinHttp(app: FastifyInstance, cookie: string | null, eventId: string, code: string) {
  const f = form({ code });
  return app.inject({
    method: 'POST',
    url: `/organizer/events/${eventId}/checkin`,
    payload: f.payload,
    headers: { ...f.headers, ...(cookie ? { cookie } : {}) },
  });
}

/** Mensagem exibida em `<p id="checkin-result">` (null se ausente). */
export function checkinResult(html: string): string | null {
  return /<p id="checkin-result">([^<]*)<\/p>/.exec(html)?.[1] ?? null;
}
