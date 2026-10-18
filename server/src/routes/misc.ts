import {Router} from 'express';
import {z} from 'zod';
import {audit} from '../audit.js';
import {FINANCE, actorOf, requireRole} from '../auth.js';
import type {Db} from '../db.js';
import {HttpError, asyncHandler, parse} from '../http.js';
import {cents, isoDateSchema, optText, uuid} from '../lib/sql.js';

export function expenseRoutes(db: Db) {
  const r = Router();
  r.get('/', asyncHandler(async (req, res) => {
    const vals: unknown[] = [];
    const where: string[] = [];
    for (const [p, op] of [['from', '>='], ['to', '<=']] as const) {
      const v = req.query[p];
      if (typeof v === 'string' && v) { vals.push(parse(isoDateSchema, v)); where.push(`e.competence ${op} $${vals.length}`); }
    }
    const {rows} = await db.query(
      `select e.*, s.name as system_name, c.name as client_name from expenses e
         left join systems s on s.id = e.system_id left join clients c on c.id = e.client_id
        ${where.length ? `where ${where.join(' and ')}` : ''} order by e.competence desc, e.created_at desc limit 500`, vals);
    res.json(rows);
  }));
  r.post('/', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const b = parse(z.object({category: z.string().trim().min(2).max(80), description: z.string().trim().min(2).max(300), amount_cents: cents.refine((v) => v > 0, 'Valor deve ser maior que zero'),
      competence: isoDateSchema, system_id: uuid.nullish(), client_id: uuid.nullish()}), req.body);
    const {rows} = await db.query(
      'insert into expenses (category, description, amount_cents, competence, system_id, client_id, created_by) values ($1,$2,$3,$4,$5,$6,$7) returning *',
      [b.category, b.description, b.amount_cents, b.competence, b.system_id ?? null, b.client_id ?? null, actorOf(req).id]);
    await audit(db, actorOf(req), 'expense.create', 'expense', rows[0].id, {amount_cents: b.amount_cents, category: b.category});
    res.status(201).json(rows[0]);
  }));
  r.delete('/:id', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const {rows} = await db.query('delete from expenses where id = $1 returning *', [id]);
    if (!rows[0]) throw new HttpError(404, 'Despesa não encontrada');
    await audit(db, actorOf(req), 'expense.delete', 'expense', id, rows[0]);
    res.json({deleted: true});
  }));
  return r;
}

export function companyRoutes(db: Db) {
  const r = Router();
  r.get('/', asyncHandler(async (_req, res) => {
    res.json((await db.query('select legal_name, trade_name, cnpj, site, email, whatsapp from company')).rows[0]);
  }));
  r.patch('/', requireRole('admin'), asyncHandler(async (req, res) => {
    const b = parse(z.object({email: z.string().trim().email().nullish().or(z.literal('')).transform((v) => v || null), whatsapp: optText(20), site: optText(100)}).partial(), req.body);
    const {rows} = await db.query(
      `update company set email = case when $1::boolean then $2 else email end, whatsapp = case when $3::boolean then $4 else whatsapp end,
              site = case when $5::boolean then $6 else site end, updated_at = now() returning legal_name, trade_name, cnpj, site, email, whatsapp`,
      ['email' in b, b.email ?? null, 'whatsapp' in b, b.whatsapp ?? null, 'site' in b, b.site ?? null]);
    await audit(db, actorOf(req), 'company.update', 'company', '1', b);
    res.json(rows[0]);
  }));
  return r;
}

export function auditRoutes(db: Db) {
  const r = Router();
  r.get('/', requireRole('admin', 'financeiro'), asyncHandler(async (req, res) => {
    const vals: unknown[] = [];
    const where: string[] = [];
    for (const f of ['entity', 'entity_id'] as const) {
      const v = req.query[f];
      if (typeof v === 'string' && v) { vals.push(v); where.push(`${f} = $${vals.length}`); }
    }
    const {rows} = await db.query(
      `select at, user_name, action, entity, entity_id, detail from audit_log ${where.length ? `where ${where.join(' and ')}` : ''} order by at desc limit 300`, vals);
    res.json(rows);
  }));
  return r;
}
