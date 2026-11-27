import { randomBytes, randomInt } from 'node:crypto';

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
// Sem 0/O/1/I para facilitar a digitação no check-in.
export const TICKET_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type IdPrefix = 'usr' | 'evt' | 'tkt';

/** ID não sequencial, ex.: evt_k3m9q2x7ab4d */
export function newId(prefix: IdPrefix): string {
  let out = '';
  for (const b of randomBytes(12)) out += BASE32[b % 32];
  return `${prefix}_${out}`;
}

/** Código de check-in de 8 caracteres, ex.: K7Q2M9XA */
export function newTicketCode(): string {
  let out = '';
  for (let i = 0; i < 8; i++) out += TICKET_CODE_ALPHABET[randomInt(TICKET_CODE_ALPHABET.length)];
  return out;
}

export function normalizeTicketCode(raw: string): string {
  return raw.trim().toUpperCase();
}
