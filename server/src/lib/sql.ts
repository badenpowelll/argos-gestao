import {z} from 'zod';
import {HttpError} from '../http.js';

/** Texto opcional: "" -> null. */
export const optText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
export const reqText = (max = 300) => z.string().trim().min(1, 'Obrigatório').max(max);
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (AAAA-MM-DD)');
export const optDate = isoDateSchema.nullish().transform((v) => v ?? null);
export const cents = z.number().int().min(0).max(100_000_000_00);
export const uuid = z.string().uuid();

/** UPDATE dinâmico: só colunas da lista branca (constantes do código) e presentes em `data`. */
export function buildUpdate(table: string, id: string, data: Record<string, unknown>, cols: readonly string[]) {
  const keys = cols.filter((k) => k in data && data[k] !== undefined);
  if (!keys.length) throw new HttpError(422, 'Nada para atualizar');
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  return {text: `update ${table} set ${sets}, updated_at = now() where id = $1 returning *`, values: [id, ...keys.map((k) => data[k])]};
}

export const CHARGE_SELECT = `
  select c.*, cl.name as client_name, ct.number as contract_number, s.name as system_name,
         (c.amount_cents - c.discount_cents + c.interest_cents + c.fine_cents) as total_cents,
         (c.amount_cents - c.discount_cents + c.interest_cents + c.fine_cents - c.paid_cents) as balance_cents,
         case when c.status in ('pendente','parcial') and c.due_date < $1::date then 'vencida' else c.status end as display_status
    from charges c
    join clients cl on cl.id = c.client_id
    left join contracts ct on ct.id = c.contract_id
    left join systems s on s.id = c.system_id`;

export function toCsv(columns: {key: string; label: string}[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita injeção de fórmula no Excel
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(';')];
  for (const r of rows) lines.push(columns.map((c) => esc(r[c.key])).join(';'));
  return `﻿${lines.join('\r\n')}\r\n`;
}
