import {Router} from 'express';
import {z} from 'zod';
import {audit} from '../audit.js';
import {FINANCE, WRITERS, actorOf, requireRole} from '../auth.js';
import type {Db} from '../db.js';
import {HttpError, asyncHandler, parse} from '../http.js';
import {addMonths, today} from '../lib/dates.js';
import {toWhatsappNumber} from '../lib/documents.js';
import {formatBRL} from '../lib/money.js';
import {CHARGE_SELECT, buildUpdate, cents, isoDateSchema, optDate, optText, uuid} from '../lib/sql.js';
import {suggestLateFees} from '../services/billing.js';
import {METHODS, cancelCharge, receivePayment, reversePayment} from '../services/payments.js';
import {whatsappProvider} from '../integrations/whatsapp.js';

const VIEWS: Record<string, string> = {
  futuras: "c.status = 'pendente' and c.due_date > $1::date",
  pendentes: "c.status = 'pendente' and c.due_date >= $1::date",
  vencidas: "c.status in ('pendente','parcial') and c.due_date < $1::date",
  parciais: "c.status = 'parcial'",
  pagas: "c.status = 'paga'",
  canceladas: "c.status = 'cancelada'",
  abertas: "c.status in ('pendente','parcial')"
};

const PUBLIC_COLS = ['administrative_process', 'commitment_number', 'invoice_number', 'liquidation_date', 'payment_forecast_date'] as const;

export function chargeRoutes(db: Db, companyWhatsapp: () => Promise<string | null>) {
  const r = Router();

  r.get('/', asyncHandler(async (req, res) => {
    const vals: unknown[] = [today()];
    const where: string[] = [];
    const view = typeof req.query.view === 'string' ? req.query.view : '';
    if (view && VIEWS[view]) where.push(VIEWS[view] as string);
    for (const f of ['client_id', 'contract_id', 'system_id'] as const) {
      const v = req.query[f];
      if (typeof v === 'string' && v) {
        vals.push(parse(uuid, v));
        where.push(`c.${f} = $${vals.length}`);
      }
    }
    for (const [param, op] of [['from', '>='], ['to', '<=']] as const) {
      const v = req.query[param];
      if (typeof v === 'string' && v) {
        vals.push(parse(isoDateSchema, v));
        where.push(`c.due_date ${op} $${vals.length}::date`);
      }
    }
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      vals.push(`%${req.query.q.trim().toLowerCase()}%`);
      where.push(`(lower(cl.name) like $${vals.length} or lower(c.description) like $${vals.length} or lower(coalesce(ct.number,'')) like $${vals.length})`);
    }
    const {rows} = await db.query(
      `${CHARGE_SELECT} ${where.length ? `where ${where.join(' and ')}` : ''} order by c.due_date, cl.name limit 1000`, vals);
    res.json(rows);
  }));

  r.get('/:id', asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const charge = (await db.query(`${CHARGE_SELECT} where c.id = $2`, [today(), id])).rows[0];
    if (!charge) throw new HttpError(404, 'Cobrança não encontrada');
    const [payments, contract, history] = await Promise.all([
      db.query('select * from payments where charge_id = $1 order by created_at, line_no', [id]),
      charge.contract_id ? db.query('select fine_percent, interest_monthly_percent from contracts where id = $1', [charge.contract_id]) : Promise.resolve({rows: [{fine_percent: 0, interest_monthly_percent: 0}]}),
      db.query("select at, user_name, action, detail from audit_log where entity = 'charge' and entity_id = $1 order by at desc", [id])
    ]);
    const rules = contract.rows[0] as {fine_percent: number; interest_monthly_percent: number};
    res.json({charge, payments: payments.rows, suggested_fees: suggestLateFees(charge, rules), history: history.rows});
  }));

  // Cobrança avulsa/manual (ex.: sob demanda). Exige cliente; contrato opcional, mas se informado deve estar ativo.
  r.post('/', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const b = parse(z.object({
      client_id: uuid, contract_id: uuid.nullish(), system_id: uuid.nullish(), description: z.string().trim().min(3).max(300),
      due_date: isoDateSchema, amount_cents: cents.refine((v) => v > 0, 'Valor deve ser maior que zero'), discount_cents: cents.default(0),
      administrative_process: optText(100), commitment_number: optText(100), invoice_number: optText(100),
      liquidation_date: optDate, payment_forecast_date: optDate, competence: optDate
    }), req.body);
    if (b.discount_cents > b.amount_cents) throw new HttpError(422, 'Desconto maior que o valor');
    if (b.contract_id) {
      const c = (await db.query('select client_id, status, kind from contracts where id = $1', [b.contract_id])).rows[0];
      if (!c || c.client_id !== b.client_id) throw new HttpError(422, 'Contrato não pertence ao cliente');
      if (c.kind === 'proposta' || c.status !== 'ativo') throw new HttpError(409, 'Só é possível cobrar contratos assinados e ativos', 'not_active');
    }
    const {rows} = await db.query(
      `insert into charges (client_id, contract_id, system_id, description, due_date, amount_cents, discount_cents, competence,
                            administrative_process, commitment_number, invoice_number, liquidation_date, payment_forecast_date, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
      [b.client_id, b.contract_id ?? null, b.system_id ?? null, b.description, b.due_date, b.amount_cents, b.discount_cents, b.competence ?? `${b.due_date.slice(0, 7)}-01`,
       b.administrative_process, b.commitment_number, b.invoice_number, b.liquidation_date, b.payment_forecast_date, actorOf(req).id]
    );
    await audit(db, actorOf(req), 'charge.create', 'charge', rows[0].id, {manual: true, amount_cents: b.amount_cents});
    res.status(201).json(rows[0]);
  }));

  // Campos administrativos do setor público e vencimento (somente enquanto não houver pagamento).
  r.patch('/:id', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const d = parse(z.object({
      administrative_process: optText(100), commitment_number: optText(100), invoice_number: optText(100),
      liquidation_date: optDate, payment_forecast_date: optDate, due_date: isoDateSchema, description: z.string().trim().min(3).max(300)
    }).partial(), req.body);
    const actor = actorOf(req);
    const before = (await db.query('select * from charges where id = $1', [id])).rows[0];
    if (!before) throw new HttpError(404, 'Cobrança não encontrada');
    if (before.status === 'cancelada' || before.status === 'paga') throw new HttpError(409, 'Cobrança finalizada não pode ser alterada');
    if ((d.due_date || d.description) && actor.role !== 'admin' && actor.role !== 'financeiro') throw new HttpError(403, 'Somente o financeiro altera vencimento/descrição');
    const q = buildUpdate('charges', id, d, [...PUBLIC_COLS, 'due_date', 'description']);
    const {rows} = await db.query(q.text, q.values);
    await audit(db, actor, 'charge.update', 'charge', id, {changed: Object.keys(d), due_date_before: before.due_date});
    res.json(rows[0]);
  }));

  r.post('/:id/cancel', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const b = parse(z.object({reason: z.string().trim().min(5).max(500), confirm: z.literal(true)}), req.body);
    await cancelCharge(db, actorOf(req), parse(uuid, req.params.id), b.reason);
    res.json({ok: true});
  }));

  // PDV: RECEBER / DAR BAIXA
  r.post('/:id/receive', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const b = parse(z.object({
      idempotency_key: z.string().trim().min(8).max(100),
      confirm: z.literal(true, {errorMap: () => ({message: 'Confirmação explícita obrigatória'})}),
      paid_at: z.string().datetime({offset: true}).nullish(),
      lines: z.array(z.object({
        method: z.enum(METHODS), amount_cents: cents.refine((v) => v > 0, 'Valor deve ser maior que zero'),
        reference: optText(200), receipt_document_id: uuid.nullish(), notes: optText(500)
      })).min(1).max(10),
      adjustments: z.object({discount_cents: cents.optional(), interest_cents: cents.optional(), fine_cents: cents.optional()}).nullish()
    }), req.body);
    if (b.paid_at && new Date(b.paid_at).getTime() > Date.now() + 5 * 60_000) throw new HttpError(422, 'Data de pagamento no futuro');
    const result = await receivePayment(db, actorOf(req), {charge_id: parse(uuid, req.params.id), idempotency_key: b.idempotency_key, lines: b.lines, paid_at: b.paid_at ?? null, adjustments: b.adjustments ?? null});
    res.status(result.duplicate ? 200 : 201).json(result);
  }));

  r.post('/payments/:paymentId/reverse', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const b = parse(z.object({reason: z.string().trim().min(5).max(500), confirm: z.literal(true)}), req.body);
    res.json({charge: await reversePayment(db, actorOf(req), parse(uuid, req.params.paymentId), b.reason)});
  }));

  // ---- cobrança por WhatsApp (v1: mensagem pronta + registro manual do envio)
  r.get('/:id/whatsapp', asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const row = (await db.query(
      `${CHARGE_SELECT} where c.id = $2`, [today(), id])).rows[0];
    if (!row) throw new HttpError(404, 'Cobrança não encontrada');
    const client = (await db.query('select name, whatsapp, phone, responsible_name from clients where id = $1', [row.client_id])).rows[0];
    const company = (await db.query('select trade_name, whatsapp from company')).rows[0];
    const number = toWhatsappNumber(client.whatsapp) ?? toWhatsappNumber(client.phone);
    const due = (row.due_date as string).split('-').reverse().join('/');
    const overdue = row.display_status === 'vencida';
    const greeting = client.responsible_name ? `Olá, ${client.responsible_name}!` : 'Olá!';
    const message = [
      greeting,
      overdue
        ? `Identificamos que a cobrança "${row.description}" (${client.name}), com vencimento em ${due}, está em aberto. Saldo: ${formatBRL(row.balance_cents)}.`
        : `Lembrete da cobrança "${row.description}" (${client.name}), vencimento em ${due}. Valor em aberto: ${formatBRL(row.balance_cents)}.`,
      'Caso já tenha efetuado o pagamento, por favor nos envie o comprovante.',
      `${company.trade_name}${company.whatsapp ? ` — ${formatContact(company.whatsapp)}` : ''}`
    ].join('\n\n');
    res.json({
      message,
      phone: number,
      link: number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null,
      client_has_number: !!number,
      provider: whatsappProvider(),
      company_whatsapp: await companyWhatsapp()
    });
  }));

  r.post('/:id/contacts', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const b = parse(z.object({channel: z.enum(['whatsapp', 'telefone', 'email', 'presencial', 'outro']), message: optText(4000), direction: z.enum(['saida', 'entrada']).default('saida')}), req.body);
    const charge = (await db.query('select client_id from charges where id = $1', [id])).rows[0];
    if (!charge) throw new HttpError(404, 'Cobrança não encontrada');
    const a = actorOf(req);
    const {rows} = await db.query(
      `insert into contact_log (client_id, charge_id, channel, direction, message, operator_id, operator_name) values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [charge.client_id, id, b.channel, b.direction, b.message, a.id, a.name]);
    await audit(db, a, 'contact.log', 'charge', id, {channel: b.channel, manual: true});
    res.status(201).json(rows[0]);
  }));

  void addMonths;
  return r;
}

function formatContact(n: string): string {
  const d = n.replace(/^55/, '');
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : n;
}
