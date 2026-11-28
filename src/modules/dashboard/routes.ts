import type { FastifyInstance } from 'fastify';
import { formatBRL } from '../../lib/money.js';
import { managementSlots, type SlotContext } from '../events/index.js';
import { getDashboard, type Dashboard } from './dashboard.service.js';

/** Rótulos exatos de R12, na ordem de exibição, com a chave de evidência (`data-metric`). */
const METRICS: Array<{ label: string; metric: string; value: (d: Dashboard) => string }> = [
  { label: 'Confirmados', metric: 'confirmed', value: (d) => String(d.confirmed) },
  { label: 'Pendentes', metric: 'pending', value: (d) => String(d.pending) },
  { label: 'Check-ins', metric: 'checkins', value: (d) => String(d.checkins) },
  { label: 'Vagas disponíveis', metric: 'available', value: (d) => String(d.available) },
  { label: 'Receita', metric: 'revenue', value: (d) => formatBRL(d.revenueCents) },
  { label: 'Estornados', metric: 'refunded', value: (d) => String(d.refunded) },
];

/**
 * Slot `dashboard` da página de gestão (P-F08-2). A página só chama os slots depois de
 * `withOwnedEvent`/`loadOwnedEvent` (R13): outro organizador recebe 404 sem nenhum número.
 */
export async function renderDashboardSlot({ event }: SlotContext): Promise<string> {
  const d = await getDashboard(event.id);
  if (!d) return '';
  const items = METRICS.map(
    (m) => `<dt>${m.label}</dt><dd data-metric="${m.metric}">${m.value(d)}</dd>`,
  ).join('');
  return `<h2>Painel</h2><dl id="dashboard">${items}</dl>`;
}

export async function dashboardRoutes(_app: FastifyInstance): Promise<void> {
  managementSlots.register('dashboard', renderDashboardSlot);
}
