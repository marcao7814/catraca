// Gateway de pagamento (ADR-005). Só o modo simulado existe neste MVP.
import { config } from '../../config.js';
import type { GatewayOutcome } from './types.js';

export interface Authorization {
  outcome: GatewayOutcome;
  /** Atraso até a resposta do gateway, já com GATEWAY_DELAY_SCALE aplicado. */
  delayMs: number;
}

export interface PaymentGateway {
  authorize(cardNumber: string): Authorization;
}

interface Rule {
  outcome: GatewayOutcome;
  minMs: number;
  maxMs: number;
}

// Tabela do brief. O teto fica 0,5 s abaixo do limite para absorver o intervalo do worker
// (500 ms) e manter o resultado observável dentro da faixa prometida.
const FAST = { minMs: 2_000, maxMs: 4_500 };
const SLOW = { minMs: 30_000, maxMs: 39_500 };

export const SIMULATED_RULES: Record<string, Rule> = {
  '0001': { outcome: 'approved', ...FAST },
  '0002': { outcome: 'declined', ...FAST },
  '0003': { outcome: 'approved', ...SLOW },
  '0004': { outcome: 'declined', ...SLOW },
};
const DEFAULT_RULE: Rule = { outcome: 'declined', ...FAST };

export function ruleFor(cardNumber: string): Rule {
  return SIMULATED_RULES[cardNumber.slice(-4)] ?? DEFAULT_RULE;
}

export class SimulatedGateway implements PaymentGateway {
  constructor(
    private readonly scale: number = config.gatewayDelayScale,
    private readonly random: () => number = Math.random,
  ) {}

  authorize(cardNumber: string): Authorization {
    const rule = ruleFor(cardNumber);
    const base = rule.minMs + this.random() * (rule.maxMs - rule.minMs);
    return { outcome: rule.outcome, delayMs: Math.round(base * this.scale) };
  }
}

let gateway: PaymentGateway = new SimulatedGateway();

export function getGateway(): PaymentGateway {
  return gateway;
}

/** Só para testes. */
export function setGateway(g: PaymentGateway): void {
  gateway = g;
}
