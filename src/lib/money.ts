// Dinheiro sempre em centavos inteiros (ADR-009).

/** Aceita "100", "100,00", "100.00", "1.234,56", "R$ 150,00". Retorna centavos ou null. */
export function parseBRL(input: string): number | null {
  let s = input.replace(/R\$/i, '').replace(/\s/g, '');
  if (s === '') return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int = '0', frac = ''] = s.split('.');
  return Number(int) * 100 + Number(frac.padEnd(2, '0'));
}

/** 35000 -> "R$ 350,00"; 123456 -> "R$ 1.234,56" */
export function formatBRL(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const int = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${sign}R$ ${int},${frac}`;
}
