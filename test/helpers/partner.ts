import type { FastifyInstance } from 'fastify';

/** Chave de parceiro documentada no README (padrão de config.partnerApiKey). */
export const KEY = 'catraca-partner-dev-key';

export const auth = (key: string = KEY) => ({ 'x-api-key': key });

/** POST de compra via app.inject com corpo JSON (string crua, para poder testar JSON malformado). */
export function buyInject(
  app: FastifyInstance,
  eventId: string,
  body: unknown,
  opts: { key?: string | null; contentType?: string | null; raw?: boolean } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.key !== null) headers['x-api-key'] = opts.key ?? KEY;
  if (opts.contentType !== null) headers['content-type'] = opts.contentType ?? 'application/json';
  return app.inject({
    method: 'POST',
    url: `/api/partner/events/${eventId}/purchases`,
    headers,
    payload: opts.raw ? (body as string) : JSON.stringify(body),
  });
}

/** Mesmo POST por HTTP real (fetch), contra um servidor ouvindo em `base`. */
export async function buyFetch(base: string, eventId: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${base}/api/partner/events/${eventId}/purchases`, {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

export async function getJson(base: string, path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${base}${path}`, { headers: { 'x-api-key': KEY } });
  return { status: res.status, body: await res.json() };
}

/** Conta respostas por status: { 202: 5, 409: 25 }. */
export function countStatuses(statuses: number[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const s of statuses) out[s] = (out[s] ?? 0) + 1;
  return out;
}
