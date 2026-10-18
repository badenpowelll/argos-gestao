/** Interpreta "R$ 1.499,80", "1499,80", "1.499,80", "148" -> centavos. Retorna null se inválido. */
export function parseBRL(text: string): number | null {
  const cleaned = text.replace(/R\$\s*/i, '').replace(/\s/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(cleaned)) return null;
  const [int = '0', dec = ''] = cleaned.replace(/\./g, '').split(',');
  return Number(int) * 100 + Number(dec.padEnd(2, '0'));
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
}

/** Divide `total` em n parcelas; a diferença de arredondamento vai para a última. */
export function splitInstallments(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const parts = Array.from({length: n}, () => base);
  parts[n - 1] = (parts[n - 1] as number) + (total - base * n);
  return parts;
}
