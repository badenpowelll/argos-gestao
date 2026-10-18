import {z} from 'zod';

const category = z.enum([
  'desenvolvimento', 'testes', 'publicacao', 'implementacao', 'treinamento', 'ferramentas', 'infraestrutura', 'dominio_email',
  'registro', 'suporte', 'manutencao', 'monitoramento', 'backup', 'outros'
]);
const money = z.number().int().min(0).max(1_000_000_000);
const discount = z.object({type: z.enum(['pct', 'amount']), value: z.number().min(0).max(100_000_000)}).nullish();

export const costLineSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().trim().min(1).max(200),
  category,
  hours: z.number().min(0).max(100000).nullish(),
  rate_cents: money.nullish(),
  amount_cents: money.nullish(),
  discount,
  note: z.string().max(300).nullish()
});

const method = z.object({
  method: z.enum(['margin', 'markup', 'manual']),
  margin_pct: z.number().min(0).max(99.99).nullish(),
  markup_pct: z.number().min(0).max(10000).nullish(),
  manual_price_cents: money.nullish()
});

const paymentOption = z.discriminatedUnion('type', [
  z.object({id: z.string().min(1), type: z.literal('a_vista'), label: z.string().max(200).optional(), include_first_monthly: z.boolean().optional()}),
  z.object({id: z.string().min(1), type: z.literal('entrada_mensalidades'), label: z.string().max(200).optional(), include_first_monthly: z.boolean().optional(), months: z.number().int().min(1).max(120).optional()}),
  z.object({id: z.string().min(1), type: z.literal('cartao'), label: z.string().max(200).optional(), base: z.enum(['inicial', 'primeiro_ano']), installments: z.number().int().min(1).max(24), fee_pct: z.number().min(0).max(50), fee_passed: z.boolean(), include_first_monthly: z.boolean().optional()}),
  z.object({id: z.string().min(1), type: z.literal('assinatura_mensal'), label: z.string().max(200).optional(), months: z.number().int().min(1).max(120).optional()}),
  z.object({id: z.string().min(1), type: z.literal('anual'), label: z.string().max(200).optional(), discount_pct: z.number().min(0).max(100).optional()}),
  z.object({id: z.string().min(1), type: z.literal('por_usuario'), label: z.string().max(200).optional(), unit_price_cents: money, users: z.number().int().min(1).max(100000)}),
  z.object({id: z.string().min(1), type: z.literal('consumo'), label: z.string().max(200).optional(), unit_label: z.string().min(1).max(40), unit_price_cents: money, estimated_units: z.number().min(0).nullish()}),
  z.object({id: z.string().min(1), type: z.literal('personalizada'), label: z.string().max(200).optional(), description: z.string().min(1).max(600), amount_cents: money.nullish()})
]);

const catalogRef = z.object({
  catalog_item_id: z.string().uuid(),
  category,
  label: z.string().max(200).nullish(),
  /** 'period' = paga o período inteiro (ex.: domínio 3 anos); 'months' = N meses de custo mensal rateado */
  mode: z.enum(['period', 'months']).default('months'),
  months: z.number().int().min(1).max(60).default(1)
});

export const proposalContentSchema = z.object({
  identification: z.object({
    project_name: z.string().trim().min(2).max(200),
    commercial_owner: z.string().trim().max(150).nullish(),
    validity_days: z.number().int().min(1).max(365),
    /** link do sistema de teste entregue ao cliente (usado para sugerir escopo e infraestrutura) */
    test_url: z.string().trim().max(500).refine((v) => /^https?:\/\/\S+$/i.test(v), 'Use um link http(s)').nullish().or(z.literal('').transform(() => null))
  }),
  scope: z.object({
    summary: z.string().max(3000).default(''),
    groups: z.array(z.object({title: z.string().trim().min(1).max(120), items: z.array(z.string().trim().min(1).max(300)).max(40)})).max(12)
  }),
  schedule: z.object({
    dev_hours_text: z.string().max(300).nullish(),
    deadline: z.string().max(300).nullish(),
    training: z.string().max(300).nullish(),
    hosting: z.string().max(500).nullish(),
    domain: z.string().max(500).nullish(),
    email: z.string().max(500).nullish(),
    database: z.string().max(500).nullish(),
    responsibilities: z.string().max(800).nullish()
  }),
  calc: z.object({
    hourly_rate_cents: money,
    one_time_lines: z.array(costLineSchema).max(60),
    one_time_catalog: z.array(catalogRef).max(30),
    recurring_lines: z.array(costLineSchema).max(60),
    recurring_catalog: z.array(catalogRef).max(30),
    license: z.object({mode: z.enum(['none', 'fixed_once', 'pct_dev_cost', 'pct_subtotal', 'monthly_fixed']), value: z.number().min(0).max(1_000_000_000)}),
    pricing: method,
    recurring_pricing: method,
    discount: z.object({type: z.enum(['none', 'pct', 'amount']), value: z.number().min(0).max(1_000_000_000)}),
    acks: z.object({below_cost: z.boolean(), min_hours_reason: z.string().max(300).nullable(), no_tax_config: z.boolean()})
  }),
  payment: z.object({options: z.array(paymentOption).max(10), term_months: z.number().int().min(1).max(120)}),
  out_of_scope: z.array(z.string().trim().min(1).max(400)).max(30),
  conditions: z.array(z.string().trim().min(1).max(900)).max(30),
  visibility: z.object({
    show_one_time_breakdown: z.boolean(),
    show_monthly_breakdown: z.boolean(),
    show_infra_table: z.boolean(),
    show_support_table: z.boolean(),
    show_margin: z.boolean(),
    show_taxes: z.boolean(),
    show_tools_allocation: z.boolean(),
    /** autorização expressa para exibir dados internos (margem/tributos/rateios) ao cliente */
    internal_disclosure_authorized: z.boolean()
  }),
  pix: z.object({include_qr: z.boolean(), key: z.enum(['cnpj', 'random']), amount_mode: z.enum(['none', 'option', 'custom']), option_id: z.string().nullish(), amount_cents: money.nullish()}),
  google_review: z.object({include: z.boolean()})
});
export type ProposalContent = z.infer<typeof proposalContentSchema>;

export function defaultContent(s: {hourly_rate_cents: number; validity_days: number; default_margin_pct: number}, projectName = 'Novo sistema'): ProposalContent {
  return {
    identification: {project_name: projectName, commercial_owner: null, validity_days: s.validity_days},
    scope: {summary: '', groups: [{title: 'Funcionalidades', items: []}]},
    schedule: {dev_hours_text: null, deadline: null, training: null, hosting: null, domain: null, email: null, database: null, responsibilities: null},
    calc: {
      hourly_rate_cents: s.hourly_rate_cents,
      one_time_lines: [
        {id: 'l-dev', label: 'Desenvolvimento', category: 'desenvolvimento', hours: 24},
        {id: 'l-test', label: 'Testes', category: 'testes', hours: 0},
        {id: 'l-pub', label: 'Publicação', category: 'publicacao', hours: 0},
        {id: 'l-train', label: 'Treinamento', category: 'treinamento', hours: 0}
      ],
      one_time_catalog: [], recurring_lines: [], recurring_catalog: [],
      license: {mode: 'none', value: 0},
      pricing: {method: 'margin', margin_pct: s.default_margin_pct, markup_pct: null, manual_price_cents: null},
      recurring_pricing: {method: 'markup', margin_pct: null, markup_pct: 0, manual_price_cents: null},
      discount: {type: 'none', value: 0},
      acks: {below_cost: false, min_hours_reason: null, no_tax_config: false}
    },
    payment: {options: [{id: 'opt-1', type: 'entrada_mensalidades', include_first_monthly: true}], term_months: 12},
    out_of_scope: [], conditions: [],
    visibility: {show_one_time_breakdown: true, show_monthly_breakdown: true, show_infra_table: false, show_support_table: false, show_margin: false, show_taxes: false, show_tools_allocation: false, internal_disclosure_authorized: false},
    pix: {include_qr: true, key: 'cnpj', amount_mode: 'option', option_id: 'opt-1', amount_cents: null},
    google_review: {include: true}
  };
}
