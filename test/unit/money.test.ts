import { describe, expect, it } from 'vitest';
import { formatBRL, parseBRL } from '../../src/lib/money.js';

describe('parseBRL', () => {
  it.each([
    ['100', 10000],
    ['100,00', 10000],
    ['100.00', 10000],
    ['150,5', 15050],
    ['1.234,56', 123456],
    ['R$ 20,00', 2000],
    ['0,01', 1],
  ])('%s -> %i centavos', (input, cents) => {
    expect(parseBRL(input)).toBe(cents);
  });

  it.each(['', 'abc', '10,999', '-5', '1,2,3'])('rejeita %j', (input) => {
    expect(parseBRL(input)).toBeNull();
  });
});

describe('formatBRL', () => {
  it.each([
    [35000, 'R$ 350,00'],
    [0, 'R$ 0,00'],
    [123456, 'R$ 1.234,56'],
    [5, 'R$ 0,05'],
  ])('%i -> %s', (cents, text) => {
    expect(formatBRL(cents)).toBe(text);
  });
});
