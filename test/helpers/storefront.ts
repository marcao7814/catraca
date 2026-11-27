import type { FastifyInstance } from 'fastify';
import { form } from './http.js';

let seq = 0;

/** E-mail único por chamada (equivalente ao `novo+<ts>@ex.com` do contrato). */
export function uniqueEmail(prefix = 'novo'): string {
  seq += 1;
  return `${prefix}+${Date.now()}${seq}@ex.com`;
}

export async function signupHttp(
  app: FastifyInstance,
  data: { name?: string; email?: string; password?: string; [k: string]: string | undefined } = {},
) {
  const body = { name: 'Nova Pessoa', email: uniqueEmail(), password: 'segredo1', ...data } as Record<string, string>;
  return app.inject({ method: 'POST', url: '/signup', ...form(body) });
}

/** Cadastra um participante novo e devolve o cabeçalho Cookie da sessão aberta no cadastro. */
export async function signupAs(app: FastifyInstance, email = uniqueEmail()): Promise<string> {
  const res = await signupHttp(app, { email });
  if (res.statusCode !== 302) throw new Error(`cadastro falhou: ${res.statusCode} ${res.body.slice(0, 300)}`);
  const sid = res.cookies.find((c) => c.name === 'sid');
  if (!sid) throw new Error('cookie sid ausente após cadastro');
  return `sid=${sid.value}`;
}

export function purchaseHttp(app: FastifyInstance, cookie: string | null, eventId: string, cardNumber: string) {
  const f = form({ cardNumber });
  return app.inject({
    method: 'POST',
    url: `/events/${eventId}/purchase`,
    payload: f.payload,
    headers: { ...f.headers, ...(cookie ? { cookie } : {}) },
  });
}

/** Marca do formulário de cartão na página do evento. */
export const CARD_FORM_MARK = 'name="cardNumber"';
