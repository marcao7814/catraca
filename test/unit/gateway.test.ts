import { describe, expect, it } from 'vitest';
import { SimulatedGateway } from '../../src/modules/sales/gateway.js';

const min = () => 0;
const max = () => 0.999999;

describe('gateway simulado (tabela do brief, R08)', () => {
  it.each([
    ['4000000000000001', 'approved', 2_000, 4_500],
    ['4000000000000002', 'declined', 2_000, 4_500],
    ['4000000000000003', 'approved', 30_000, 39_500],
    ['4000000000000004', 'declined', 30_000, 39_500],
    ['4000000000000009', 'declined', 2_000, 4_500],
    ['4111111111111111', 'declined', 2_000, 4_500],
  ])('%s -> %s entre %i e %i ms', (card, outcome, lo, hi) => {
    const gMin = new SimulatedGateway(1, min).authorize(card);
    const gMax = new SimulatedGateway(1, max).authorize(card);
    expect(gMin.outcome).toBe(outcome);
    expect(gMin.delayMs).toBe(lo);
    expect(gMax.delayMs).toBeLessThanOrEqual(hi);
    expect(gMax.delayMs).toBeGreaterThan(hi - 5);
  });

  it('faixas ficam dentro do brief (2–5 s e 30–40 s) com folga para o worker', () => {
    const g = new SimulatedGateway(1);
    for (let i = 0; i < 2000; i++) {
      const fast = g.authorize('4000000000000001').delayMs;
      const slow = g.authorize('4000000000000003').delayMs;
      expect(fast).toBeGreaterThanOrEqual(2_000);
      expect(fast).toBeLessThanOrEqual(4_500);
      expect(slow).toBeGreaterThanOrEqual(30_000);
      expect(slow).toBeLessThanOrEqual(39_500);
    }
  });

  it('GATEWAY_DELAY_SCALE só multiplica o atraso', () => {
    const r = new SimulatedGateway(0.01, min).authorize('4000000000000003');
    expect(r).toEqual({ outcome: 'approved', delayMs: 300 });
  });
});
