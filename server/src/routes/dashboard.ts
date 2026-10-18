import {Router} from 'express';
import type {Db} from '../db.js';
import {asyncHandler, parse} from '../http.js';
import {addMonths, monthStart, today} from '../lib/dates.js';
import {isoDateSchema} from '../lib/sql.js';

export const MRR_SQL = `
  coalesce(round(sum((i.unit_amount_cents * i.quantity - i.discount_cents) / i.interval_months)), 0)::bigint`;

export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
}

export function resolvePeriod(q: {from?: unknown; to?: unknown}) {
  const t = today();
  const from = typeof q.from === 'string' && q.from ? parse(isoDateSchema, q.from) : monthStart(t);
  const to = typeof q.to === 'string' && q.to ? parse(isoDateSchema, q.to) : addDays(addMonths(monthStart(t), 1), -1);
  return {from, to, today: t};
}
function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function dashboardRoutes(db: Db) {
  const r = Router();
  r.get('/', asyncHandler(async (req, res) => {
    const {from, to, today: t} = resolvePeriod(req.query);
    const open = "c.status in ('pendente','parcial')";
    const bal = '(c.amount_cents - c.discount_cents + c.interest_cents + c.fine_cents - c.paid_cents)';
    const tot = '(c.amount_cents - c.discount_cents + c.interest_cents + c.fine_cents)';
    const paidDay = "(p.paid_at at time zone 'America/Sao_Paulo')::date";

    const [counts, mrr, received, impl, pending, overdue, billedDue, expenses, infra, series, topOverdue, upcoming, ending, byMethod] = await Promise.all([
      db.query(`select (select count(*)::int from clients) as clients_total,
                       (select count(*)::int from clients where status = 'ativo') as clients_active,
                       (select count(*)::int from contracts where status = 'ativo' and kind <> 'proposta') as contracts_active,
                       (select count(*)::int from contracts where kind = 'proposta' and status = 'proposta') as proposals_open,
                       (select count(*)::int from systems where status in ('em_producao','manutencao')) as systems_live`),
      db.query(`select ${MRR_SQL} as mrr from contract_items i join contracts k on k.id = i.contract_id
                 where i.active and k.status = 'ativo' and k.kind <> 'proposta' and i.billing_type in ('recorrente','por_usuario')`),
      db.query(`select coalesce(sum(p.amount_cents),0)::bigint as v from payments p where p.status='confirmado' and ${paidDay} between $1 and $2`, [from, to]),
      db.query(`select coalesce(sum(p.amount_cents),0)::bigint as v from payments p join charges c on c.id = p.charge_id join contract_items i on i.id = c.contract_item_id
                 where p.status='confirmado' and i.kind in ('implementacao','desenvolvimento') and ${paidDay} between $1 and $2`, [from, to]),
      db.query(`select coalesce(sum(${bal}),0)::bigint as v, count(*)::int as n from charges c where ${open} and c.due_date >= $1`, [t]),
      db.query(`select coalesce(sum(${bal}),0)::bigint as v, count(*)::int as n, count(distinct c.client_id)::int as clients from charges c where ${open} and c.due_date < $1`, [t]),
      db.query(`select coalesce(sum(${tot}),0)::bigint as v from charges c where c.status <> 'cancelada' and c.due_date <= $1`, [t]),
      db.query('select coalesce(sum(amount_cents),0)::bigint as v from expenses where competence between $1 and $2', [from, to]),
      db.query("select coalesce(sum(operational_cost_cents),0)::bigint as v from systems where status in ('em_producao','manutencao')"),
      db.query(
        `with m as (select to_char(d, 'YYYY-MM') as ym from generate_series(date_trunc('month', $1::date) - interval '11 months', date_trunc('month', $1::date), interval '1 month') d)
         select m.ym,
           coalesce((select sum(${tot}) from charges c where c.status <> 'cancelada' and to_char(c.due_date,'YYYY-MM') = m.ym),0)::bigint as billed,
           coalesce((select sum(p.amount_cents) from payments p where p.status='confirmado' and to_char(${paidDay},'YYYY-MM') = m.ym),0)::bigint as received
         from m order by m.ym`, [t]),
      db.query(`select cl.id, cl.name, sum(${bal})::bigint as balance_cents, count(*)::int as charges, min(c.due_date) as oldest_due
                  from charges c join clients cl on cl.id = c.client_id where ${open} and c.due_date < $1 group by cl.id, cl.name order by balance_cents desc limit 5`, [t]),
      db.query(`select c.id, c.description, c.due_date, cl.name as client_name, ${bal}::bigint as balance_cents
                  from charges c join clients cl on cl.id = c.client_id where ${open} and c.due_date between $1 and ($1::date + 7) order by c.due_date limit 8`, [t]),
      db.query(`select id, number, end_date, (select name from clients where id = client_id) as client_name from contracts
                 where status = 'ativo' and end_date between $1 and ($1::date + 60) order by end_date limit 10`, [t]),
      db.query(`select p.method, sum(p.amount_cents)::bigint as v from payments p where p.status='confirmado' and ${paidDay} between $1 and $2 group by p.method order by v desc`, [from, to])
    ]);

    const months = monthsBetween(from, to);
    const receivedV = received.rows[0].v as number;
    const expensesV = expenses.rows[0].v as number;
    const infraV = (infra.rows[0].v as number) * months;
    const overdueV = overdue.rows[0].v as number;
    const dueV = billedDue.rows[0].v as number;
    res.json({
      period: {from, to, months, today: t},
      counts: counts.rows[0],
      mrr_cents: mrr.rows[0].mrr,
      arr_cents: (mrr.rows[0].mrr as number) * 12,
      received_cents: receivedV,
      implementation_received_cents: impl.rows[0].v,
      pending_cents: pending.rows[0].v,
      pending_count: pending.rows[0].n,
      overdue_cents: overdueV,
      overdue_count: overdue.rows[0].n,
      overdue_clients: overdue.rows[0].clients,
      delinquency_rate: dueV > 0 ? Math.round((overdueV / dueV) * 1000) / 10 : 0,
      expenses_cents: expensesV,
      infra_cost_cents: infraV,
      result_cents: receivedV - expensesV - infraV,
      series: series.rows,
      top_overdue: topOverdue.rows,
      upcoming: upcoming.rows,
      contracts_ending: ending.rows,
      by_method: byMethod.rows,
      notes: {infra: 'Custo de infraestrutura = custo mensal dos sistemas em produção/manutenção × meses do período. Não registre a mesma hospedagem também como despesa.'}
    });
  }));
  return r;
}
