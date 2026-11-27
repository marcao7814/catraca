import { parseLocalDateTime } from '../../lib/dates.js';
import { parseBRL } from '../../lib/money.js';
import type { EventFormValues, EventInput } from './types.js';

export const MAX_CAPACITY = 100_000;
export const MAX_PRICE_CENTS = 100_000_000; // R$ 1.000.000,00

export type FieldErrors = Partial<Record<keyof EventFormValues, string>>;

export type ValidationResult =
  | { ok: true; value: EventInput; values: EventFormValues }
  | { ok: false; errors: FieldErrors; values: EventFormValues };

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function formValues(body: unknown): EventFormValues {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    name: str(b.name),
    startsAt: str(b.startsAt),
    venue: str(b.venue),
    capacity: str(b.capacity),
    price: str(b.price),
  };
}

/** Valida o formulário de evento (R01). `now` é injetável para testes. */
export function validateEventForm(body: unknown, now: Date = new Date()): ValidationResult {
  const values = formValues(body);
  const errors: FieldErrors = {};

  const name = values.name.trim();
  if (name.length < 1 || name.length > 200) errors.name = 'Informe o nome (até 200 caracteres).';

  const venue = values.venue.trim();
  if (venue.length < 1 || venue.length > 200) errors.venue = 'Informe o local (até 200 caracteres).';

  const startsAt = parseLocalDateTime(values.startsAt);
  if (!startsAt) errors.startsAt = 'Informe data e hora de início válidas.';
  else if (startsAt.getTime() <= now.getTime()) errors.startsAt = 'A data de início precisa estar no futuro.';

  const capRaw = values.capacity.trim();
  const capacity = /^\d+$/.test(capRaw) ? Number(capRaw) : NaN;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY)
    errors.capacity = 'A lotação precisa ser um número inteiro maior ou igual a 1.';

  const priceCents = parseBRL(values.price);
  if (priceCents === null || priceCents <= 0 || priceCents > MAX_PRICE_CENTS)
    errors.price = 'O preço precisa ser maior que zero (ex.: 100,00).';

  if (Object.keys(errors).length > 0) return { ok: false, errors, values };
  return {
    ok: true,
    values,
    value: { name, venue, startsAt: startsAt!, capacity, priceCents: priceCents! },
  };
}
