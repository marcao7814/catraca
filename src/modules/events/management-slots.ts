// Áreas (slots) da página de gestão do evento (R04).
// F02 renderiza a página; F06 (check-in), F07 (cancelamento) e F08 (painel) registram seus blocos
// aqui, cada um no próprio módulo. Isso evita que as features da mesma wave editem a mesma view.
import type { FastifyRequest } from 'fastify';
import type { Event } from './types.js';

export type SlotName = 'dashboard' | 'checkin' | 'cancel';

/** Ordem de exibição na página. */
export const SLOT_ORDER: SlotName[] = ['dashboard', 'checkin', 'cancel'];

export interface SlotContext {
  req: FastifyRequest;
  event: Event;
  /** Dados de resultado de uma ação do próprio slot (ex.: mensagem do check-in). */
  slotData: Record<string, unknown>;
}

export type SlotRenderer = (ctx: SlotContext) => Promise<string>;

const registry = new Map<SlotName, SlotRenderer>();

export const managementSlots = {
  register(name: SlotName, render: SlotRenderer): void {
    registry.set(name, render);
  },
  async renderAll(ctx: SlotContext): Promise<Array<{ name: SlotName; html: string }>> {
    const out: Array<{ name: SlotName; html: string }> = [];
    for (const name of SLOT_ORDER) {
      const render = registry.get(name);
      if (render) out.push({ name, html: await render(ctx) });
    }
    return out;
  },
};
