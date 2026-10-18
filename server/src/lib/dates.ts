/** Datas como 'YYYY-MM-DD' (sem fuso). Toda aritmética em UTC. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function today(): string {
  // data civil de Brasília (UTC-3), independente do fuso do servidor
  return isoDate(new Date(Date.now() - 3 * 3600 * 1000));
}
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && isoDate(d) === s;
}
export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}
/** Soma `months` meses; mantém `day` (ou o dia original), limitando ao último dia do mês. */
export function addMonths(date: string, months: number, day?: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(day ?? d, daysInMonth(ny, nm));
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}
export function diffDays(later: string, earlier: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);
}
