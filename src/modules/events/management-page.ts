import type { FastifyReply, FastifyRequest } from 'fastify';
import { toLocalInput } from '../../lib/dates.js';
import { render } from '../../lib/render.js';
import { managementSlots } from './management-slots.js';
import { STATUS_LABEL, type Event, type EventFormValues } from './types.js';
import type { FieldErrors } from './validation.js';

export interface ManagementPageOptions {
  notice?: string | null;
  error?: string | null;
  fieldErrors?: FieldErrors;
  values?: EventFormValues;
  slotData?: Record<string, unknown>;
}

export function eventToFormValues(e: Event): EventFormValues {
  return {
    name: e.name,
    startsAt: toLocalInput(e.startsAt),
    venue: e.venue,
    capacity: String(e.capacity),
    price: (e.priceCents / 100).toFixed(2).replace('.', ','),
  };
}

/**
 * Renderiza a página de gestão de um evento já carregado com posse verificada (R04, R13).
 * Exportada para que F06/F07 respondam suas ações renderizando a mesma página.
 */
export async function renderManagementPage(
  req: FastifyRequest,
  reply: FastifyReply,
  event: Event,
  opts: ManagementPageOptions = {},
) {
  const slots = await managementSlots.renderAll({ req, event, slotData: opts.slotData ?? {} });
  return render(req, reply, 'organizer/manage.ejs', {
    title: event.name,
    event,
    statusLabel: STATUS_LABEL[event.status],
    values: opts.values ?? eventToFormValues(event),
    fieldErrors: opts.fieldErrors ?? {},
    notice: opts.notice ?? null,
    error: opts.error ?? null,
    slots,
  });
}
