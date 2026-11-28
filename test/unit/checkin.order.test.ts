import { describe, expect, it } from 'vitest';
import { decideCheckin } from '../../src/modules/checkin/index.js';
import type { TicketStatus } from '../../src/modules/sales/index.js';

// C9/AC-F06-6: a ordem das verificações é exatamente a de R10. Cada caso abaixo satisfaz duas ou
// mais condições ao mesmo tempo; a primeira da lista do brief tem que vencer.
const used = new Date('2026-01-01T20:00:00Z');
const t = (status: TicketStatus, checkedInAt: Date | null = null) => ({ status, checkedInAt });

describe('F06 — ordem de R10 (decideCheckin)', () => {
  it('C9/AC-F06-6: as cinco mensagens exatas, uma condição por vez', () => {
    expect(decideCheckin(null, 'published')).toBe('Ingresso inválido para este evento');
    expect(decideCheckin(t('refunded'), 'cancelled')).toBe('Evento cancelado');
    expect(decideCheckin(t('pending'), 'published')).toBe('Ingresso não confirmado');
    expect(decideCheckin(t('confirmed', used), 'published')).toBe('Ingresso já utilizado');
    expect(decideCheckin(t('confirmed'), 'published')).toBe('Entrada liberada');
  });

  it('C9/AC-F06-6: inexistente/outro evento vence evento cancelado (1 antes de 2)', () => {
    expect(decideCheckin(null, 'cancelled')).toBe('Ingresso inválido para este evento');
  });

  it('C9/AC-F06-6: evento cancelado vence ingresso não confirmado (2 antes de 3)', () => {
    for (const status of ['pending', 'declined', 'cancelled', 'refunded'] as const) {
      expect(decideCheckin(t(status), 'cancelled')).toBe('Evento cancelado');
    }
  });

  it('C9/AC-F06-6: evento cancelado vence ingresso já utilizado (2 antes de 4)', () => {
    expect(decideCheckin(t('refunded', used), 'cancelled')).toBe('Evento cancelado');
    expect(decideCheckin(t('confirmed', used), 'cancelled')).toBe('Evento cancelado');
  });

  it('C9/AC-F06-6: evento cancelado vence ingresso confirmado sem check-in (2 antes de 5)', () => {
    expect(decideCheckin(t('confirmed'), 'cancelled')).toBe('Evento cancelado');
  });

  it('C9/AC-F06-6: não confirmado vence já utilizado (3 antes de 4)', () => {
    // Ingresso que passou pelo check-in e depois foi estornado (status deixou de ser confirmed).
    expect(decideCheckin(t('refunded', used), 'published')).toBe('Ingresso não confirmado');
  });

  it('C9/AC-F06-6: status do ingresso é checado também em evento rascunho', () => {
    expect(decideCheckin(t('pending'), 'draft')).toBe('Ingresso não confirmado');
    expect(decideCheckin(null, 'draft')).toBe('Ingresso inválido para este evento');
  });
});
