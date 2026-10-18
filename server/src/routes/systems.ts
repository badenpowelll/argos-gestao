import {Router} from 'express';
import {z} from 'zod';
import {audit} from '../audit.js';
import {WRITERS, actorOf, requireRole} from '../auth.js';
import type {Db} from '../db.js';
import {HttpError, asyncHandler, parse} from '../http.js';
import {buildUpdate, cents, optDate, optText, uuid} from '../lib/sql.js';

export const systemSchema = z.object({
  client_id: uuid,
  name: z.string().trim().min(2).max(200),
  description: optText(2000),
  access_url: z.string().trim().max(500).nullish().refine((v) => !v || /^https?:\/\//i.test(v), 'URL deve começar com http:// ou https://').transform((v) => v || null),
  domain: optText(200),
  infrastructure: optText(300),
  database_info: optText(300), // tipo/provedor do banco — NUNCA senhas ou strings de conexão
  version: optText(50),
  delivered_at: optDate,
  implemented_at: optDate,
  maintenance_until: optDate,
  support_until: optDate,
  operational_cost_cents: cents.default(0),
  status: z.enum(['em_desenvolvimento', 'em_producao', 'manutencao', 'suspenso', 'descontinuado']).default('em_desenvolvimento')
});
const COLS = [
  'client_id', 'name', 'description', 'access_url', 'domain', 'infrastructure', 'database_info', 'version',
  'delivered_at', 'implemented_at', 'maintenance_until', 'support_until', 'operational_cost_cents', 'status'
] as const;

export function systemRoutes(db: Db) {
  const r = Router();

  r.get('/', asyncHandler(async (req, res) => {
    const vals: unknown[] = [];
    let where = '';
    if (typeof req.query.client_id === 'string' && req.query.client_id) {
      vals.push(parse(uuid, req.query.client_id));
      where = 'where s.client_id = $1';
    }
    const {rows} = await db.query(
      `select s.*, c.name as client_name,
              (select count(*)::int from contracts k where k.system_id = s.id and k.status = 'ativo') as active_contracts
         from systems s join clients c on c.id = s.client_id ${where} order by lower(s.name)`,
      vals
    );
    res.json(rows);
  }));

  r.post('/', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const d = parse(systemSchema, req.body);
    const {rows} = await db.query(
      `insert into systems (${COLS.join(',')}) values (${COLS.map((_, i) => `$${i + 1}`).join(',')}) returning *`,
      COLS.map((k) => d[k])
    );
    await audit(db, actorOf(req), 'system.create', 'system', rows[0].id, {name: d.name, client_id: d.client_id});
    res.status(201).json(rows[0]);
  }));

  r.get('/:id', asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const {rows} = await db.query('select s.*, c.name as client_name from systems s join clients c on c.id = s.client_id where s.id = $1', [id]);
    if (!rows[0]) throw new HttpError(404, 'Sistema não encontrado');
    res.json(rows[0]);
  }));

  r.patch('/:id', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const d = parse(systemSchema.partial(), req.body);
    const q = buildUpdate('systems', id, d, COLS);
    const {rows} = await db.query(q.text, q.values);
    if (!rows[0]) throw new HttpError(404, 'Sistema não encontrado');
    await audit(db, actorOf(req), 'system.update', 'system', id, {changed: Object.keys(d)});
    res.json(rows[0]);
  }));

  return r;
}
