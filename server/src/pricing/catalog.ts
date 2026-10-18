/** Catálogo de custos (ferramentas, infraestrutura, domínio, e-mail): conversão cambial, periodicidade e rateio. */
export type Currency = 'BRL' | 'USD' | 'EUR';
export type Periodicity = 'mensal' | 'anual' | 'bienal' | 'trienal' | 'quadrienal' | 'unica';
export const PERIOD_MONTHS: Record<Periodicity, number | null> = {mensal: 1, anual: 12, bienal: 24, trienal: 36, quadrienal: 48, unica: null};

export interface CatalogItem {
  id: string;
  name: string;
  vendor: string | null;
  plan: string | null;
  category: 'ferramenta' | 'infra' | 'dominio' | 'email' | 'outro';
  /** preço na moeda original, em centavos/cents. null = ainda não verificado/preenchido */
  price_cents: number | null;
  currency: Currency;
  periodicity: Periodicity;
  projects_served: number;
  allocation_pct: number | null;
  /** este item já está incluído em outro plano (evita dupla contagem quando o outro também está selecionado) */
  included_in_id: string | null;
  price_verified: boolean;
  active: boolean;
}

export interface FxRate {
  currency: Currency;
  rate: number; // BRL por 1 unidade da moeda
  as_of: string;
  source: string;
}

export interface ResolvedItem {
  item_id: string;
  name: string;
  currency: Currency;
  price_cents: number | null;
  fx: {rate: number; as_of: string; source: string} | null;
  price_brl_cents: number | null;
  period_months: number | null;
  /** custo mensal equivalente (total, antes do rateio) */
  monthly_brl_cents: number | null;
  /** custo mensal proporcional a este projeto */
  allocated_monthly_cents: number;
  /** valor pago de uma vez por este projeto para o período contratado (ex.: domínio por 3 anos) */
  allocated_period_cents: number | null;
  allocation_pct: number;
  excluded_reason: 'sem_preco' | 'sem_cambio' | 'incluido_em_outro_plano' | 'inativo' | null;
}

const r = Math.round;

export function resolveCatalog(items: CatalogItem[], selectedIds: string[], fx: FxRate[]): {resolved: ResolvedItem[]; warnings: string[]} {
  const warnings: string[] = [];
  const selected = new Set(selectedIds);
  const resolved: ResolvedItem[] = [];
  for (const id of selectedIds) {
    const it = items.find((x) => x.id === id);
    if (!it) { warnings.push(`Item de catálogo ${id} não encontrado.`); continue; }
    const base: ResolvedItem = {
      item_id: it.id, name: it.name, currency: it.currency, price_cents: it.price_cents, fx: null, price_brl_cents: null,
      period_months: PERIOD_MONTHS[it.periodicity], monthly_brl_cents: null, allocated_monthly_cents: 0, allocated_period_cents: null,
      allocation_pct: 0, excluded_reason: null
    };
    const alloc = it.allocation_pct !== null ? it.allocation_pct : it.projects_served > 0 ? 100 / it.projects_served : 100;
    base.allocation_pct = Math.round(alloc * 10000) / 10000;
    if (!it.active) { resolved.push({...base, excluded_reason: 'inativo'}); continue; }
    if (it.included_in_id && selected.has(it.included_in_id)) {
      const parent = items.find((x) => x.id === it.included_in_id);
      warnings.push(`"${it.name}" já está incluído em "${parent?.name ?? 'outro plano'}": não foi contado em duplicidade.`);
      resolved.push({...base, excluded_reason: 'incluido_em_outro_plano'});
      continue;
    }
    if (it.price_cents === null) {
      warnings.push(`"${it.name}" não tem preço verificado: preencha manualmente no catálogo (valor não considerado).`);
      resolved.push({...base, excluded_reason: 'sem_preco'});
      continue;
    }
    let rate = 1;
    let fxInfo: ResolvedItem['fx'] = null;
    if (it.currency !== 'BRL') {
      const f = fx.find((x) => x.currency === it.currency);
      if (!f) {
        warnings.push(`Sem cotação ${it.currency}/BRL cadastrada para "${it.name}".`);
        resolved.push({...base, excluded_reason: 'sem_cambio'});
        continue;
      }
      rate = f.rate;
      fxInfo = {rate: f.rate, as_of: f.as_of, source: f.source};
    }
    const brl = r(it.price_cents * rate);
    const months = PERIOD_MONTHS[it.periodicity];
    const monthly = months ? brl / months : null;
    resolved.push({
      ...base, fx: fxInfo, price_brl_cents: brl, monthly_brl_cents: monthly === null ? null : r(monthly),
      allocated_monthly_cents: monthly === null ? 0 : r((monthly * alloc) / 100),
      allocated_period_cents: r((brl * alloc) / 100)
    });
  }
  return {resolved, warnings};
}
