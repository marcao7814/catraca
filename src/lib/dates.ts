// O produto usa America/Sao_Paulo, sem horário de verão desde 2019: offset fixo -03:00.
const OFFSET_MS = -3 * 60 * 60 * 1000;
const OFFSET_STR = '-03:00';

const pad = (n: number) => n.toString().padStart(2, '0');
const shifted = (d: Date) => new Date(d.getTime() + OFFSET_MS);

/** Date -> "2026-12-05T21:00:00-03:00" */
export function toIsoOffset(d: Date): string {
  const s = shifted(d);
  return (
    `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}` +
    `T${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}:${pad(s.getUTCSeconds())}${OFFSET_STR}`
  );
}

/** Valor de <input type="datetime-local"> ("2026-12-05T21:00") em horário de Brasília -> Date. */
export function parseLocalDateTime(input: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(input.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '00'] = m;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${OFFSET_STR}`);
  if (Number.isNaN(date.getTime())) return null;
  // Rejeita datas que o Date "corrige" (ex.: 31/02).
  if (toIsoOffset(date).slice(0, 16) !== `${y}-${mo}-${d}T${h}:${mi}`) return null;
  return date;
}

/** Date -> valor para <input type="datetime-local"> */
export function toLocalInput(d: Date): string {
  return toIsoOffset(d).slice(0, 16);
}

/** Date -> "05/12/2026 21:00" */
export function formatDisplay(d: Date): string {
  const s = shifted(d);
  return `${pad(s.getUTCDate())}/${pad(s.getUTCMonth() + 1)}/${s.getUTCFullYear()} ${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}`;
}
