import type { FastifyInstance } from 'fastify';

/** Corpo de formulário url-encoded para app.inject (objeto seria serializado como JSON). */
export function form(data: Record<string, string>) {
  return {
    payload: new URLSearchParams(data).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  };
}

/** Faz login via formulário e devolve o cabeçalho Cookie para as próximas requisições. */
export async function loginAs(app: FastifyInstance, email: string, password = 'catraca123'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/login',
    ...form({ email, password }),
  });
  if (res.statusCode !== 302) throw new Error(`login falhou para ${email}: ${res.statusCode}`);
  const cookie = res.cookies.find((c) => c.name === 'sid');
  if (!cookie) throw new Error('cookie sid ausente');
  return `sid=${cookie.value}`;
}

export const ORG_A = 'org.a@catraca.dev';
export const ORG_B = 'org.b@catraca.dev';
export const PARTICIPANT = 'participante@catraca.dev';
