import {audit, type Actor} from '../audit.js';
import {withTx, type Db, type Tx} from '../db.js';
import {HttpError} from '../http.js';
import {chargeTotals} from './billing.js';

export const METHODS = ['pix', 'transferencia', 'cartao', 'boleto', 'dinheiro'] as const;
export type Method = (typeof METHODS)[number];

export interface PaymentLine {
  method: Method;
  amount_cents: number;
  reference?: string | null;
  receipt_document_id?: string | null;
  notes?: string | null;
}
export interface ReceiveInput {
  charge_id: string;
  idempotency_key: string;
  lines: PaymentLine[];
  paid_at?: string | null;
  /** Ajustes (desconto, juros, multa) — somente perfis financeiros. */
  adjustments?: {discount_cents?: number; interest_cents?: number; fine_cents?: number} | null;
}

type ChargeRow = {
  id: string;
  amount_cents: number;
  discount_cents: number;
  interest_cents: number;
  fine_cents: number;
  paid_cents: number;
  status: 'pendente' | 'parcial' | 'paga' | 'cancelada';
};

export function statusFor(c: Pick<ChargeRow, 'amount_cents' | 'discount_cents' | 'interest_cents' | 'fine_cents'>, paid: number) {
  const {total_cents} = chargeTotals({...c, paid_cents: paid});
  return paid >= total_cents ? 'paga' : paid > 0 ? 'parcial' : 'pendente';
}

async function recompute(tx: Tx, chargeId: string): Promise<ChargeRow> {
  const {rows} = await tx.query<ChargeRow>('select * from charges where id = $1', [chargeId]);
  const charge = rows[0] as ChargeRow;
  const sum = await tx.query<{paid: number}>(
    "select coalesce(sum(amount_cents),0) as paid from payments where charge_id = $1 and status = 'confirmado'",
    [chargeId]
  );
  const paid = (sum.rows[0] as {paid: number}).paid;
  const status = statusFor(charge, paid);
  const upd = await tx.query<ChargeRow>(
    `update charges set paid_cents = $2, status = $3,
            paid_at = case when $3 = 'paga' then now() else null end, updated_at = now()
      where id = $1 returning *`,
    [chargeId, paid, status]
  );
  return upd.rows[0] as ChargeRow;
}

export interface ReceiveResult {
  charge: ChargeRow;
  payment_ids: string[];
  duplicate: boolean;
}

/**
 * Baixa de cobrança (PDV). Tudo em uma transação com a cobrança bloqueada (`for update`):
 *  - idempotência por `idempotency_key` (reenvio/duplo clique não duplica o recebimento);
 *  - impede pagar cobrança cancelada/quitada e valor acima do saldo;
 *  - ajustes de desconto/juros/multa só para perfis financeiros, e auditados.
 */
export async function receivePayment(db: Db, actor: Actor, input: ReceiveInput): Promise<ReceiveResult> {
  if (!input.lines.length) throw new HttpError(422, 'Informe ao menos uma forma de pagamento');
  const run = () =>
    withTx(db, async (tx): Promise<ReceiveResult> => {
      const existing = await tx.query<{id: string; charge_id: string}>(
        'select id, charge_id from payments where idempotency_key = $1 order by line_no',
        [input.idempotency_key]
      );
      if (existing.rows.length) {
        if (existing.rows.some((p) => p.charge_id !== input.charge_id)) {
          throw new HttpError(409, 'Chave de idempotência já usada em outra cobrança', 'idempotency_conflict');
        }
        const {rows} = await tx.query<ChargeRow>('select * from charges where id = $1', [input.charge_id]);
        return {charge: rows[0] as ChargeRow, payment_ids: existing.rows.map((p) => p.id), duplicate: true};
      }

      const {rows} = await tx.query<ChargeRow>('select * from charges where id = $1 for update', [input.charge_id]);
      let charge = rows[0];
      if (!charge) throw new HttpError(404, 'Cobrança não encontrada');
      if (charge.status === 'cancelada') throw new HttpError(409, 'Cobrança cancelada não pode ser recebida', 'charge_cancelled');
      if (charge.status === 'paga') throw new HttpError(409, 'Cobrança já está quitada', 'already_paid');

      const adj = input.adjustments;
      if (adj && (adj.discount_cents || adj.interest_cents || adj.fine_cents)) {
        if (actor.role !== 'admin' && actor.role !== 'financeiro') {
          throw new HttpError(403, 'Somente o financeiro pode aplicar desconto, juros ou multa');
        }
        const next = {
          discount_cents: adj.discount_cents ?? charge.discount_cents,
          interest_cents: adj.interest_cents ?? charge.interest_cents,
          fine_cents: adj.fine_cents ?? charge.fine_cents
        };
        if (next.discount_cents > charge.amount_cents) throw new HttpError(422, 'Desconto maior que o valor da cobrança');
        await tx.query(
          'update charges set discount_cents=$2, interest_cents=$3, fine_cents=$4, updated_at=now() where id=$1',
          [charge.id, next.discount_cents, next.interest_cents, next.fine_cents]
        );
        await audit(tx, actor, 'charge.adjust', 'charge', charge.id, {before: pick(charge), after: next});
        charge = {...charge, ...next};
      }

      const {balance_cents} = chargeTotals(charge);
      const received = input.lines.reduce((s, l) => s + l.amount_cents, 0);
      if (received > balance_cents) {
        throw new HttpError(422, 'Valor recebido maior que o saldo da cobrança', 'overpayment', {balance_cents, received});
      }

      const ids: string[] = [];
      for (const [i, line] of input.lines.entries()) {
        const ins = await tx.query<{id: string}>(
          `insert into payments (charge_id, method, amount_cents, paid_at, reference, receipt_document_id,
                                 operator_id, operator_name, idempotency_key, line_no, notes)
           values ($1,$2,$3,coalesce($4::timestamptz, now()),$5,$6,$7,$8,$9,$10,$11) returning id`,
          [charge.id, line.method, line.amount_cents, input.paid_at ?? null, line.reference ?? null,
           line.receipt_document_id ?? null, actor.id, actor.name, input.idempotency_key, i, line.notes ?? null]
        );
        ids.push((ins.rows[0] as {id: string}).id);
      }
      const updated = await recompute(tx, charge.id);
      await audit(tx, actor, 'payment.receive', 'charge', charge.id, {
        payment_ids: ids,
        lines: input.lines.map((l) => ({method: l.method, amount_cents: l.amount_cents, reference: l.reference ?? null})),
        status: updated.status
      });
      return {charge: updated, payment_ids: ids, duplicate: false};
    });

  try {
    return await run();
  } catch (err) {
    // Corrida entre duas requisições com a mesma chave: a segunda recebe o resultado da primeira.
    if ((err as {code?: string}).code === '23505' && /payments_idem_uq/.test((err as {constraint?: string}).constraint ?? '')) {
      return run();
    }
    throw err;
  }
}

const pick = (c: ChargeRow) => ({discount_cents: c.discount_cents, interest_cents: c.interest_cents, fine_cents: c.fine_cents});

/** Estorno controlado: o pagamento é preservado e marcado como estornado, com motivo e responsável. */
export async function reversePayment(db: Db, actor: Actor, paymentId: string, reason: string): Promise<ChargeRow> {
  if (reason.trim().length < 5) throw new HttpError(422, 'Informe o motivo do estorno (mín. 5 caracteres)');
  return withTx(db, async (tx) => {
    const p = await tx.query<{id: string; charge_id: string; status: string; amount_cents: number}>(
      'select id, charge_id, status, amount_cents from payments where id = $1',
      [paymentId]
    );
    const payment = p.rows[0];
    if (!payment) throw new HttpError(404, 'Pagamento não encontrado');
    await tx.query('select id from charges where id = $1 for update', [payment.charge_id]);
    const fresh = await tx.query<{status: string}>('select status from payments where id = $1 for update', [paymentId]);
    if (fresh.rows[0]?.status !== 'confirmado') throw new HttpError(409, 'Pagamento já estornado', 'already_reversed');
    await tx.query(
      "update payments set status='estornado', reversed_at=now(), reversed_by=$2, reversal_reason=$3 where id=$1",
      [paymentId, actor.id, reason.trim()]
    );
    const charge = await recompute(tx, payment.charge_id);
    await audit(tx, actor, 'payment.reverse', 'charge', payment.charge_id, {
      payment_id: paymentId,
      amount_cents: payment.amount_cents,
      reason: reason.trim()
    });
    return charge;
  });
}

export async function cancelCharge(db: Db, actor: Actor, chargeId: string, reason: string): Promise<void> {
  if (reason.trim().length < 5) throw new HttpError(422, 'Informe o motivo do cancelamento (mín. 5 caracteres)');
  await withTx(db, async (tx) => {
    const {rows} = await tx.query<ChargeRow>('select * from charges where id = $1 for update', [chargeId]);
    const c = rows[0];
    if (!c) throw new HttpError(404, 'Cobrança não encontrada');
    if (c.status === 'cancelada') return;
    if (c.paid_cents > 0) {
      throw new HttpError(409, 'Cobrança com pagamento confirmado: estorne os pagamentos antes de cancelar', 'has_payments');
    }
    await tx.query("update charges set status='cancelada', cancelled_reason=$2, updated_at=now() where id=$1", [chargeId, reason.trim()]);
    await audit(tx, actor, 'charge.cancel', 'charge', chargeId, {reason: reason.trim()});
  });
}
