import type {Alert, CostLine, PricingInput, PricingResult} from './engine.js';
import {calculate} from './engine.js';
import {resolveCatalog, type CatalogItem, type FxRate, type ResolvedItem} from './catalog.js';
import {computePayment, type PaymentResult} from './payment.js';
import type {ProposalContent} from './content.js';

export interface TaxConfigRow {
  id: string;
  name: string;
  regime: string;
  initial_rate_pct: number | null;
  recurring_rate_pct: number | null;
  base: string;
  valid_from: string;
  valid_to: string | null;
  validated_at: string | null;
  validated_by_name: string | null;
  validation_ref: string | null;
}

export interface ComputeCtx {
  catalog: CatalogItem[];
  fx: FxRate[];
  tax: TaxConfigRow | null;
  settings: {min_dev_hours: number};
}

export interface ComputedProposal {
  result: PricingResult;
  payments: PaymentResult[];
  catalog_resolved: {one_time: ResolvedItem[]; recurring: ResolvedItem[]};
  warnings: string[];
  tax_used: TaxConfigRow | null;
  fx_used: FxRate[];
  totals: {one_time_final_cents: number; monthly_final_cents: number; entry_cents: number | null};
}

/** Monta a entrada do motor a partir do conteúdo da proposta + catálogo/câmbio/tributação vigentes. */
export function computeProposal(content: ProposalContent, ctx: ComputeCtx): ComputedProposal {
  const c = content.calc;
  const one = resolveCatalog(ctx.catalog, c.one_time_catalog.map((x) => x.catalog_item_id), ctx.fx);
  const rec = resolveCatalog(ctx.catalog, c.recurring_catalog.map((x) => x.catalog_item_id), ctx.fx);

  const oneCatalogLines: CostLine[] = c.one_time_catalog.map((ref, i) => {
    const r = one.resolved.find((x) => x.item_id === ref.catalog_item_id);
    const amount = !r || r.excluded_reason ? 0 : ref.mode === 'period' ? (r.allocated_period_cents ?? 0) : r.allocated_monthly_cents * ref.months;
    return {
      id: `cat-o-${i}`, category: ref.category, catalog_item_id: ref.catalog_item_id, amount_cents: amount,
      label: ref.label?.trim() || `${r?.name ?? 'Item'}${ref.mode === 'months' ? ` (${ref.months} ${ref.months > 1 ? 'meses' : 'mês'}, rateado)` : ''}`,
      note: r?.excluded_reason ? `excluído: ${r.excluded_reason}` : null
    };
  });
  const recCatalogLines: CostLine[] = c.recurring_catalog.map((ref, i) => {
    const r = rec.resolved.find((x) => x.item_id === ref.catalog_item_id);
    return {
      id: `cat-r-${i}`, category: ref.category, catalog_item_id: ref.catalog_item_id, amount_cents: !r || r.excluded_reason ? 0 : r.allocated_monthly_cents,
      label: ref.label?.trim() || `${r?.name ?? 'Item'} (rateio mensal)`, note: r?.excluded_reason ? `excluído: ${r.excluded_reason}` : null
    };
  });

  const t = ctx.tax;
  const taxValid = !!t && !!t.validated_at;
  const input: PricingInput = {
    hourly_rate_cents: c.hourly_rate_cents,
    min_dev_hours: ctx.settings.min_dev_hours,
    one_time_costs: [...c.one_time_lines, ...oneCatalogLines] as CostLine[],
    recurring_costs: [...c.recurring_lines, ...recCatalogLines] as CostLine[],
    license: c.license,
    pricing: normMethod(c.pricing),
    recurring_pricing: normMethod(c.recurring_pricing),
    tax: {initial_rate_pct: taxValid ? t.initial_rate_pct : null, recurring_rate_pct: taxValid ? t.recurring_rate_pct : null, validated: taxValid},
    discount: c.discount,
    acks: c.acks
  };
  const result = calculate(input);
  const alerts: Alert[] = result.alerts;

  const one_time_final = result.one_time.price_final_cents;
  const monthly_final = result.recurring.price_final_cents;
  const payments = content.payment.options.map((o) => computePayment(o, {one_time_cents: one_time_final, monthly_cents: monthly_final}));
  const warnings = [...one.warnings, ...rec.warnings];

  // Pix: valor da opção escolhida
  let entry: number | null = null;
  if (content.pix.amount_mode === 'custom') entry = content.pix.amount_cents ?? null;
  else if (content.pix.amount_mode === 'option') entry = payments.find((p) => p.id === content.pix.option_id)?.entry_cents ?? null;

  const usedCurrencies = new Set([...one.resolved, ...rec.resolved].filter((x) => x.fx).map((x) => x.currency));
  return {
    result: {...result, alerts}, payments, catalog_resolved: {one_time: one.resolved, recurring: rec.resolved}, warnings,
    tax_used: taxValid ? t : null, fx_used: ctx.fx.filter((f) => usedCurrencies.has(f.currency)),
    totals: {one_time_final_cents: one_time_final, monthly_final_cents: monthly_final, entry_cents: entry}
  };
}

const normMethod = (m: ProposalContent['calc']['pricing']) => ({method: m.method, margin_pct: m.margin_pct ?? null, markup_pct: m.markup_pct ?? null, manual_price_cents: m.manual_price_cents ?? null});
