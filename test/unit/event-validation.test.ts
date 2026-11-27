import { describe, expect, it } from 'vitest';
import { validateEventForm } from '../../src/modules/events/validation.js';

const NOW = new Date('2026-11-27T12:00:00-03:00');
const base = { name: 'Show', startsAt: '2026-12-05T21:00', venue: 'Bar', capacity: '2', price: '100,00' };

describe('validação de evento (R01)', () => {
  it('aceita dados válidos e converte preço para centavos e data para -03:00', () => {
    const r = validateEventForm(base, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.priceCents).toBe(10000);
      expect(r.value.capacity).toBe(2);
      expect(r.value.startsAt.toISOString()).toBe('2026-12-06T00:00:00.000Z');
    }
  });

  it.each([
    ['data no passado', { startsAt: '2026-11-26T21:00' }, 'startsAt'],
    ['data agora', { startsAt: '2026-11-27T12:00' }, 'startsAt'],
    ['data inválida', { startsAt: 'amanhã' }, 'startsAt'],
    ['lotação 0', { capacity: '0' }, 'capacity'],
    ['lotação fracionária', { capacity: '1.5' }, 'capacity'],
    ['lotação negativa', { capacity: '-3' }, 'capacity'],
    ['lotação vazia', { capacity: '' }, 'capacity'],
    ['preço zero', { price: '0' }, 'price'],
    ['preço 0,00', { price: '0,00' }, 'price'],
    ['preço negativo', { price: '-10' }, 'price'],
    ['preço texto', { price: 'grátis' }, 'price'],
    ['nome vazio', { name: '   ' }, 'name'],
    ['local vazio', { venue: '' }, 'venue'],
  ])('rejeita %s', (_label, over, field) => {
    const r = validateEventForm({ ...base, ...over }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveProperty(field);
  });

  it('preserva os valores digitados para reexibir o formulário', () => {
    const r = validateEventForm({ ...base, capacity: 'abc' }, NOW);
    expect(r.values.capacity).toBe('abc');
  });
});
