/** Validação de CPF/CNPJ (dígitos verificadores). */
export function onlyDigits(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

function allEqual(s: string): boolean {
  return /^(\d)\1+$/.test(s);
}

export function isValidCpf(input: string): boolean {
  const s = onlyDigits(input);
  if (s.length !== 11 || allEqual(s)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(s[i]) * (len + 1 - i);
    const dv = ((sum * 10) % 11) % 10;
    if (dv !== Number(s[len])) return false;
  }
  return true;
}

export function isValidCnpj(input: string): boolean {
  const s = onlyDigits(input);
  if (s.length !== 14 || allEqual(s)) return false;
  for (const len of [12, 13]) {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(s[i]) * (weights[i] as number);
    const r = sum % 11;
    const dv = r < 2 ? 0 : 11 - r;
    if (dv !== Number(s[len])) return false;
  }
  return true;
}

/** Completa os dígitos verificadores (usado em dados FICTÍCIOS de demonstração). */
export function completeCnpj(base12: string): string {
  const calc = (s: string, w: number[]) => {
    const r = s.split('').reduce((a, d, i) => a + Number(d) * (w[i] as number), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base12}${d1}${calc(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])}`;
}
export function completeCpf(base9: string): string {
  const calc = (s: string) => ((s.split('').reduce((a, d, i) => a + Number(d) * (s.length + 1 - i), 0) * 10) % 11) % 10;
  const d1 = calc(base9);
  return `${base9}${d1}${calc(base9 + d1)}`;
}

export function isValidDocument(input: string): boolean {
  const n = onlyDigits(input).length;
  return n === 11 ? isValidCpf(input) : n === 14 ? isValidCnpj(input) : false;
}

export function formatDocument(input: string | null | undefined): string {
  const s = onlyDigits(input);
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return input ?? '';
}

/** Telefone BR -> E.164 sem '+' (ex.: 5584998590183). Retorna null se não parecer válido. */
export function toWhatsappNumber(input: string | null | undefined): string | null {
  let d = onlyDigits(input);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return null;
}
