export type Category =
  | 'desenvolvimento' | 'testes' | 'publicacao' | 'implementacao' | 'treinamento' | 'ferramentas' | 'infraestrutura' | 'dominio_email'
  | 'registro' | 'suporte' | 'manutencao' | 'monitoramento' | 'backup' | 'outros';

export const CATEGORY_LABEL: Record<Category, string> = {
  desenvolvimento: 'Desenvolvimento', testes: 'Testes', publicacao: 'Publicação', implementacao: 'Implementação', treinamento: 'Treinamento',
  ferramentas: 'Ferramentas', infraestrutura: 'Infraestrutura', dominio_email: 'Domínio e e-mail', registro: 'Registros', suporte: 'Suporte',
  manutencao: 'Manutenção', monitoramento: 'Monitoramento', backup: 'Backups', outros: 'Outros'
};

export interface Discount {type: 'pct' | 'amount'; value: number}
export interface CostLine {
  id: string; label: string; category: Category; hours?: number | null; rate_cents?: number | null; amount_cents?: number | null; discount?: Discount | null; note?: string | null;
}
export interface CatalogRef {catalog_item_id: string; category: Category; label?: string | null; mode: 'period' | 'months'; months: number}
export interface Method {method: 'margin' | 'markup' | 'manual'; margin_pct?: number | null; markup_pct?: number | null; manual_price_cents?: number | null}

export type PaymentOption =
  | {id: string; type: 'a_vista'; label?: string; include_first_monthly?: boolean}
  | {id: string; type: 'entrada_mensalidades'; label?: string; include_first_monthly?: boolean; months?: number}
  | {id: string; type: 'cartao'; label?: string; base: 'inicial' | 'primeiro_ano'; installments: number; fee_pct: number; fee_passed: boolean; include_first_monthly?: boolean}
  | {id: string; type: 'assinatura_mensal'; label?: string; months?: number}
  | {id: string; type: 'anual'; label?: string; discount_pct?: number}
  | {id: string; type: 'por_usuario'; label?: string; unit_price_cents: number; users: number}
  | {id: string; type: 'consumo'; label?: string; unit_label: string; unit_price_cents: number; estimated_units?: number | null}
  | {id: string; type: 'personalizada'; label?: string; description: string; amount_cents?: number | null};

export interface Content {
  identification: {project_name: string; commercial_owner?: string | null; validity_days: number};
  scope: {summary: string; groups: {title: string; items: string[]}[]};
  schedule: {dev_hours_text?: string | null; deadline?: string | null; training?: string | null; hosting?: string | null; domain?: string | null; email?: string | null; database?: string | null; responsibilities?: string | null};
  calc: {
    hourly_rate_cents: number; one_time_lines: CostLine[]; one_time_catalog: CatalogRef[]; recurring_lines: CostLine[]; recurring_catalog: CatalogRef[];
    license: {mode: 'none' | 'fixed_once' | 'pct_dev_cost' | 'pct_subtotal' | 'monthly_fixed'; value: number};
    pricing: Method; recurring_pricing: Method; discount: {type: 'none' | 'pct' | 'amount'; value: number};
    acks: {below_cost: boolean; min_hours_reason: string | null; no_tax_config: boolean};
  };
  payment: {options: PaymentOption[]; term_months: number};
  out_of_scope: string[];
  conditions: string[];
  visibility: {show_one_time_breakdown: boolean; show_monthly_breakdown: boolean; show_infra_table: boolean; show_support_table: boolean; show_margin: boolean; show_taxes: boolean; show_tools_allocation: boolean; internal_disclosure_authorized: boolean};
  pix: {include_qr: boolean; key: 'cnpj' | 'random'; amount_mode: 'none' | 'option' | 'custom'; option_id?: string | null; amount_cents?: number | null};
  google_review: {include: boolean};
}

export interface Alert {level: 'info' | 'aviso' | 'critico'; code: string; message: string; blocking: boolean}
export interface LineResult extends CostLine {gross_cents: number; discount_cents: number; net_cents: number}
export interface Part {
  lines: LineResult[]; cost_by_category: Partial<Record<Category, number>>; cost_cents: number; license_cents: number; price_suggested_cents: number;
  price_before_discount_cents: number; discount_cents: number; price_final_cents: number; tax_rate_pct: number | null; taxes_cents: number; profit_cents: number;
  margin_pct: number | null; markup_pct: number | null;
}
export interface PaymentResult {id: string; type: string; title: string; rows: {label: string; amount_cents: number | null; emphasis?: string}[]; entry_cents: number | null; total_cents: number | null; absorbed_fee_cents: number}
export interface Resolved {item_id: string; name: string; currency: string; price_cents: number | null; fx: {rate: number; as_of: string; source: string} | null; price_brl_cents: number | null; allocated_monthly_cents: number; allocated_period_cents: number | null; allocation_pct: number; excluded_reason: string | null}
export interface Computed {
  result: {one_time: Part; recurring: Part; dev_hours: number; alerts: Alert[]; blocking_open: string[]};
  payments: PaymentResult[];
  catalog_resolved: {one_time: Resolved[]; recurring: Resolved[]};
  warnings: string[];
  tax_used: {name: string; regime: string; initial_rate_pct: number | null; recurring_rate_pct: number | null; validated_by_name: string | null} | null;
  fx_used: {currency: string; rate: number; as_of: string; source: string}[];
  totals: {one_time_final_cents: number; monthly_final_cents: number; entry_cents: number | null};
}
export interface CatalogItem {
  id: string; name: string; vendor: string | null; plan: string | null; category: 'ferramenta' | 'infra' | 'dominio' | 'email' | 'outro'; price_cents: number | null; currency: 'BRL' | 'USD' | 'EUR';
  periodicity: 'mensal' | 'anual' | 'bienal' | 'trienal' | 'quadrienal' | 'unica'; projects_served: number; allocation_pct: number | null; included_in_id: string | null;
  price_verified: boolean; source: string | null; verified_at: string | null; notes: string | null; active: boolean;
}

export const uid = (p = 'l'): string => `${p}-${Math.random().toString(36).slice(2, 9)}`;
