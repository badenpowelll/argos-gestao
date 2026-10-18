import type {Db, Tx} from '../db.js';
import type {CatalogItem, FxRate} from './catalog.js';
import type {TaxConfigRow} from './compute.js';

export interface PricingSettings {
  hourly_rate_cents: number;
  min_dev_hours: number;
  validity_days: number;
  default_margin_pct: number;
  card_fees: {installments: number; fee_pct: number; source?: string}[];
}

export async function loadSettings(db: Db | Tx): Promise<PricingSettings> {
  const {rows} = await db.query('select hourly_rate_cents, min_dev_hours, validity_days, default_margin_pct, card_fees from pricing_settings');
  const s = rows[0];
  return {...s, min_dev_hours: Number(s.min_dev_hours), default_margin_pct: Number(s.default_margin_pct)};
}

export async function loadCatalog(db: Db | Tx): Promise<CatalogItem[]> {
  const {rows} = await db.query(
    `select id, name, vendor, plan, category, price_cents, currency, periodicity, projects_served, allocation_pct, included_in_id, price_verified, active
       from pricing_catalog order by category, lower(name)`);
  return rows.map((r) => ({...r, allocation_pct: r.allocation_pct === null ? null : Number(r.allocation_pct)}));
}

/** Última cotação de cada moeda. */
export async function latestFx(db: Db | Tx): Promise<FxRate[]> {
  const {rows} = await db.query(
    `select distinct on (currency) currency, rate::float8 as rate, as_of::text as as_of, source
       from fx_rates order by currency, as_of desc, created_at desc`);
  return rows as FxRate[];
}

/** Tributação vigente E validada pela contabilidade. Configurações não validadas nunca são usadas. */
export async function currentTax(db: Db | Tx, on: string): Promise<TaxConfigRow | null> {
  const {rows} = await db.query(
    `select id, name, regime, initial_rate_pct::float8 as initial_rate_pct, recurring_rate_pct::float8 as recurring_rate_pct, base,
            valid_from::text as valid_from, valid_to::text as valid_to, validated_at, validated_by_name, validation_ref
       from tax_configs
      where active and validated_at is not null and valid_from <= $1::date and (valid_to is null or valid_to >= $1::date)
      order by valid_from desc limit 1`, [on]);
  return (rows[0] as TaxConfigRow | undefined) ?? null;
}

export async function loadCompany(db: Db | Tx) {
  const {rows} = await db.query('select * from company');
  const c = rows[0];
  const city = ((c.pix_city as string | null) ?? 'NATAL').toLowerCase().replace(/(^|\s)\S/g, (x: string) => x.toUpperCase());
  return {...c, city: `${city}/RN`};
}

/** Busca cotação oficial (BCE via Frankfurter). `fetchFn` injetável para testes. */
export async function fetchEcbRates(fetchFn: typeof fetch = fetch): Promise<{currency: 'EUR' | 'USD'; rate: number; as_of: string; source: string}[]> {
  const out: {currency: 'EUR' | 'USD'; rate: number; as_of: string; source: string}[] = [];
  for (const cur of ['EUR', 'USD'] as const) {
    const res = await fetchFn(`https://api.frankfurter.dev/v1/latest?base=${cur}&symbols=BRL`, {signal: AbortSignal.timeout(10_000)});
    if (!res.ok) throw new Error(`Cotação ${cur}/BRL indisponível (HTTP ${res.status})`);
    const j = (await res.json()) as {date?: string; rates?: {BRL?: number}};
    const rate = j.rates?.BRL;
    if (!rate || !j.date || !(rate > 0)) throw new Error(`Resposta inválida da cotação ${cur}/BRL`);
    out.push({currency: cur, rate, as_of: j.date, source: 'Banco Central Europeu (taxa de referência) via frankfurter.dev'});
  }
  return out;
}
