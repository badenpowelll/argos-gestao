import {Router} from 'express';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import {analyzeSite, UnsafeUrlError} from '../analyze/site.js';
import {audit} from '../audit.js';
import {ADMIN, FINANCE, actorOf, requireRole} from '../auth.js';
import type {Db} from '../db.js';
import {HttpError, asyncHandler, parse} from '../http.js';
import {today} from '../lib/dates.js';
import {buildUpdate, isoDateSchema, optDate, optText, uuid} from '../lib/sql.js';
import {proposalContentSchema} from '../pricing/content.js';
import {computeProposal} from '../pricing/compute.js';
import {currentTax, fetchEcbRates, latestFx, loadCatalog, loadCompany, loadSettings} from '../pricing/data.js';
import {buildPixPayload, validatePixKey, validatePixPayload} from '../pricing/pix.js';

export const GOOGLE_HOSTS = /^(https:\/\/)(g\.page|g\.co|share\.google|maps\.app\.goo\.gl|goo\.gl|search\.google\.com|www\.google\.com\/maps|google\.com\/maps|maps\.google\.com|www\.google\.com\/search|g\.page)(\/|$|\?)/i;

const catalogSchema = z.object({
  name: z.string().trim().min(2).max(150),
  vendor: optText(100), plan: optText(100),
  category: z.enum(['ferramenta', 'infra', 'dominio', 'email', 'outro']),
  price_cents: z.number().int().min(0).max(1_000_000_000).nullable(),
  currency: z.enum(['BRL', 'USD', 'EUR']),
  periodicity: z.enum(['mensal', 'anual', 'bienal', 'trienal', 'quadrienal', 'unica']),
  projects_served: z.number().int().min(1).max(1000),
  allocation_pct: z.number().min(0).max(100).nullable(),
  included_in_id: uuid.nullable(),
  price_verified: z.boolean(),
  source: optText(300), verified_at: optDate, notes: optText(500), active: z.boolean()
});
const CATALOG_COLS = ['name', 'vendor', 'plan', 'category', 'price_cents', 'currency', 'periodicity', 'projects_served', 'allocation_pct', 'included_in_id', 'price_verified', 'source', 'verified_at', 'notes', 'active'] as const;

const taxSchema = z.object({
  name: z.string().trim().min(2).max(120),
  regime: z.string().trim().min(2).max(120),
  initial_rate_pct: z.number().min(0).max(100).nullable(),
  recurring_rate_pct: z.number().min(0).max(100).nullable(),
  base: z.enum(['receita_bruta', 'receita_liquida', 'outra']).default('receita_bruta'),
  valid_from: isoDateSchema, valid_to: optDate, notes: optText(600)
});

export function pricingRoutes(db: Db, fetchFn: typeof fetch = fetch) {
  const r = Router();

  // ---- parâmetros gerais
  r.get('/settings', asyncHandler(async (_req, res) => res.json(await loadSettings(db))));
  r.patch('/settings', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const b = parse(z.object({
      hourly_rate_cents: z.number().int().min(0), min_dev_hours: z.number().min(0), validity_days: z.number().int().min(1).max(365), default_margin_pct: z.number().min(0).max(99),
      card_fees: z.array(z.object({installments: z.number().int().min(1).max(24), fee_pct: z.number().min(0).max(50), source: z.string().max(200).optional()})).max(30)
    }).partial(), req.body);
    const before = await loadSettings(db);
    const next = {...before, ...b};
    await db.query('update pricing_settings set hourly_rate_cents=$1, min_dev_hours=$2, validity_days=$3, default_margin_pct=$4, card_fees=$5, updated_at=now()',
      [next.hourly_rate_cents, next.min_dev_hours, next.validity_days, next.default_margin_pct, JSON.stringify(next.card_fees)]);
    await audit(db, actorOf(req), 'pricing.settings', 'pricing_settings', '1', {before, after: next});
    res.json(next);
  }));

  // ---- dados institucionais para a proposta (pagamento, Pix, avaliação Google)
  r.get('/profile', asyncHandler(async (_req, res) => {
    res.json(await loadCompany(db));
  }));
  r.patch('/profile', requireRole(...ADMIN), asyncHandler(async (req, res) => {
    const b = parse(z.object({
      address: optText(300), phone: optText(30), email: z.string().trim().email().nullish().or(z.literal('')).transform((v) => v || null), bank_name: optText(80), bank_agency: optText(20), bank_account: optText(30),
      pix_key_cnpj: optText(80), pix_key_random: optText(80), pix_receiver_name: optText(25), pix_city: optText(15), google_review_url: optText(500),
      responsible_name: optText(150), responsible_role: optText(100)
    }).partial(), req.body);
    for (const k of ['pix_key_cnpj', 'pix_key_random'] as const) if (b[k] && !validatePixKey(b[k] as string)) throw new HttpError(422, `Chave Pix inválida (${k})`);
    if (b.google_review_url && !GOOGLE_HOSTS.test(b.google_review_url)) {
      throw new HttpError(422, 'O link de avaliação deve ser um endereço oficial do Google (g.page, share.google, maps.app.goo.gl, search.google.com ou google.com/maps).');
    }
    const keys = Object.keys(b) as (keyof typeof b)[];
    if (!keys.length) throw new HttpError(422, 'Nada para atualizar');
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const before = await loadCompany(db);
    await db.query(`update company set ${sets}, updated_at = now()`, keys.map((k) => b[k]));
    await audit(db, actorOf(req), 'company.profile', 'company', '1', {changed: keys, before: Object.fromEntries(keys.map((k) => [k, (before as Record<string, unknown>)[k]]))});
    res.json(await loadCompany(db));
  }));

  // ---- câmbio
  r.get('/fx', asyncHandler(async (_req, res) => {
    const [latest, history] = await Promise.all([latestFx(db), db.query('select id, currency, rate::float8 as rate, as_of::text as as_of, source, manual, created_at from fx_rates order by created_at desc limit 50')]);
    res.json({latest, history: history.rows});
  }));
  r.post('/fx', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const b = parse(z.object({currency: z.enum(['USD', 'EUR']), rate: z.number().positive().max(1000), as_of: isoDateSchema, source: z.string().trim().min(3).max(200)}), req.body);
    const {rows} = await db.query('insert into fx_rates (currency, rate, as_of, source, manual, created_by) values ($1,$2,$3,$4,true,$5) returning id', [b.currency, b.rate, b.as_of, b.source, actorOf(req).id]);
    await audit(db, actorOf(req), 'fx.manual', 'fx', rows[0].id, b);
    res.status(201).json({id: rows[0].id});
  }));
  r.post('/fx/refresh', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    let rates;
    try { rates = await fetchEcbRates(fetchFn); } catch (e) { throw new HttpError(502, `Não foi possível consultar a cotação: ${(e as Error).message}. Informe manualmente.`, 'fx_unavailable'); }
    for (const x of rates) await db.query('insert into fx_rates (currency, rate, as_of, source, manual, created_by) values ($1,$2,$3,$4,false,$5)', [x.currency, x.rate, x.as_of, x.source, actorOf(req).id]);
    await audit(db, actorOf(req), 'fx.refresh', 'fx', null, rates);
    res.json({rates});
  }));

  // ---- tributos (nunca presumidos; só valem após validação)
  r.get('/tax', asyncHandler(async (_req, res) => {
    const {rows} = await db.query(`select id, name, regime, initial_rate_pct::float8 as initial_rate_pct, recurring_rate_pct::float8 as recurring_rate_pct, base, valid_from::text as valid_from, valid_to::text as valid_to, notes, validated_at, validated_by_name, validation_ref, active from tax_configs order by valid_from desc, created_at desc`);
    res.json({configs: rows, current: await currentTax(db, today())});
  }));
  r.post('/tax', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const b = parse(taxSchema, req.body);
    const {rows} = await db.query('insert into tax_configs (name, regime, initial_rate_pct, recurring_rate_pct, base, valid_from, valid_to, notes, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id',
      [b.name, b.regime, b.initial_rate_pct, b.recurring_rate_pct, b.base, b.valid_from, b.valid_to, b.notes, actorOf(req).id]);
    await audit(db, actorOf(req), 'tax.create', 'tax_config', rows[0].id, b);
    res.status(201).json({id: rows[0].id, validated: false});
  }));
  r.patch('/tax/:id', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const b = parse(taxSchema.partial().extend({active: z.boolean().optional()}), req.body);
    const before = (await db.query('select * from tax_configs where id = $1', [id])).rows[0];
    if (!before) throw new HttpError(404, 'Configuração não encontrada');
    const q = buildUpdate('tax_configs', id, b, ['name', 'regime', 'initial_rate_pct', 'recurring_rate_pct', 'base', 'valid_from', 'valid_to', 'notes', 'active']);
    const {rows} = await db.query(q.text.replace(', updated_at = now()', ''), q.values);
    // alterar alíquota/base/vigência revoga a validação: a contabilidade precisa validar de novo
    const material = ['initial_rate_pct', 'recurring_rate_pct', 'base', 'valid_from', 'valid_to', 'regime'].some((k) => k in b);
    if (material && before.validated_at) {
      await db.query('update tax_configs set validated_at = null, validated_by_name = null, validation_ref = null where id = $1', [id]);
      await audit(db, actorOf(req), 'tax.validation_revoked', 'tax_config', id, {reason: 'alteração de parâmetros'});
    }
    await audit(db, actorOf(req), 'tax.update', 'tax_config', id, {before: {rate_i: before.initial_rate_pct, rate_r: before.recurring_rate_pct}, after: b});
    res.json(rows[0]);
  }));
  r.post('/tax/:id/validate', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const b = parse(z.object({validated_by_name: z.string().trim().min(3).max(150), validation_ref: z.string().trim().min(3).max(300), confirm: z.literal(true)}), req.body);
    const cfg = (await db.query('select initial_rate_pct, recurring_rate_pct from tax_configs where id = $1', [id])).rows[0];
    if (!cfg) throw new HttpError(404, 'Configuração não encontrada');
    if (cfg.initial_rate_pct === null || cfg.recurring_rate_pct === null) throw new HttpError(422, 'Informe as alíquotas inicial e recorrente antes de validar');
    await db.query('update tax_configs set validated_at = now(), validated_by_name = $2, validation_ref = $3 where id = $1', [id, b.validated_by_name, b.validation_ref]);
    await audit(db, actorOf(req), 'tax.validate', 'tax_config', id, b);
    res.json({validated: true});
  }));

  // ---- catálogo de custos
  r.get('/catalog', asyncHandler(async (_req, res) => {
    const {rows} = await db.query('select *, allocation_pct::float8 as allocation_pct from pricing_catalog order by category, lower(name)');
    res.json(rows);
  }));
  r.post('/catalog', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const d = parse(catalogSchema, req.body);
    if (d.price_verified && d.price_cents === null) throw new HttpError(422, 'Não é possível marcar como verificado sem preço');
    const {rows} = await db.query(`insert into pricing_catalog (${CATALOG_COLS.join(',')}, created_by) values (${[...CATALOG_COLS, 'x'].map((_, i) => `$${i + 1}`).join(',')}) returning *`, [...CATALOG_COLS.map((k) => d[k]), actorOf(req).id]);
    await audit(db, actorOf(req), 'catalog.create', 'catalog', rows[0].id, d);
    res.status(201).json(rows[0]);
  }));
  r.patch('/catalog/:id', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const d = parse(catalogSchema.partial(), req.body);
    const before = (await db.query('select * from pricing_catalog where id = $1', [id])).rows[0];
    if (!before) throw new HttpError(404, 'Item não encontrado');
    if (d.included_in_id === id) throw new HttpError(422, 'Um item não pode estar incluído nele mesmo');
    const nextPrice = d.price_cents !== undefined ? d.price_cents : before.price_cents;
    if ((d.price_verified ?? before.price_verified) && nextPrice === null) throw new HttpError(422, 'Não é possível marcar como verificado sem preço');
    const q = buildUpdate('pricing_catalog', id, d, CATALOG_COLS);
    const {rows} = await db.query(q.text, q.values);
    await audit(db, actorOf(req), 'catalog.update', 'catalog', id, {before: Object.fromEntries(Object.keys(d).map((k) => [k, before[k]])), after: d});
    res.json(rows[0]);
  }));

  // ---- modelos reutilizáveis de escopo / fora do escopo / condições
  r.get('/templates', asyncHandler(async (_req, res) => res.json((await db.query('select id, name, kind, body, created_at from proposal_templates order by kind, lower(name)')).rows)));
  r.post('/templates', requireRole('admin', 'financeiro', 'operador'), asyncHandler(async (req, res) => {
    const b = parse(z.object({name: z.string().trim().min(2).max(120), kind: z.enum(['escopo', 'fora_escopo', 'condicoes']), body: z.unknown()}), req.body);
    const {rows} = await db.query('insert into proposal_templates (name, kind, body, created_by) values ($1,$2,$3,$4) returning id', [b.name, b.kind, JSON.stringify(b.body ?? null), actorOf(req).id]);
    res.status(201).json({id: rows[0].id});
  }));
  r.delete('/templates/:id', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    await db.query('delete from proposal_templates where id = $1', [parse(uuid, req.params.id)]);
    res.json({deleted: true});
  }));

  // ---- simulador (sem gravar): usa catálogo, câmbio e tributação vigentes
  r.post('/simulate', asyncHandler(async (req, res) => {
    const content = parse(proposalContentSchema, req.body?.content);
    const [catalog, fx, settings] = await Promise.all([loadCatalog(db), latestFx(db), loadSettings(db)]);
    const tax = await currentTax(db, today());
    const computed = computeProposal(content, {catalog, fx, tax, settings});
    res.json(computed);
  }));

  // ---- análise automática de um sistema pelo link (sugestões para escopo/infraestrutura; revisão humana obrigatória)
  const analyzeLimiter = rateLimit({windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false});
  r.post('/analyze-url', requireRole('admin', 'financeiro', 'operador'), analyzeLimiter, asyncHandler(async (req, res) => {
    const b = parse(z.object({url: z.string().trim().min(8).max(500)}), req.body);
    let analysis;
    try {
      analysis = await analyzeSite(b.url);
    } catch (e) {
      if (e instanceof UnsafeUrlError) throw new HttpError(422, e.message, 'unsafe_url');
      throw new HttpError(502, `Não foi possível acessar o endereço: ${(e as Error).message}. Preencha manualmente.`, 'fetch_failed');
    }
    await audit(db, actorOf(req), 'proposal.analyze_url', 'pricing', null, {url: analysis.final_url, status: analysis.status});
    res.json(analysis);
  }));

  // ---- QR Pix: valida o payload antes de usar
  r.post('/pix/preview', asyncHandler(async (req, res) => {
    const b = parse(z.object({key: z.enum(['cnpj', 'random']), amount_cents: z.number().int().min(0).nullish()}), req.body);
    const c = await loadCompany(db);
    const key = b.key === 'cnpj' ? c.pix_key_cnpj : c.pix_key_random;
    if (!key) throw new HttpError(422, 'Chave Pix não configurada');
    const payload = buildPixPayload({key, receiver_name: c.pix_receiver_name ?? c.trade_name, city: c.pix_city ?? 'NATAL', amount_cents: b.amount_cents ?? null});
    res.json({payload, validation: validatePixPayload(payload)});
  }));

  return r;
}
