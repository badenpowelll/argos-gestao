import {Router} from 'express';
import {z} from 'zod';
import {audit} from '../audit.js';
import {WRITERS, actorOf, requireRole} from '../auth.js';
import type {Db, Tx} from '../db.js';
import {HttpError, asyncHandler, parse} from '../http.js';
import {isValidCnpj, isValidCpf, onlyDigits} from '../lib/documents.js';
import {today} from '../lib/dates.js';
import {buildUpdate, optText, uuid} from '../lib/sql.js';

const kind = z.enum(['pessoa_fisica', 'empresa_privada', 'orgao_publico']);

export const clientSchema = z.object({
  kind,
  name: z.string().trim().min(2, 'Informe o nome/razão social').max(200),
  trade_name: optText(200),
  document: z.string().trim().max(20).nullish().transform((v) => (v ? onlyDigits(v) : null)),
  email: z.string().trim().email('E-mail inválido').max(200).nullish().or(z.literal('')).transform((v) => v || null),
  phone: optText(30),
  whatsapp: optText(30),
  zip: optText(12), street: optText(200), number: optText(20), complement: optText(100),
  district: optText(100), city: optText(100), state: z.string().trim().max(2).nullish().transform((v) => (v ? v.toUpperCase() : null)),
  responsible_name: optText(150), responsible_role: optText(100), sector: optText(150),
  public_sphere: z.enum(['municipal', 'estadual', 'federal']).nullish().transform((v) => v ?? null),
  notes: optText(4000),
  status: z.enum(['prospecto', 'ativo', 'inativo']).default('ativo')
});

function checkDocument(k: string, doc: string | null) {
  if (!doc) return;
  if (k === 'pessoa_fisica' ? !isValidCpf(doc) : !isValidCnpj(doc)) {
    throw new HttpError(422, k === 'pessoa_fisica' ? 'CPF inválido' : 'CNPJ inválido', 'invalid_document');
  }
}

export const CLIENT_COLS = [
  'kind', 'name', 'trade_name', 'document', 'email', 'phone', 'whatsapp', 'zip', 'street', 'number', 'complement',
  'district', 'city', 'state', 'responsible_name', 'responsible_role', 'sector', 'public_sphere', 'notes', 'status'
] as const;

/** Cria cliente dentro de uma transação já aberta (usado também pela importação de contratos). */
export async function insertClient(tx: Db | Tx, actor: ReturnType<typeof actorOf>, data: z.infer<typeof clientSchema>) {
  checkDocument(data.kind, data.document);
  const keys = CLIENT_COLS.filter((k) => k !== 'status');
  const {rows} = await tx.query(
    `insert into clients (${[...keys, 'status', 'created_by'].join(',')})
     values (${[...keys, 'status', 'created_by'].map((_, i) => `$${i + 1}`).join(',')}) returning *`,
    [...keys.map((k) => data[k]), data.status, actor.id]
  );
  await audit(tx, actor, 'client.create', 'client', rows[0].id, {name: data.name, document: data.document});
  return rows[0];
}

export function clientRoutes(db: Db) {
  const r = Router();

  r.get('/', asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const where: string[] = [];
    const vals: unknown[] = [today()];
    if (q) {
      vals.push(`%${q.toLowerCase()}%`, `%${onlyDigits(q)}%`);
      where.push(`(lower(c.name) like $2 or lower(coalesce(c.trade_name,'')) like $2 or (length($3) > 2 and c.document like $3))`);
    }
    for (const f of ['kind', 'status'] as const) {
      if (typeof req.query[f] === 'string' && req.query[f]) {
        vals.push(req.query[f]);
        where.push(`c.${f} = $${vals.length}`);
      }
    }
    // $1 = hoje; $2/$3 só existem com busca. Ajusta para não deixar parâmetros sem uso.
    const sql = `
      select c.*,
        (select count(*)::int from contracts k where k.client_id = c.id and k.status = 'ativo') as active_contracts,
        (select count(*)::int from systems s where s.client_id = c.id) as systems_count,
        (select coalesce(sum(h.amount_cents - h.discount_cents + h.interest_cents + h.fine_cents - h.paid_cents),0)::bigint
           from charges h where h.client_id = c.id and h.status in ('pendente','parcial')) as open_balance_cents,
        (select coalesce(sum(h.amount_cents - h.discount_cents + h.interest_cents + h.fine_cents - h.paid_cents),0)::bigint
           from charges h where h.client_id = c.id and h.status in ('pendente','parcial') and h.due_date < $1::date) as overdue_cents
      from clients c ${where.length ? `where ${where.join(' and ')}` : ''} order by lower(c.name) limit 500`;
    res.json((await db.query(sql, vals)).rows);
  }));

  r.post('/', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const data = parse(clientSchema, req.body);
    res.status(201).json(await insertClient(db, actorOf(req), data));
  }));

  r.get('/:id', asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const client = (await db.query('select * from clients where id = $1', [id])).rows[0];
    if (!client) throw new HttpError(404, 'Cliente não encontrado');
    const [contracts, systems, contacts, balance] = await Promise.all([
      db.query(`select id, number, kind, status, object, start_date, end_date, system_id from contracts where client_id = $1 order by created_at desc`, [id]),
      db.query('select * from systems where client_id = $1 order by name', [id]),
      db.query('select * from contact_log where client_id = $1 order by created_at desc limit 100', [id]),
      db.query(
        `select coalesce(sum(case when status in ('pendente','parcial') then amount_cents - discount_cents + interest_cents + fine_cents - paid_cents end),0)::bigint as open_cents,
                coalesce(sum(case when status in ('pendente','parcial') and due_date < $2::date then amount_cents - discount_cents + interest_cents + fine_cents - paid_cents end),0)::bigint as overdue_cents,
                coalesce(sum(paid_cents),0)::bigint as paid_cents
           from charges where client_id = $1`,
        [id, today()]
      )
    ]);
    res.json({client, contracts: contracts.rows, systems: systems.rows, contacts: contacts.rows, balance: balance.rows[0]});
  }));

  r.patch('/:id', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const data = parse(clientSchema.partial(), req.body);
    const before = (await db.query('select * from clients where id = $1', [id])).rows[0];
    if (!before) throw new HttpError(404, 'Cliente não encontrado');
    checkDocument(data.kind ?? before.kind, data.document !== undefined ? data.document : before.document);
    const q = buildUpdate('clients', id, data, CLIENT_COLS);
    const {rows} = await db.query(q.text, q.values);
    await audit(db, actorOf(req), 'client.update', 'client', id, {changed: Object.keys(data)});
    res.json(rows[0]);
  }));

  return r;
}
