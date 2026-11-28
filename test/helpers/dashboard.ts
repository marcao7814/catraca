import type { FastifyInstance } from 'fastify';

export type PanelValues = Record<'confirmed' | 'pending' | 'checkins' | 'available' | 'revenue' | 'refunded', string>;

/** Extrai os valores `data-metric` do HTML (equivalente ao `grep data-metric` do contrato). */
export function parsePanel(html: string): Partial<PanelValues> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/data-metric="([a-z]+)">([^<]*)</g)) out[m[1]!] = m[2]!;
  return out;
}

/** Texto visível do painel: pares "rótulo valor" na ordem da página. */
export function panelText(html: string): string[] {
  const dl = /<dl id="dashboard">([\s\S]*?)<\/dl>/.exec(html)?.[1] ?? '';
  return [...dl.matchAll(/<dt>([^<]*)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map((m) => `${m[1]} ${m[2]}`);
}

/** GET da página de gestão como organizador; devolve status, corpo e métricas. */
export async function panel(app: FastifyInstance, cookie: string, eventId: string) {
  const res = await app.inject({ url: `/organizer/events/${eventId}`, headers: { cookie } });
  return { status: res.statusCode, body: res.body, metrics: parsePanel(res.body), text: panelText(res.body) };
}

/** Os seis números esperados, no formato exibido. */
export function expected(v: {
  confirmed: number;
  pending: number;
  checkins: number;
  available: number;
  revenue: string;
  refunded: number;
}): PanelValues {
  return {
    confirmed: String(v.confirmed),
    pending: String(v.pending),
    checkins: String(v.checkins),
    available: String(v.available),
    revenue: v.revenue,
    refunded: String(v.refunded),
  };
}
