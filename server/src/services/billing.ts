import {audit, type Actor} from '../audit.js';
import type {Tx} from '../db.js';
import {HttpError} from '../http.js';
import {addMonths, diffDays, today} from '../lib/dates.js';
import {splitInstallments} from '../lib/money.js';

export interface ItemRow {
  id: string;
  contract_id: string;
  kind: string;
  description: string;
  billing_type: 'unico' | 'recorrente' | 'parcelado' | 'por_usuario' | 'sob_demanda';
  unit_amount_cents: number;
  quantity: number;
  installments: number | null;
  interval_months: number;
  first_due_date: string | null;
  discount_cents: number;
  active: boolean;
}

export interface PlannedCharge {
  contract_item_id: string;
  description: string;
  competence: string | null;
  installment_no: number | null;
  installments_total: number | null;
  due_date: string;
  amount_cents: number;
  discount_cents: number;
  dedupe_key: string;
}

export const itemTotal = (i: Pick<ItemRow, 'unit_amount_cents' | 'quantity'>): number =>
  Math.round(i.unit_amount_cents * i.quantity);

/** Planeja as cobranças de um item sem tocar no banco (função pura, testável). */
export function planItemCharges(
  item: ItemRow,
  opts: {horizon: string; contractStart: string | null; contractEnd: string | null; dueDay: number | null}
): PlannedCharge[] {
  if (!item.active || item.billing_type === 'sob_demanda') return [];
  const first = item.first_due_date ?? opts.contractStart;
  if (!first) {
    throw new HttpError(422, `Item "${item.description}": defina o primeiro vencimento (ou a data de início do contrato)`, 'missing_due_date');
  }
  const total = itemTotal(item);
  const base = {contract_item_id: item.id, discount_cents: 0};

  if (item.billing_type === 'unico') {
    const net = total - item.discount_cents;
    if (net <= 0) throw new HttpError(422, `Item "${item.description}": valor líquido deve ser maior que zero`, 'invalid_amount');
    return [
      {
        ...base,
        description: item.description,
        competence: `${first.slice(0, 7)}-01`,
        installment_no: null,
        installments_total: null,
        due_date: first,
        amount_cents: total,
        discount_cents: item.discount_cents,
        dedupe_key: `${item.id}|unico`
      }
    ];
  }

  if (item.billing_type === 'parcelado') {
    const n = item.installments as number;
    const parts = splitInstallments(total - item.discount_cents, n);
    return parts.map((amount, idx) => ({
      ...base,
      description: `${item.description} (${idx + 1}/${n})`,
      competence: `${addMonths(first, idx * item.interval_months, opts.dueDay ?? undefined).slice(0, 7)}-01`,
      installment_no: idx + 1,
      installments_total: n,
      due_date: addMonths(first, idx * item.interval_months, opts.dueDay ?? undefined),
      amount_cents: amount,
      discount_cents: 0,
      dedupe_key: `${item.id}|p${idx + 1}`
    }));
  }

  // recorrente | por_usuario: gera do primeiro vencimento até o horizonte (e até o fim da vigência, se houver)
  const net = total - item.discount_cents;
  if (net <= 0) throw new HttpError(422, `Item "${item.description}": valor líquido deve ser maior que zero`, 'invalid_amount');
  const limit = opts.contractEnd && opts.contractEnd < opts.horizon ? opts.contractEnd : opts.horizon;
  const out: PlannedCharge[] = [];
  for (let i = 0; i < 600; i++) {
    const due = addMonths(first, i * item.interval_months, opts.dueDay ?? undefined);
    if (due > limit) break;
    out.push({
      ...base,
      description: item.description,
      competence: `${due.slice(0, 7)}-01`,
      installment_no: null,
      installments_total: null,
      due_date: due,
      amount_cents: total,
      discount_cents: item.discount_cents,
      dedupe_key: `${item.id}|r${due.slice(0, 7)}`
    });
  }
  return out;
}

/** Gera cobranças de um contrato ATIVO. Idempotente: a chave de deduplicação impede cobranças repetidas. */
export async function generateCharges(
  tx: Tx,
  contractId: string,
  actor: Actor,
  opts: {horizonMonths?: number} = {}
): Promise<{created: number; skipped: number}> {
  const {rows: cRows} = await tx.query(
    `select id, client_id, system_id, kind, status, start_date, end_date, due_day, is_public_flow,
            administrative_process, commitment_number
       from contracts where id = $1 for update`,
    [contractId]
  );
  const contract = cRows[0];
  if (!contract) throw new HttpError(404, 'Contrato não encontrado');
  if (contract.kind === 'proposta' || contract.status !== 'ativo') {
    throw new HttpError(409, 'Cobranças só podem ser geradas para contratos assinados e ativados (propostas não geram cobrança)', 'not_active');
  }
  const {rows: items} = await tx.query<ItemRow>(
    'select * from contract_items where contract_id = $1 and active order by position, created_at',
    [contractId]
  );
  const horizon = addMonths(today(), opts.horizonMonths ?? 12);
  let created = 0;
  let planned = 0;
  for (const item of items) {
    for (const p of planItemCharges(item, {
      horizon,
      contractStart: contract.start_date,
      contractEnd: contract.end_date,
      dueDay: contract.due_day
    })) {
      planned++;
      const res = await tx.query(
        `insert into charges (client_id, contract_id, contract_item_id, system_id, description, competence,
                              installment_no, installments_total, due_date, amount_cents, discount_cents, dedupe_key,
                              administrative_process, commitment_number, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         on conflict (dedupe_key) where dedupe_key is not null do nothing`,
        [
          contract.client_id, contractId, p.contract_item_id, contract.system_id, p.description, p.competence,
          p.installment_no, p.installments_total, p.due_date, p.amount_cents, p.discount_cents, p.dedupe_key,
          contract.is_public_flow ? contract.administrative_process : null,
          contract.is_public_flow ? contract.commitment_number : null,
          actor.id
        ]
      );
      created += res.rowCount ?? 0;
    }
  }
  if (created > 0) await audit(tx, actor, 'charges.generate', 'contract', contractId, {created, planned});
  return {created, skipped: planned - created};
}

export interface ChargeTotals {
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
}
export function chargeTotals(c: {
  amount_cents: number;
  discount_cents: number;
  interest_cents: number;
  fine_cents: number;
  paid_cents: number;
}): ChargeTotals {
  const total = c.amount_cents - c.discount_cents + c.interest_cents + c.fine_cents;
  return {total_cents: total, paid_cents: c.paid_cents, balance_cents: total - c.paid_cents};
}

/** Sugestão de multa e juros conforme regras do contrato (apenas sugestão; a baixa exige confirmação). */
export function suggestLateFees(
  c: {amount_cents: number; discount_cents: number; due_date: string; status: string},
  rules: {fine_percent: number; interest_monthly_percent: number},
  on: string = today()
): {days_late: number; fine_cents: number; interest_cents: number} {
  const days = diffDays(on, c.due_date);
  if (days <= 0 || c.status === 'paga' || c.status === 'cancelada') return {days_late: 0, fine_cents: 0, interest_cents: 0};
  const base = c.amount_cents - c.discount_cents;
  return {
    days_late: days,
    fine_cents: Math.round((base * rules.fine_percent) / 100),
    interest_cents: Math.round((base * rules.interest_monthly_percent * days) / 100 / 30)
  };
}
