import { describe, expect, it } from 'vitest';
import { formatDisplay, parseLocalDateTime, toIsoOffset, toLocalInput } from '../../src/lib/dates.js';

describe('datas em America/Sao_Paulo (-03:00)', () => {
  it('toIsoOffset formata com offset fixo', () => {
    expect(toIsoOffset(new Date('2026-12-06T00:00:00Z'))).toBe('2026-12-05T21:00:00-03:00');
  });

  it('parseLocalDateTime interpreta o valor como horário de Brasília', () => {
    expect(parseLocalDateTime('2026-12-05T21:00')?.toISOString()).toBe('2026-12-06T00:00:00.000Z');
  });

  it('parseLocalDateTime rejeita datas inválidas', () => {
    expect(parseLocalDateTime('2026-02-31T10:00')).toBeNull();
    expect(parseLocalDateTime('ontem')).toBeNull();
    expect(parseLocalDateTime('')).toBeNull();
  });

  it('ida e volta com o input datetime-local', () => {
    const d = parseLocalDateTime('2027-01-10T08:30')!;
    expect(toLocalInput(d)).toBe('2027-01-10T08:30');
    expect(formatDisplay(d)).toBe('10/01/2027 08:30');
  });
});
