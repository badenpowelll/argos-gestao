import {Router} from 'express';
import {z} from 'zod';
import {audit, type Actor} from '../audit.js';
import {FINANCE, WRITERS, actorOf, requireRole} from '../auth.js';
import {withTx, type Db, type Tx} from '../db.js';
import {HttpError, asyncHandler, parse} from '../http.js';
import {isValidIsoDate} from '../lib/dates.js';
import {buildUpdate, cents, optDate, optText, uuid} from '../lib/sql.js';
import {generateCharges, itemTotal, planItemCharges, type ItemRow} from '../services/billing.js';
import {today} from '../lib/dates.js';
import {storeDocument, upload} from './documents.js';

const ITEM_KINDS = ['implementacao', 'desenvolvimento', 'licenca', 'mensalidade', 'hospedagem', 'dominio', 'treinamento', 'suporte', 'outro'] as const;
const BILLING = ['unico', 'recorrente', 'parcelado', 'por_usuario', 'sob_demanda'] as const;

export const itemSchema = z
  .object({
    kind: z.enum(ITEM_KINDS),
    description: z.string().trim().min(2).max(300),
    billing_type: z.enum(BILLING),
    unit_amount_cents: cents,
    quantity: z.number().positive().max(100000).default(1),
    installments: z.number().int().min(1).max(120).nullish().transform((v) => v ?? null),
    interval_months: z.number().int().min(1).max(36).default(1),
    first_due_date: optDate,
    discount_cents: cents.default(0),
    active: z.boolean().default(true),
    notes: optText(1000),
    position: z.number().int().default(0)
  })
  .superRefine((v, ctx) => {
    if (v.billing_type === 'parcelado' && !v.installments) ctx.addIssue({code: 'custom', path: ['installments'], message: 'Informe o número de parcelas'});
    if (v.discount_cents > Math.round(v.unit_amount_cents * v.quantity)) ctx.addIssue({code: 'custom', path: ['discount_cents'], message: 'Desconto maior que o valor'});
  });
const ITEM_COLS = ['kind', 'description', 'billing_type', 'unit_amount_cents', 'quantity', 'installments', 'interval_months', 'first_due_date', 'discount_cents', 'active', 'notes', 'position'] as const;

const contractBase = z.object({
  client_id: uuid,
  system_id: uuid.nullish().transform((v) => v ?? null),
  parent_contract_id: uuid.nullish().transform((v) => v ?? null),
  kind: z.enum(['proposta', 'contrato', 'aditivo']),
  object: optText(4000),
  signed_at: optDate,
  start_date: optDate,
  end_date: optDate,
  auto_renew: z.boolean().default(false),
  adjustment_index: optText(60),
  adjustment_month: z.number().int().min(1).max(12).nullish().transform((v) => v ?? null),
  payment_terms: optText(2000),
  due_day: z.number().int().min(1).max(31).nullish().transform((v) => v ?? null),
  fine_percent: z.number().min(0).max(100).default(0),
  interest_monthly_percent: z.number().min(0).max(100).default(0),
  is_public_flow: z.boolean().default(false),
  administrative_process: optText(100),
  commitment_number: optText(100),
  notes: optText(4000),
  source_document_id: uuid.nullish().transform((v) => v ?? null)
});
const dateOrder = (v: {start_date?: string | null; end_date?: string | null}) => !v.start_date || !v.end_date || v.start_date <= v.end_date;
export const contractSchema = contractBase.refine(dateOrder, {message: 'Fim da vigência anterior ao início', path: ['end_date']});
const CONTRACT_COLS = [
  'client_id', 'system_id', 'parent_contract_id', 'object', 'signed_at', 'start_date', 'end_date', 'auto_renew', 'adjustment_index',
  'adjustment_month', 'payment_terms', 'due_day', 'fine_percent', 'interest_monthly_percent', 'is_public_flow',
  'administrative_process', 'commitment_number', 'notes'
] as const;

/** Cria contrato + itens numa transação; usado pela API e pela confirmação de importação. */
export async function insertContract(
  tx: Tx,
  actor: Actor,
  data: z.infer<typeof contractSchema>,
  items: z.infer<typeof itemSchema>[]
) {
  const parent = data.kind === 'aditivo';
  if (parent && !data.parent_contract_id) throw new HttpError(422, 'Aditivo precisa estar vinculado a um contrato', 'missing_parent');
  if (data.system_id) {
    const s = await tx.query('select client_id from systems where id = $1', [data.system_id]);
    if (!s.rows[0] || s.rows[0].client_id !== data.client_id) throw new HttpError(422, 'O sistema não pertence a este cliente');
  }
  const seq = (await tx.query("select nextval('contract_number_seq')::int as n")).rows[0].n;
  const prefix = data.kind === 'proposta' ? 'PRP' : data.kind === 'aditivo' ? 'ADT' : 'CTR';
  const number = `${prefix}-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;
  const status = data.kind === 'proposta' ? 'proposta' : 'rascunho';
  const cols = ['number', 'kind', 'status', 'source_document_id', 'created_by', ...CONTRACT_COLS];
  const {rows} = await tx.query(
    `insert into contracts (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) returning *`,
    [number, data.kind, status, data.source_document_id, actor.id, ...CONTRACT_COLS.map((k) => data[k])]
  );
  const contract = rows[0];
  for (const [i, it] of items.entries()) {
    await tx.query(
      `insert into contract_items (contract_id, ${ITEM_COLS.join(',')}) values ($1, ${ITEM_COLS.map((_, j) => `$${j + 2}`).join(',')})`,
      [contract.id, ...ITEM_COLS.map((k) => (k === 'position' ? i : it[k]))]
    );
  }
  if (data.source_document_id) {
    await tx.query('update documents set contract_id = $2, client_id = $3 where id = $1', [data.source_document_id, contract.id, data.client_id]);
  }
  await audit(tx, actor, 'contract.create', 'contract', contract.id, {number, kind: data.kind, items: items.length});
  return contract;
}

async function loadContract(db: Db | Tx, id: string) {
  const c = (await db.query(
    `select c.*, cl.name as client_name, s.name as system_name from contracts c
       join clients cl on cl.id = c.client_id left join systems s on s.id = c.system_id where c.id = $1`, [id])).rows[0];
  if (!c) throw new HttpError(404, 'Contrato não encontrado');
  return c;
}

export function contractRoutes(db: Db) {
  const r = Router();

  r.get('/', asyncHandler(async (req, res) => {
    const where: string[] = [];
    const vals: unknown[] = [];
    for (const f of ['client_id', 'status', 'kind'] as const) {
      const v = req.query[f];
      if (typeof v === 'string' && v) {
        vals.push(f === 'client_id' ? parse(uuid, v) : v);
        where.push(`c.${f} = $${vals.length}`);
      }
    }
    const {rows} = await db.query(
      `select c.id, c.number, c.kind, c.status, c.object, c.start_date, c.end_date, c.signed_at, c.client_id,
              cl.name as client_name, s.name as system_name,
              (select coalesce(round(sum((i.unit_amount_cents * i.quantity - i.discount_cents) / i.interval_months)),0)::bigint
                 from contract_items i where i.contract_id = c.id and i.active and i.billing_type in ('recorrente','por_usuario')) as monthly_cents
         from contracts c join clients cl on cl.id = c.client_id left join systems s on s.id = c.system_id
        ${where.length ? `where ${where.join(' and ')}` : ''} order by c.created_at desc limit 500`,
      vals
    );
    res.json(rows);
  }));

  r.post('/', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const body = parse(z.object({contract: contractSchema, items: z.array(itemSchema).default([])}), req.body);
    const actor = actorOf(req);
    const created = await withTx(db, (tx) => insertContract(tx, actor, body.contract, body.items));
    res.status(201).json(created);
  }));

  r.get('/:id', asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const contract = await loadContract(db, id);
    const [items, charges, history, docs] = await Promise.all([
      db.query('select * from contract_items where contract_id = $1 order by position, created_at', [id]),
      db.query(
        `select status, count(*)::int as n, coalesce(sum(amount_cents - discount_cents + interest_cents + fine_cents),0)::bigint as total_cents,
                coalesce(sum(paid_cents),0)::bigint as paid_cents from charges where contract_id = $1 group by status`, [id]),
      db.query(
        `select at, user_name, action, detail from audit_log
          where (entity = 'contract' and entity_id = $1) order by at desc limit 200`, [id]),
      db.query('select id, kind, filename, mime, size_bytes, created_at from documents where contract_id = $1 order by created_at', [id])
    ]);
    res.json({contract, items: items.rows, charge_summary: charges.rows, history: history.rows, documents: docs.rows});
  }));

  r.patch('/:id', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const actor = actorOf(req);
    const d = parse(contractBase.partial(), req.body);
    const before = await loadContract(db, id);
    if (before.status === 'encerrado' || before.status === 'cancelado') throw new HttpError(409, 'Contrato encerrado/cancelado não pode ser alterado');
    const merged = {start_date: d.start_date !== undefined ? d.start_date : before.start_date, end_date: d.end_date !== undefined ? d.end_date : before.end_date};
    if (!dateOrder(merged)) throw new HttpError(422, 'Fim da vigência anterior ao início');
    const q = buildUpdate('contracts', id, d, CONTRACT_COLS);
    const {rows} = await db.query(q.text, q.values);
    const changed: Record<string, {from: unknown; to: unknown}> = {};
    for (const k of Object.keys(d) as (keyof typeof d)[]) if (before[k] !== d[k]) changed[k] = {from: before[k], to: d[k]};
    await audit(db, actor, 'contract.update', 'contract', id, {changed});
    res.json(rows[0]);
  }));

  // ---- itens
  r.post('/:id/items', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const item = parse(itemSchema, req.body);
    await loadContract(db, id);
    const {rows} = await db.query(
      `insert into contract_items (contract_id, ${ITEM_COLS.join(',')}) values ($1, ${ITEM_COLS.map((_, j) => `$${j + 2}`).join(',')}) returning *`,
      [id, ...ITEM_COLS.map((k) => item[k])]
    );
    await audit(db, actorOf(req), 'contract.item_add', 'contract', id, {item: rows[0].id, description: item.description, amount_cents: itemTotal(item)});
    res.status(201).json(rows[0]);
  }));

  r.patch('/:id/items/:itemId', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const itemId = parse(uuid, req.params.itemId);
    const d = parse(z.object({
      description: z.string().trim().min(2).max(300), unit_amount_cents: cents, quantity: z.number().positive().max(100000),
      installments: z.number().int().min(1).max(120).nullable(), interval_months: z.number().int().min(1).max(36),
      first_due_date: optDate, discount_cents: cents, active: z.boolean(), notes: optText(1000)
    }).partial(), req.body);
    const before = (await db.query('select * from contract_items where id = $1 and contract_id = $2', [itemId, id])).rows[0];
    if (!before) throw new HttpError(404, 'Item não encontrado');
    const keys = Object.keys(d);
    const sets = keys.map((k, i) => `${k} = $${i + 3}`).join(', ');
    if (!keys.length) throw new HttpError(422, 'Nada para atualizar');
    const allowed = new Set(['description', 'unit_amount_cents', 'quantity', 'installments', 'interval_months', 'first_due_date', 'discount_cents', 'active', 'notes']);
    if (keys.some((k) => !allowed.has(k))) throw new HttpError(422, 'Campo inválido');
    const {rows} = await db.query(`update contract_items set ${sets} where id = $1 and contract_id = $2 returning *`, [itemId, id, ...keys.map((k) => (d as Record<string, unknown>)[k])]);
    await audit(db, actorOf(req), 'contract.item_update', 'contract', id, {item: itemId, before: Object.fromEntries(keys.map((k) => [k, before[k]])), after: d,
      note: 'Cobranças já geradas não são alteradas; valem para as próximas.'});
    res.json(rows[0]);
  }));

  r.delete('/:id/items/:itemId', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const itemId = parse(uuid, req.params.itemId);
    const used = (await db.query('select 1 from charges where contract_item_id = $1 limit 1', [itemId])).rowCount;
    if (used) {
      await db.query('update contract_items set active = false where id = $1 and contract_id = $2', [itemId, id]);
      await audit(db, actorOf(req), 'contract.item_deactivate', 'contract', id, {item: itemId});
      return res.json({deactivated: true});
    }
    await db.query('delete from contract_items where id = $1 and contract_id = $2', [itemId, id]);
    await audit(db, actorOf(req), 'contract.item_remove', 'contract', id, {item: itemId});
    res.json({deleted: true});
  }));

  // ---- fluxo: proposta -> contrato -> ativo
  r.post('/:id/approve-proposal', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const b = parse(z.object({signed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: optText(500), confirm: z.literal(true)}), req.body);
    if (!isValidIsoDate(b.signed_at)) throw new HttpError(422, 'Data de aprovação inválida');
    const c = await loadContract(db, id);
    if (c.kind !== 'proposta') throw new HttpError(409, 'Somente propostas podem ser aprovadas');
    const {rows} = await db.query(
      `update contracts set kind='contrato', status='rascunho', signed_at=$2, approved_at=now(), updated_at=now(),
              number = replace(number,'PRP-','CTR-') where id = $1 returning *`, [id, b.signed_at]);
    await audit(db, actorOf(req), 'contract.approve_proposal', 'contract', id, {signed_at: b.signed_at, note: b.note});
    res.json(rows[0]);
  }));

  // Atalho do dia a dia: aprova a proposta (se for proposta), completa vencimentos e ATIVA gerando as cobranças — numa só transação.
  r.post('/:id/approve-and-activate', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const b = parse(z.object({
      confirm: z.literal(true, {errorMap: () => ({message: 'Confirmação explícita obrigatória'})}),
      signed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      entry_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      monthly_first_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      due_day: z.number().int().min(1).max(31).nullish()
    }), req.body);
    for (const d of [b.signed_at, b.entry_due_date, b.monthly_first_due_date]) if (d && !isValidIsoDate(d)) throw new HttpError(422, 'Data inválida');
    const actor = actorOf(req);
    const out = await withTx(db, async (tx) => {
      const c = (await tx.query('select * from contracts where id = $1 for update', [id])).rows[0];
      if (!c) throw new HttpError(404, 'Contrato não encontrado');
      if (['ativo', 'encerrado', 'cancelado'].includes(c.status)) throw new HttpError(409, `Documento com status "${c.status}" não pode ser aprovado/ativado`);
      if (c.kind === 'proposta') {
        await tx.query("update contracts set kind = 'contrato', status = 'rascunho', signed_at = $2, approved_at = now(), number = replace(number, 'PRP-', 'CTR-'), updated_at = now() where id = $1", [id, b.signed_at]);
        await audit(tx, actor, 'contract.approve_proposal', 'contract', id, {signed_at: b.signed_at, via: 'approve-and-activate'});
      } else if (!c.signed_at) {
        await tx.query('update contracts set signed_at = $2 where id = $1', [id, b.signed_at]);
      }
      const items = (await tx.query<ItemRow>('select * from contract_items where contract_id = $1 and active', [id])).rows;
      if (!items.length) throw new HttpError(422, 'O documento não possui itens de cobrança', 'no_items');
      for (const it of items) {
        if (it.first_due_date || it.billing_type === 'sob_demanda') continue;
        const date = it.billing_type === 'unico' || it.billing_type === 'parcelado' ? b.entry_due_date : b.monthly_first_due_date;
        if (!date) throw new HttpError(422, `Informe o vencimento de "${it.description}"`, 'missing_due_date');
        await tx.query('update contract_items set first_due_date = $2 where id = $1', [it.id, date]);
      }
      if (b.due_day) await tx.query('update contracts set due_day = $2 where id = $1', [id, b.due_day]);
      const fresh = (await tx.query('select * from contracts where id = $1', [id])).rows[0];
      const planItems = (await tx.query<ItemRow>('select * from contract_items where contract_id = $1 and active', [id])).rows;
      for (const it of planItems) planItemCharges(it, {horizon: today(), contractStart: fresh.start_date, contractEnd: fresh.end_date, dueDay: fresh.due_day});
      await tx.query("update contracts set status = 'ativo', activated_at = now(), activated_by = $2, updated_at = now() where id = $1", [id, actor.id]);
      await audit(tx, actor, 'contract.activate', 'contract', id, {items: planItems.length, via: 'approve-and-activate'});
      return generateCharges(tx, id, actor);
    });
    res.json({status: 'ativo', ...out});
  }));

  r.post('/:id/activate', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const b = parse(z.object({confirm: z.literal(true, {errorMap: () => ({message: 'Confirmação explícita obrigatória'})}), generate: z.boolean().default(true)}), req.body);
    const actor = actorOf(req);
    const result = await withTx(db, async (tx) => {
      const c = (await tx.query('select * from contracts where id = $1 for update', [id])).rows[0];
      if (!c) throw new HttpError(404, 'Contrato não encontrado');
      if (c.kind === 'proposta') throw new HttpError(409, 'Proposta não ativa cobrança: aprove-a e converta em contrato assinado primeiro', 'is_proposal');
      if (c.status !== 'rascunho' && c.status !== 'suspenso') throw new HttpError(409, `Contrato com status "${c.status}" não pode ser ativado`);
      if (!c.signed_at) throw new HttpError(422, 'Informe a data de assinatura antes de ativar', 'missing_signed_at');
      const items = (await tx.query<ItemRow>('select * from contract_items where contract_id = $1 and active', [id])).rows;
      if (!items.length) throw new HttpError(422, 'O contrato não possui itens', 'no_items');
      // valida planejamento (vencimentos/valores) antes de ativar
      for (const it of items) planItemCharges(it, {horizon: today(), contractStart: c.start_date, contractEnd: c.end_date, dueDay: c.due_day});
      await tx.query("update contracts set status='ativo', activated_at=now(), activated_by=$2, updated_at=now() where id=$1", [id, actor.id]);
      await audit(tx, actor, 'contract.activate', 'contract', id, {items: items.length});
      const gen = b.generate ? await generateCharges(tx, id, actor) : {created: 0, skipped: 0};
      return gen;
    });
    res.json({status: 'ativo', ...result});
  }));

  r.post('/:id/generate-charges', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const b = parse(z.object({horizon_months: z.number().int().min(1).max(36).default(12)}), req.body ?? {});
    const actor = actorOf(req);
    res.json(await withTx(db, (tx) => generateCharges(tx, id, actor, {horizonMonths: b.horizon_months})));
  }));

  r.post('/:id/status', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const b = parse(z.object({status: z.enum(['suspenso', 'encerrado', 'cancelado']), reason: z.string().trim().min(5).max(500)}), req.body);
    const actor = actorOf(req);
    await withTx(db, async (tx) => {
      const c = (await tx.query('select status, kind from contracts where id = $1 for update', [id])).rows[0];
      if (!c) throw new HttpError(404, 'Contrato não encontrado');
      if (c.status === 'encerrado' || c.status === 'cancelado') throw new HttpError(409, 'Contrato já finalizado');
      await tx.query('update contracts set status=$2, updated_at=now() where id=$1', [id, b.status]);
      if (b.status !== 'suspenso') {
        // cobranças futuras sem pagamento deixam de existir; as demais permanecem para cobrança
        await tx.query(
          `update charges set status='cancelada', cancelled_reason=$2, updated_at=now()
            where contract_id=$1 and status='pendente' and paid_cents=0 and due_date > $3::date`,
          [id, `Contrato ${b.status}: ${b.reason}`, today()]
        );
      }
      await audit(tx, actor, 'contract.status', 'contract', id, {from: c.status, to: b.status, reason: b.reason});
    });
    res.json({ok: true});
  }));

  r.post('/:id/documents', requireRole(...WRITERS), upload.single('file'), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    if (!req.file) throw new HttpError(422, 'Envie um arquivo');
    const c = await loadContract(db, id);
    const {doc} = await storeDocument(db, req.file, {kind: 'anexo', userId: actorOf(req).id, clientId: c.client_id, contractId: id});
    await audit(db, actorOf(req), 'contract.attach', 'contract', id, {document: doc.id, filename: doc.filename});
    res.status(201).json(doc);
  }));

  return r;
}
