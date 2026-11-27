import { describe, expect, it } from 'vitest';
import { newId, newTicketCode, normalizeTicketCode } from '../../src/lib/ids.js';

describe('ids e códigos', () => {
  it('newId tem prefixo e 12 caracteres base32', () => {
    expect(newId('evt')).toMatch(/^evt_[a-z2-7]{12}$/);
    expect(newId('tkt')).toMatch(/^tkt_[a-z2-7]{12}$/);
  });

  it('códigos de ingresso: 8 caracteres sem ambíguos e praticamente sem colisão', () => {
    const codes = new Set(Array.from({ length: 5000 }, () => newTicketCode()));
    expect(codes.size).toBe(5000);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it('normaliza entrada do check-in', () => {
    expect(normalizeTicketCode('  k7q2m9xa ')).toBe('K7Q2M9XA');
  });
});
