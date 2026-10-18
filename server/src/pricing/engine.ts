/**
 * Motor de precificação do ARGOS PRICING. Funções puras, valores em centavos (inteiros), percentuais em número (20 = 20%).
 *
 * Convenções (documentadas também na tela):
 *  - MARGEM é sobre o PREÇO de venda e líquida de tributos:  preço = custo ÷ (1 − margem − tributo).
 *  - MARKUP é sobre o CUSTO:                                  preço = custo × (1 + markup). Tributos saem do lucro.
 *  - Licença é componente de PREÇO (não tem custo) e é somada ao preço sugerido da parte "custo + margem".
 *  - Tributos = alíquota efetiva × preço final. Sem alíquota validada pela contabilidade, tributos = 0 e há bloqueio/alerta.
 *  - Nada é arredondado antes do fim de cada etapa (Math.round half-up em centavos).
 */
export type CostCategory =
  | 'desenvolvimento' | 'testes' | 'publicacao' | 'implementacao' | 'treinamento'
  | 'ferramentas' | 'infraestrutura' | 'dominio_email' | 'registro' | 'suporte' | 'manutencao' | 'monitoramento' | 'backup' | 'outros';

export interface Discount {
  type: 'pct' | 'amount';
  value: number; // pct: 0–100 | amount: centavos
}

export interface CostLine {
  id: string;
  label: string;
  category: CostCategory;
  /** Para linhas de mão de obra: horas × valor/hora. Para as demais: amount_cents. */
  hours?: number | null;
  rate_cents?: number | null;
  amount_cents?: number | null;
  discount?: Discount | null;
  catalog_item_id?: string | null;
  note?: string | null;
}

export type LicenseMode = 'none' | 'fixed_once' | 'pct_dev_cost' | 'pct_subtotal' | 'monthly_fixed';
export interface PricingMethod {
  method: 'margin' | 'markup' | 'manual';
  margin_pct?: number | null;
  markup_pct?: number | null;
  manual_price_cents?: number | null;
}

export interface PricingInput {
  hourly_rate_cents: number;
  min_dev_hours: number;
  one_time_costs: CostLine[];
  recurring_costs: CostLine[];
  license: {mode: LicenseMode; value: number};
  pricing: PricingMethod;
  recurring_pricing: PricingMethod;
  /** null = alíquota não configurada/validada. */
  tax: {initial_rate_pct: number | null; recurring_rate_pct: number | null; validated: boolean};
  discount: {type: 'none' | 'pct' | 'amount'; value: number};
  acks: {below_cost: boolean; min_hours_reason: string | null; no_tax_config: boolean};
}

export type AlertLevel = 'info' | 'aviso' | 'critico';
export interface Alert {
  level: AlertLevel;
  code: string;
  message: string;
  /** Impede emitir a proposta enquanto não houver confirmação explícita (acks). */
  blocking: boolean;
}

export interface LineResult extends CostLine {
  gross_cents: number;
  discount_cents: number;
  net_cents: number;
}

export interface PartResult {
  lines: LineResult[];
  cost_by_category: Partial<Record<CostCategory, number>>;
  cost_cents: number;
  license_cents: number;
  price_suggested_cents: number;
  price_before_discount_cents: number;
  discount_cents: number;
  price_final_cents: number;
  tax_rate_pct: number | null;
  taxes_cents: number;
  profit_cents: number;
  /** lucro ÷ preço final */
  margin_pct: number | null;
  /** lucro bruto de custo ÷ custo: (preço − custo) ÷ custo */
  markup_pct: number | null;
}

export interface PricingResult {
  one_time: PartResult;
  recurring: PartResult;
  dev_hours: number;
  alerts: Alert[];
  blocking_open: string[];
}

const r = Math.round;
const pctOf = (cents: number, pct: number) => r((cents * pct) / 100);

export function applyDiscount(gross: number, d?: Discount | null): number {
  if (!d || !d.value) return 0;
  const v = d.type === 'pct' ? pctOf(gross, d.value) : r(d.value);
  return Math.min(Math.max(v, 0), gross);
}

export function resolveLine(l: CostLine, defaultRate: number): LineResult {
  const gross =
    l.hours !== null && l.hours !== undefined
      ? r(l.hours * (l.rate_cents ?? defaultRate))
      : r(l.amount_cents ?? 0);
  const discount = applyDiscount(gross, l.discount);
  return {...l, gross_cents: gross, discount_cents: discount, net_cents: gross - discount};
}

const DEV_CATEGORIES: CostCategory[] = ['desenvolvimento', 'testes', 'publicacao'];

function priceFromMethod(cost: number, m: PricingMethod, taxPct: number, alerts: Alert[], scope: string): number {
  if (m.method === 'manual') {
    if (m.manual_price_cents === null || m.manual_price_cents === undefined) {
      alerts.push({level: 'critico', code: `${scope}_manual_missing`, message: `Informe o preço manual (${scope === 'one_time' ? 'inicial' : 'mensal'}).`, blocking: true});
      return 0;
    }
    return r(m.manual_price_cents);
  }
  if (m.method === 'markup') return r(cost * (1 + (m.markup_pct ?? 0) / 100));
  const margin = m.margin_pct ?? 0;
  if (margin + taxPct >= 100) {
    alerts.push({level: 'critico', code: `${scope}_margin_impossible`, message: 'Margem + tributo ≥ 100%: impossível calcular o preço.', blocking: true});
    return 0;
  }
  return r(cost / (1 - (margin + taxPct) / 100));
}

function finishPart(
  lines: LineResult[], license: number, method: PricingMethod, taxPct: number | null, discount: PricingInput['discount'] | null,
  alerts: Alert[], scope: 'one_time' | 'recurring'
): PartResult {
  const cost_by_category: PartResult['cost_by_category'] = {};
  let cost = 0;
  for (const l of lines) {
    cost += l.net_cents;
    cost_by_category[l.category] = (cost_by_category[l.category] ?? 0) + l.net_cents;
  }
  const taxForPrice = taxPct ?? 0;
  const base = priceFromMethod(cost, method, taxForPrice, alerts, scope);
  const suggested = method.method === 'manual' ? base : base + license;
  const before = method.method === 'manual' ? base : suggested;
  let discount_cents = 0;
  if (discount && discount.type !== 'none') {
    discount_cents = Math.min(before, discount.type === 'pct' ? pctOf(before, discount.value) : r(discount.value));
  }
  const final = before - discount_cents;
  const taxes = pctOf(final, taxForPrice);
  const profit = final - cost - taxes;
  return {
    lines, cost_by_category, cost_cents: cost, license_cents: license, price_suggested_cents: suggested,
    price_before_discount_cents: before, discount_cents, price_final_cents: final, tax_rate_pct: taxPct,
    taxes_cents: taxes, profit_cents: profit,
    margin_pct: final > 0 ? Math.round((profit / final) * 10000) / 100 : null,
    markup_pct: cost > 0 ? Math.round(((final - cost) / cost) * 10000) / 100 : null
  };
}

export function calculate(input: PricingInput): PricingResult {
  const alerts: Alert[] = [];
  const rate = input.hourly_rate_cents;
  const oneLines = input.one_time_costs.map((l) => resolveLine(l, rate));
  const recLines = input.recurring_costs.map((l) => resolveLine(l, rate));

  const devCost = oneLines.filter((l) => DEV_CATEGORIES.includes(l.category)).reduce((s, l) => s + l.net_cents, 0);
  const subtotal = oneLines.reduce((s, l) => s + l.net_cents, 0);
  const devHours = oneLines.filter((l) => DEV_CATEGORIES.includes(l.category)).reduce((s, l) => s + (l.hours ?? 0), 0);

  // ---- licença
  let licenseOnce = 0;
  let licenseMonthly = 0;
  const lic = input.license;
  if (lic.mode === 'fixed_once') licenseOnce = r(lic.value);
  else if (lic.mode === 'pct_dev_cost') licenseOnce = pctOf(devCost, lic.value);
  else if (lic.mode === 'pct_subtotal') licenseOnce = pctOf(subtotal, lic.value);
  else if (lic.mode === 'monthly_fixed') licenseMonthly = r(lic.value);

  // ---- tributos (nunca presumidos)
  const taxOk = input.tax.validated && input.tax.initial_rate_pct !== null;
  const taxInit = taxOk ? input.tax.initial_rate_pct : null;
  const taxRec = input.tax.validated && input.tax.recurring_rate_pct !== null ? input.tax.recurring_rate_pct : null;
  if (!taxOk || taxRec === null) {
    alerts.push({
      level: 'critico', code: 'tax_unconfigured', blocking: !input.acks.no_tax_config,
      message: 'Configuração tributária não validada pela contabilidade: tributos estimados = R$ 0,00. Configure e valide a alíquota ou confirme emitir sem estimativa.'
    });
  }

  const one = finishPart(oneLines, licenseOnce, input.pricing, taxInit, input.discount, alerts, 'one_time');
  const rec = finishPart(recLines, licenseMonthly, input.recurring_pricing, taxRec, null, alerts, 'recurring');

  // ---- regras de negócio
  if (devHours < input.min_dev_hours && oneLines.some((l) => l.hours !== null && l.hours !== undefined)) {
    const ok = !!input.acks.min_hours_reason && input.acks.min_hours_reason.trim().length >= 5;
    alerts.push({
      level: 'aviso', code: 'below_min_hours', blocking: !ok,
      message: `Horas de desenvolvimento (${devHours} h) abaixo do mínimo de referência (${input.min_dev_hours} h). Registre a justificativa da exceção.`
    });
  }
  if (one.price_final_cents > 0 && one.price_final_cents < one.cost_cents) {
    alerts.push({level: 'critico', code: 'below_cost', blocking: !input.acks.below_cost,
      message: `Preço final (parte inicial) abaixo do custo: prejuízo de ${((one.cost_cents - one.price_final_cents) / 100).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}. Confirme explicitamente para emitir.`});
  } else if (one.profit_cents < 0) {
    alerts.push({level: 'critico', code: 'negative_profit', blocking: !input.acks.below_cost, message: 'Lucro estimado negativo após tributos (parte inicial). Confirme explicitamente para emitir.'});
  }
  if (rec.cost_cents > 0 && rec.price_final_cents < rec.cost_cents) {
    alerts.push({level: 'critico', code: 'recurring_below_cost', blocking: !input.acks.below_cost, message: 'Preço mensal abaixo do custo mensal interno. Confirme explicitamente para emitir.'});
  }
  if (input.discount.type !== 'none' && input.discount.value > 0 && one.discount_cents > 0 && one.price_before_discount_cents > 0) {
    const pct = (one.discount_cents / one.price_before_discount_cents) * 100;
    if (pct >= 30) alerts.push({level: 'aviso', code: 'big_discount', blocking: false, message: `Desconto de ${pct.toFixed(1).replace('.', ',')}% sobre o preço inicial.`});
  }
  if (input.pricing.method === 'margin' && one.margin_pct !== null && input.pricing.margin_pct != null && one.margin_pct + 0.005 < input.pricing.margin_pct && one.discount_cents > 0) {
    alerts.push({level: 'info', code: 'margin_below_target', blocking: false, message: `Após o desconto, a margem caiu para ${String(one.margin_pct).replace('.', ',')}% (meta: ${input.pricing.margin_pct}%).`});
  }

  const blocking_open = alerts.filter((a) => a.blocking).map((a) => a.code);
  return {one_time: one, recurring: rec, dev_hours: devHours, alerts, blocking_open};
}
