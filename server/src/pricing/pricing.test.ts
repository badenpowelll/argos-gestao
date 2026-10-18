import {describe, expect, it} from 'vitest';
import {calculate, type PricingInput} from './engine.js';
import {resolveCatalog, type CatalogItem, type FxRate} from './catalog.js';
import {computePayment} from './payment.js';
import {buildPixPayload, crc16, validatePixKey, validatePixPayload} from './pix.js';

const base = (over: Partial<PricingInput> = {}): PricingInput => ({
  hourly_rate_cents: 3500, min_dev_hours: 24, one_time_costs: [], recurring_costs: [], license: {mode: 'none', value: 0},
  pricing: {method: 'margin', margin_pct: 20}, recurring_pricing: {method: 'markup', markup_pct: 0},
  tax: {initial_rate_pct: 0, recurring_rate_pct: 0, validated: true}, discount: {type: 'none', value: 0},
  acks: {below_cost: false, min_hours_reason: null, no_tax_config: false}, ...over
});

describe('motor de precificação — referência real: Proposta PDV ATEC (17/10/2026)', () => {
  const fx: FxRate[] = [{currency: 'USD', rate: 5.5, as_of: '2026-10-17', source: 'referência da proposta'}];
  const tool = (id: string, name: string, usd: number): CatalogItem => ({id, name, vendor: null, plan: null, category: 'ferramenta', price_cents: usd * 100, currency: 'USD', periodicity: 'mensal', projects_served: 8, allocation_pct: null, included_in_id: null, price_verified: true, active: true});
  const catalog = [tool('lov', 'Lovable Pro', 25), tool('cloud', 'Lovable Cloud', 25), tool('cla', 'Claude Pro', 20)];
  const {resolved} = resolveCatalog(catalog, ['lov', 'cloud', 'cla'], fx);

  it('rateio das ferramentas em USD ÷ 8 sistemas × cotação', () => {
    expect(resolved.map((x) => x.allocated_monthly_cents)).toEqual([1719, 1719, 1375]); // R$ 17,19 · 17,19 · 13,75
    expect(resolved[0]?.allocated_monthly_cents! + resolved[2]?.allocated_monthly_cents!).toBe(3094); // R$ 30,94 (1 mês)
  });

  it('entrada: custos R$ 1.081,44 → margem 20% do preço → projeto R$ 1.351,80', () => {
    const input = base({
      hourly_rate_cents: 4000,
      one_time_costs: [
        {id: '1', label: 'Implementação e desenvolvimento (24 h × R$ 40,00)', category: 'desenvolvimento', hours: 24, discount: {type: 'pct', value: 50}},
        {id: '2', label: 'Ferramentas, 1 mês', category: 'ferramentas', amount_cents: 3094},
        {id: '3', label: 'Registro INPI', category: 'registro', amount_cents: 24000},
        {id: '4', label: 'Domínio .com.br (3 anos)', category: 'dominio_email', amount_cents: 13098},
        {id: '5', label: 'E-mail Starter (4 anos)', category: 'dominio_email', amount_cents: 11952},
        {id: '6', label: 'Treinamento (2 h × R$ 40,00)', category: 'treinamento', hours: 2}
      ]
    });
    const res = calculate(input);
    expect(res.one_time.lines[0]?.gross_cents).toBe(96000);
    expect(res.one_time.lines[0]?.discount_cents).toBe(48000);
    expect(res.one_time.cost_cents).toBe(108144); // SUBTOTAL DE CUSTOS
    expect(res.one_time.price_final_cents).toBe(135180); // VALOR DO PROJETO
    expect(res.one_time.profit_cents).toBe(27036); // margem de lucro
    expect(res.one_time.margin_pct).toBe(20);
    expect(res.one_time.markup_pct).toBe(25); // margem ≠ markup (20% sobre o preço = 25% sobre o custo)
  });

  it('mensalidade: ferramentas (R$ 48,13) + licença R$ 99,87 = R$ 148,00', () => {
    const res = calculate(base({
      recurring_costs: resolved.map((x) => ({id: x.item_id, label: x.name, category: 'ferramentas' as const, amount_cents: x.allocated_monthly_cents})),
      license: {mode: 'monthly_fixed', value: 9987}
    }));
    expect(res.recurring.cost_cents).toBe(4813);
    expect(res.recurring.price_final_cents).toBe(14800);
  });

  it('opção 1 e opção 2 (cartão em 10x com taxa de 10,57% repassada)', () => {
    const ctx = {one_time_cents: 135180, monthly_cents: 14800};
    const o1 = computePayment({id: 'o1', type: 'entrada_mensalidades', include_first_monthly: true}, ctx);
    expect(o1.entry_cents).toBe(149980); // TOTAL DA ENTRADA
    const o2 = computePayment({id: 'o2', type: 'cartao', base: 'primeiro_ano', installments: 10, fee_pct: 10.57, fee_passed: true, include_first_monthly: true}, ctx);
    expect(o2.rows.find((x) => x.label.startsWith('SUBTOTAL'))?.amount_cents).toBe(312780); // R$ 3.127,80
    expect(o2.rows.find((x) => x.label.startsWith('Taxa'))?.amount_cents).toBe(36968); // R$ 369,68
    expect(o2.total_cents).toBe(349748); // R$ 3.497,48
    expect(o2.rows.at(-1)?.amount_cents).toBe(34975); // 10 × R$ 349,75
  });
});

describe('motor de precificação — referência: proposta AH Crédito (42 h a R$ 50)', () => {
  it('descontos levam o preço a R$ 400,00 e o sistema ALERTA prejuízo (bloqueando a emissão sem confirmação)', () => {
    const input = base({
      hourly_rate_cents: 5000, pricing: {method: 'markup', markup_pct: 0}, discount: {type: 'amount', value: 140000},
      one_time_costs: [
        {id: 'a', label: 'Desenvolvimento', category: 'desenvolvimento', hours: 24},
        {id: 'b', label: 'Banco, API e login', category: 'desenvolvimento', hours: 12},
        {id: 'c', label: 'Instalação e implementação', category: 'implementacao', hours: 6, discount: {type: 'pct', value: 100}}
      ]
    });
    const res = calculate(input);
    expect(res.one_time.lines.reduce((s, l) => s + l.gross_cents, 0)).toBe(210000); // subtotal R$ 2.100,00
    expect(res.one_time.price_final_cents).toBe(40000); // R$ 400,00
    expect(res.dev_hours).toBe(36);
    expect(res.alerts.some((a) => a.code === 'below_cost' && a.blocking)).toBe(true);
    const ack = calculate({...input, acks: {...input.acks, below_cost: true}});
    expect(ack.alerts.find((a) => a.code === 'below_cost')?.blocking).toBe(false);
  });
});

describe('motor de precificação — regras', () => {
  it('24 h × R$ 35,00 = R$ 840,00 de custo de desenvolvimento', () => {
    const res = calculate(base({one_time_costs: [{id: 'd', label: 'Dev', category: 'desenvolvimento', hours: 24}]}));
    expect(res.one_time.cost_by_category.desenvolvimento).toBe(84000);
    expect(res.blocking_open).not.toContain('below_min_hours');
  });
  it('abaixo do mínimo de 24 h exige justificativa', () => {
    const input = base({one_time_costs: [{id: 'd', label: 'Dev', category: 'desenvolvimento', hours: 10}]});
    expect(calculate(input).blocking_open).toContain('below_min_hours');
    expect(calculate({...input, acks: {...input.acks, min_hours_reason: 'Ajuste pontual combinado'}}).blocking_open).not.toContain('below_min_hours');
  });
  it('licença: % sobre custo de desenvolvimento vs % sobre subtotal vs fixa', () => {
    const lines = [{id: 'd', label: 'Dev', category: 'desenvolvimento' as const, hours: 24}, {id: 'i', label: 'Infra', category: 'infraestrutura' as const, amount_cents: 16000}];
    const mk = (mode: 'pct_dev_cost' | 'pct_subtotal' | 'fixed_once', value: number) => calculate(base({one_time_costs: lines, license: {mode, value}, pricing: {method: 'markup', markup_pct: 0}}));
    expect(mk('pct_dev_cost', 20).one_time.license_cents).toBe(16800); // 20% de R$ 840,00
    expect(mk('pct_subtotal', 20).one_time.license_cents).toBe(20000); // 20% de R$ 1.000,00
    expect(mk('fixed_once', 50000).one_time.price_final_cents).toBe(100000 + 50000);
  });
  it('tributos nunca são presumidos: sem configuração validada = R$ 0 + bloqueio', () => {
    const input = base({tax: {initial_rate_pct: null, recurring_rate_pct: null, validated: false}, one_time_costs: [{id: 'x', label: 'x', category: 'outros', amount_cents: 10000}]});
    const res = calculate(input);
    expect(res.one_time.taxes_cents).toBe(0);
    expect(res.blocking_open).toContain('tax_unconfigured');
    expect(calculate({...input, acks: {...input.acks, no_tax_config: true}}).blocking_open).not.toContain('tax_unconfigured');
  });
  it('com alíquota validada: preço = custo ÷ (1 − margem − tributo) e margem final correta', () => {
    const res = calculate(base({tax: {initial_rate_pct: 6, recurring_rate_pct: 6, validated: true}, pricing: {method: 'margin', margin_pct: 20}, one_time_costs: [{id: 'x', label: 'x', category: 'outros', amount_cents: 74000}]}));
    expect(res.one_time.price_final_cents).toBe(100000); // 74.000 ÷ 0,74
    expect(res.one_time.taxes_cents).toBe(6000);
    expect(res.one_time.profit_cents).toBe(20000);
    expect(res.one_time.margin_pct).toBe(20);
  });
  it('desconto percentual reduz o lucro e a margem; alerta quando passa de 30%', () => {
    const res = calculate(base({discount: {type: 'pct', value: 10}, one_time_costs: [{id: 'x', label: 'x', category: 'outros', amount_cents: 80000}]}));
    expect(res.one_time.price_before_discount_cents).toBe(100000);
    expect(res.one_time.discount_cents).toBe(10000);
    expect(res.one_time.price_final_cents).toBe(90000);
    expect(res.one_time.profit_cents).toBe(10000);
    expect(res.one_time.margin_pct).toBe(11.11);
    expect(res.alerts.some((a) => a.code === 'margin_below_target')).toBe(true);
  });
  it('margem + tributo ≥ 100% é recusada', () => {
    const res = calculate(base({pricing: {method: 'margin', margin_pct: 95}, tax: {initial_rate_pct: 6, recurring_rate_pct: 6, validated: true}, one_time_costs: [{id: 'x', label: 'x', category: 'outros', amount_cents: 1000}]}));
    expect(res.blocking_open).toContain('one_time_margin_impossible');
  });
  it('separa custo interno de sustentação e preço mensal cobrado', () => {
    const res = calculate(base({recurring_costs: [{id: 's', label: 'Suporte reservado (2 h)', category: 'suporte', hours: 2, rate_cents: 3500}], recurring_pricing: {method: 'manual', manual_price_cents: 19000}}));
    expect(res.recurring.cost_cents).toBe(7000);
    expect(res.recurring.price_final_cents).toBe(19000);
    expect(res.recurring.profit_cents).toBe(12000);
  });
});

describe('catálogo: câmbio, periodicidade, rateio e dupla contagem', () => {
  const item = (o: Partial<CatalogItem>): CatalogItem => ({id: 'x', name: 'X', vendor: null, plan: null, category: 'infra', price_cents: 849, currency: 'EUR', periodicity: 'mensal', projects_served: 1, allocation_pct: null, included_in_id: null, price_verified: true, active: true, ...o});
  const fx: FxRate[] = [{currency: 'EUR', rate: 6, as_of: '2026-10-17', source: 'teste'}];

  it('Hetzner CX33 € 8,49/mês × cotação ÷ projetos hospedados', () => {
    const {resolved} = resolveCatalog([item({id: 'cx33', name: 'CX33', projects_served: 4})], ['cx33'], fx);
    expect(resolved[0]?.price_brl_cents).toBe(5094); // 8,49 × 6,00
    expect(resolved[0]?.allocated_monthly_cents).toBe(1274); // ÷ 4
  });
  it('domínio de 3 anos: equivalente mensal e valor do período', () => {
    const {resolved} = resolveCatalog([item({id: 'd', currency: 'BRL', price_cents: 13098, periodicity: 'trienal'})], ['d'], []);
    expect(resolved[0]?.allocated_period_cents).toBe(13098);
    expect(resolved[0]?.monthly_brl_cents).toBe(364);
  });
  it('item incluído em outro plano não é contado duas vezes', () => {
    const {resolved, warnings} = resolveCatalog([item({id: 'pg', name: 'PostgreSQL', currency: 'BRL', price_cents: 2000, included_in_id: 'rw'}), item({id: 'rw', name: 'Railway', currency: 'BRL', price_cents: 10000})], ['rw', 'pg'], []);
    expect(resolved.find((x) => x.item_id === 'pg')?.allocated_monthly_cents).toBe(0);
    expect(resolved.find((x) => x.item_id === 'pg')?.excluded_reason).toBe('incluido_em_outro_plano');
    expect(warnings.join()).toMatch(/duplicidade/);
  });
  it('não inventa preço: item sem preço verificado ou sem câmbio é excluído com aviso', () => {
    const {resolved, warnings} = resolveCatalog([item({id: 'a', price_cents: null}), item({id: 'b', currency: 'USD'})], ['a', 'b'], fx);
    expect(resolved.map((x) => x.excluded_reason)).toEqual(['sem_preco', 'sem_cambio']);
    expect(warnings).toHaveLength(2);
  });
  it('percentual de alocação manual prevalece sobre ÷ projetos', () => {
    const {resolved} = resolveCatalog([item({id: 'a', currency: 'BRL', price_cents: 10000, projects_served: 5, allocation_pct: 40})], ['a'], []);
    expect(resolved[0]?.allocated_monthly_cents).toBe(4000);
  });
});

describe('Pix copia e cola', () => {
  // ...
  it('CRC16/CCITT-FALSE confere com o vetor padrão', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
  it('gera payload válido com a chave CNPJ da Argos (sem valor)', () => {
    const p = buildPixPayload({key: '65305027000138', receiver_name: 'ARGOS SOLUÇÕES', city: 'Natal'});
    expect(p.startsWith('000201010211')).toBe(true);
    const v = validatePixPayload(p);
    expect(v.errors).toEqual([]);
    expect(v.valid).toBe(true);
    expect(v.fields).toMatchObject({key: '65305027000138', name: 'ARGOS SOLUCOES', city: 'NATAL'});
  });
  it('com valor e chave aleatória', () => {
    const p = buildPixPayload({key: '16596a82-a0ae-4de7-98ab-9e487c7e74f9', receiver_name: 'Argos', city: 'Natal', amount_cents: 149980});
    const v = validatePixPayload(p);
    expect(v.valid).toBe(true);
    expect(v.fields.amount).toBe('1499.80');
    expect(p).toContain('0101' + '12'.slice(0, 0)); // campo 01 presente
  });
  it('detecta adulteração (CRC) e campos inválidos', () => {
    const p = buildPixPayload({key: '65305027000138', receiver_name: 'ARGOS', city: 'NATAL', amount_cents: 1000});
    const bad = p.replace('10.00', '99.00');
    expect(validatePixPayload(bad).errors).toContain('CRC16 inválido');
    expect(validatePixPayload('abc').valid).toBe(false);
  });
  it('valida chaves', () => {
    expect(validatePixKey('65305027000138')).toBe(true);
    expect(validatePixKey('16596a82-a0ae-4de7-98ab-9e487c7e74f9')).toBe(true);
    expect(validatePixKey('chave-invalida')).toBe(false);
  });
});
