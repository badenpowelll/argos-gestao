import {Alert, Badge, Button, Card, Checkbox, Input, Select, Textarea} from '../ds';
import {brl} from '../format';
import {Money, MoneyInput} from '../ui';
import {CATEGORY_LABEL, uid, type CatalogItem, type CatalogRef, type Category, type Computed, type CostLine, type Method, type PaymentOption} from './types';

const catOptions = (cats: Category[]) => cats.map((c) => ({value: c, label: CATEGORY_LABEL[c]}));
const ONE_CATS = catOptions(['desenvolvimento', 'testes', 'publicacao', 'implementacao', 'treinamento', 'ferramentas', 'infraestrutura', 'dominio_email', 'registro', 'outros']);
const REC_CATS = catOptions(['ferramentas', 'infraestrutura', 'suporte', 'manutencao', 'monitoramento', 'backup', 'outros']);

export function LinesEditor({lines, onChange, recurring, hourlyRate}: {lines: CostLine[]; onChange: (l: CostLine[]) => void; recurring?: boolean; hourlyRate: number}) {
  const set = (i: number, patch: Partial<CostLine>) => onChange(lines.map((l, j) => (j === i ? {...l, ...patch} : l)));
  return (
    <div className="stack-lg">
      {lines.map((l, i) => {
        const byHours = l.hours !== null && l.hours !== undefined;
        return (
          <div key={l.id} className="item-card">
            <div className="form-grid">
              <Input label="Descrição" value={l.label} onChange={(e) => set(i, {label: e.target.value})} />
              <Select label="Categoria" value={l.category} options={recurring ? REC_CATS : ONE_CATS} onChange={(e) => set(i, {category: e.target.value as Category})} />
              <Select label="Calcular por" value={byHours ? 'horas' : 'valor'} options={[{value: 'horas', label: 'Horas × valor/hora'}, {value: 'valor', label: 'Valor fixo'}]}
                onChange={(e) => set(i, e.target.value === 'horas' ? {hours: 1, amount_cents: null} : {hours: null, rate_cents: null, amount_cents: 0})} />
              {byHours ? (<>
                <Input label="Horas" type="number" min={0} step="0.5" value={String(l.hours ?? 0)} onChange={(e) => set(i, {hours: Number(e.target.value)})} />
                <MoneyInput label="Valor/hora (vazio = padrão)" value={l.rate_cents ?? null} onChange={(c) => set(i, {rate_cents: c})} hint={`Padrão: ${brl(hourlyRate)}`} />
              </>) : <MoneyInput label={recurring ? 'Valor mensal' : 'Valor'} value={l.amount_cents ?? 0} onChange={(c) => set(i, {amount_cents: c ?? 0})} />}
              {!recurring && (<>
                <Select label="Desconto na linha" value={l.discount?.type ?? ''} placeholder="Sem desconto" options={[{value: 'pct', label: 'Percentual'}, {value: 'amount', label: 'Em reais'}]}
                  onChange={(e) => set(i, {discount: e.target.value ? {type: e.target.value as 'pct' | 'amount', value: 0} : null})} />
                {l.discount && (l.discount.type === 'pct'
                  ? <Input label="Desconto (%)" type="number" min={0} max={100} value={String(l.discount.value)} onChange={(e) => set(i, {discount: {type: 'pct', value: Number(e.target.value)}})} />
                  : <MoneyInput label="Desconto (R$)" value={l.discount.value} onChange={(c) => set(i, {discount: {type: 'amount', value: c ?? 0}})} />)}
              </>)}
            </div>
            <div><Button variant="outline" size="sm" onClick={() => onChange(lines.filter((_, j) => j !== i))}>Remover linha</Button></div>
          </div>
        );
      })}
      <div className="dialog-actions" style={{justifyContent: 'flex-start'}}>
        <Button variant="outline" onClick={() => onChange([...lines, {id: uid(), label: '', category: recurring ? 'suporte' : 'desenvolvimento', hours: recurring ? null : 1, amount_cents: recurring ? 0 : null}])}>+ Linha</Button>
      </div>
    </div>
  );
}

export function CatalogRefsEditor({refs, onChange, catalog, resolved, recurring}: {refs: CatalogRef[]; onChange: (r: CatalogRef[]) => void; catalog: CatalogItem[]; resolved: Computed['catalog_resolved']['one_time']; recurring?: boolean}) {
  const set = (i: number, patch: Partial<CatalogRef>) => onChange(refs.map((r, j) => (j === i ? {...r, ...patch} : r)));
  const opts = catalog.filter((c) => c.active).map((c) => ({value: c.id, label: `${c.name}${c.price_cents === null ? ' (sem preço)' : ''}`}));
  return (
    <div className="stack-lg">
      {refs.map((ref, i) => {
        const r = resolved.find((x) => x.item_id === ref.catalog_item_id);
        return (
          <div key={i} className="item-card">
            <div className="form-grid">
              <Select label="Item do catálogo" value={ref.catalog_item_id} placeholder="Selecione" options={opts} onChange={(e) => set(i, {catalog_item_id: e.target.value})} />
              <Select label="Categoria" value={ref.category} options={recurring ? REC_CATS : ONE_CATS} onChange={(e) => set(i, {category: e.target.value as Category})} />
              {!recurring && <Select label="Como cobrar" value={ref.mode} options={[{value: 'months', label: 'N meses de rateio mensal'}, {value: 'period', label: 'Período inteiro (ex.: domínio 3 anos)'}]} onChange={(e) => set(i, {mode: e.target.value as 'period' | 'months'})} />}
              {!recurring && ref.mode === 'months' && <Input label="Meses" type="number" min={1} value={String(ref.months)} onChange={(e) => set(i, {months: Math.max(1, Number(e.target.value))})} />}
            </div>
            {r && (r.excluded_reason
              ? <Alert tone="warning" title="Item não considerado">{r.excluded_reason === 'incluido_em_outro_plano' ? 'Já incluído em outro plano selecionado (sem dupla contagem).' : r.excluded_reason === 'sem_preco' ? 'Sem preço verificado: preencha no catálogo.' : r.excluded_reason === 'sem_cambio' ? 'Sem cotação cadastrada para a moeda.' : 'Item inativo.'}</Alert>
              : <p className="muted" style={{margin: 0, fontSize: '.85rem'}}>
                  {r.fx ? `${r.currency} ${((r.price_cents ?? 0) / 100).toFixed(2)} × ${r.fx.rate} (${r.fx.as_of}) = ${brl(r.price_brl_cents)} · ` : ''}rateio {String(r.allocation_pct).replace('.', ',')}% → <strong>{brl(recurring || ref.mode === 'months' ? r.allocated_monthly_cents * (recurring ? 1 : ref.months) : r.allocated_period_cents)}</strong>
                </p>)}
            <div><Button variant="outline" size="sm" onClick={() => onChange(refs.filter((_, j) => j !== i))}>Remover</Button></div>
          </div>
        );
      })}
      <div><Button variant="outline" onClick={() => onChange([...refs, {catalog_item_id: '', category: recurring ? 'ferramentas' : 'ferramentas', mode: 'months', months: 1}])}>+ Item do catálogo</Button></div>
    </div>
  );
}

export function ListEditor({label, hint, value, onChange}: {label: string; hint?: string; value: string[]; onChange: (v: string[]) => void}) {
  return <Textarea label={label} hint={hint ?? 'Um item por linha'} rows={Math.max(4, value.length + 1)} value={value.join('\n')} onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trimStart()))} />;
}
export const cleanList = (v: string[]) => v.map((s) => s.trim()).filter(Boolean);

export function MethodEditor({title, value, onChange}: {title: string; value: Method; onChange: (m: Method) => void}) {
  return (
    <fieldset className="form-section">
      <legend>{title}</legend>
      <div className="form-grid">
        <Select label="Método" value={value.method} onChange={(e) => onChange({...value, method: e.target.value as Method['method']})}
          options={[{value: 'margin', label: 'Margem desejada sobre o preço (líquida de tributos)'}, {value: 'markup', label: 'Markup sobre o custo'}, {value: 'manual', label: 'Preço definido manualmente'}]} />
        {value.method === 'margin' && <Input label="Margem sobre o preço (%)" type="number" min={0} max={99} step="0.5" value={String(value.margin_pct ?? 0)} onChange={(e) => onChange({...value, margin_pct: Number(e.target.value)})} hint="preço = custo ÷ (1 − margem − tributo)" />}
        {value.method === 'markup' && <Input label="Markup sobre o custo (%)" type="number" min={0} step="0.5" value={String(value.markup_pct ?? 0)} onChange={(e) => onChange({...value, markup_pct: Number(e.target.value)})} hint="preço = custo × (1 + markup). Markup 25% ≙ margem 20%." />}
        {value.method === 'manual' && <MoneyInput label="Preço negociado" value={value.manual_price_cents ?? null} onChange={(c) => onChange({...value, manual_price_cents: c})} />}
      </div>
    </fieldset>
  );
}

const OPTION_TYPES = [
  ['a_vista', 'Entrada à vista'], ['entrada_mensalidades', 'Entrada + mensalidades'], ['cartao', 'Parcelamento no cartão'], ['assinatura_mensal', 'Assinatura mensal'],
  ['anual', 'Pagamento anual'], ['por_usuario', 'Cobrança por usuário'], ['consumo', 'Cobrança por consumo'], ['personalizada', 'Condição personalizada']
] as const;

export function newOption(type: PaymentOption['type']): PaymentOption {
  const id = uid('opt');
  switch (type) {
    case 'a_vista': return {id, type, include_first_monthly: false};
    case 'entrada_mensalidades': return {id, type, include_first_monthly: true};
    case 'cartao': return {id, type, base: 'inicial', installments: 10, fee_pct: 0, fee_passed: true, include_first_monthly: false};
    case 'assinatura_mensal': return {id, type, months: 12};
    case 'anual': return {id, type, discount_pct: 0};
    case 'por_usuario': return {id, type, unit_price_cents: 0, users: 1};
    case 'consumo': return {id, type, unit_label: 'unidade', unit_price_cents: 0, estimated_units: null};
    default: return {id, type: 'personalizada', description: ''};
  }
}

export function PaymentEditor({options, onChange, cardFees}: {options: PaymentOption[]; onChange: (o: PaymentOption[]) => void; cardFees: {installments: number; fee_pct: number; source?: string}[]}) {
  const set = (i: number, patch: Record<string, unknown>) => onChange(options.map((o, j) => (j === i ? ({...o, ...patch} as PaymentOption) : o)));
  return (
    <div className="stack-lg">
      {options.map((o, i) => (
        <div key={o.id} className="item-card">
          <div className="form-grid">
            <Select label="Tipo" value={o.type} options={OPTION_TYPES.map(([v, l]) => ({value: v, label: l}))} onChange={(e) => onChange(options.map((x, j) => (j === i ? {...newOption(e.target.value as PaymentOption['type']), id: x.id} : x)))} />
            <Input label="Título (opcional)" value={o.label ?? ''} onChange={(e) => set(i, {label: e.target.value || undefined})} />
            {(o.type === 'a_vista' || o.type === 'entrada_mensalidades' || o.type === 'cartao') && <Checkbox label="Incluir a 1ª mensalidade na entrada" checked={!!o.include_first_monthly} onChange={(e) => set(i, {include_first_monthly: e.target.checked})} />}
            {o.type === 'cartao' && (<>
              <Select label="Base" value={o.base} options={[{value: 'inicial', label: 'Valor inicial (entrada)'}, {value: 'primeiro_ano', label: 'Primeiro ano (entrada + mensalidades)'}]} onChange={(e) => set(i, {base: e.target.value})} />
              <Input label="Parcelas" type="number" min={1} max={24} value={String(o.installments)} onChange={(e) => { const n = Number(e.target.value); const f = cardFees.find((x) => x.installments === n); set(i, {installments: n, ...(f ? {fee_pct: f.fee_pct} : {})}); }} />
              <Input label="Taxa do cartão (%)" type="number" min={0} step="0.01" value={String(o.fee_pct)} onChange={(e) => set(i, {fee_pct: Number(e.target.value)})} hint={cardFees.find((x) => x.installments === o.installments)?.source ?? 'Informe a taxa da sua maquininha'} />
              <Select label="Taxa" value={o.fee_passed ? 'repassada' : 'absorvida'} options={[{value: 'repassada', label: 'Repassada ao cliente'}, {value: 'absorvida', label: 'Absorvida pela Argos'}]} onChange={(e) => set(i, {fee_passed: e.target.value === 'repassada'})} />
            </>)}
            {(o.type === 'assinatura_mensal' || o.type === 'entrada_mensalidades') && <Input label="Prazo (meses, opcional)" type="number" min={1} value={String((o as {months?: number}).months ?? '')} onChange={(e) => set(i, {months: e.target.value ? Number(e.target.value) : undefined})} />}
            {o.type === 'anual' && <Input label="Desconto no pagamento anual (%)" type="number" min={0} max={100} value={String(o.discount_pct ?? 0)} onChange={(e) => set(i, {discount_pct: Number(e.target.value)})} />}
            {o.type === 'por_usuario' && (<><MoneyInput label="Valor por usuário/mês" value={o.unit_price_cents} onChange={(c) => set(i, {unit_price_cents: c ?? 0})} /><Input label="Usuários" type="number" min={1} value={String(o.users)} onChange={(e) => set(i, {users: Number(e.target.value)})} /></>)}
            {o.type === 'consumo' && (<><Input label="Unidade" value={o.unit_label} onChange={(e) => set(i, {unit_label: e.target.value})} /><MoneyInput label="Valor por unidade" value={o.unit_price_cents} onChange={(c) => set(i, {unit_price_cents: c ?? 0})} /><Input label="Estimativa de unidades" type="number" min={0} value={String(o.estimated_units ?? '')} onChange={(e) => set(i, {estimated_units: e.target.value ? Number(e.target.value) : null})} /></>)}
            {o.type === 'personalizada' && (<><Input label="Descrição" value={o.description} onChange={(e) => set(i, {description: e.target.value})} /><MoneyInput label="Valor (opcional)" value={o.amount_cents ?? null} onChange={(c) => set(i, {amount_cents: c})} /></>)}
          </div>
          <div><Button variant="outline" size="sm" onClick={() => onChange(options.filter((_, j) => j !== i))}>Remover opção</Button></div>
        </div>
      ))}
      <div className="dialog-actions" style={{justifyContent: 'flex-start'}}>
        {OPTION_TYPES.slice(0, 4).map(([v, l]) => <Button key={v} variant="outline" size="sm" onClick={() => onChange([...options, newOption(v)])}>+ {l}</Button>)}
        <Select label="Outras" value="" placeholder="+ Outra forma…" options={OPTION_TYPES.slice(4).map(([v, l]) => ({value: v, label: l}))} onChange={(e) => e.target.value && onChange([...options, newOption(e.target.value as PaymentOption['type'])])} />
      </div>
    </div>
  );
}

const pct = (v: number | null) => (v === null ? '—' : `${String(v).replace('.', ',')}%`);

/** Simulação de lucro e margem (visão administrativa — nunca vai ao cliente por padrão). */
export function SimulationPanel({c, loading}: {c: Computed | null; loading: boolean}) {
  if (!c) return <Card title="Simulação"><p className="muted">{loading ? 'Calculando…' : 'Sem dados.'}</p></Card>;
  const o = c.result.one_time, m = c.result.recurring;
  const row = (l: string, v: React.ReactNode, strong = false) => <div><span>{l}</span><span style={{fontWeight: strong ? 800 : 400}}>{v}</span></div>;
  const cat = (k: Category) => o.cost_by_category[k] ?? 0;
  return (
    <Card title="Simulação de lucro e margem (visão interna)" aria-busy={loading}>
      <div className="totals">
        <strong>Parte inicial (único)</strong>
        {row('Custo de desenvolvimento', brl(cat('desenvolvimento') + cat('testes') + cat('publicacao')))}
        {row('Custo de implementação', brl(cat('implementacao')))}
        {row('Custo de treinamento', brl(cat('treinamento')))}
        {row('Custo de ferramentas', brl(cat('ferramentas')))}
        {row('Custo de infraestrutura / domínio / registros', brl(cat('infraestrutura') + cat('dominio_email') + cat('registro') + cat('outros') + cat('backup') + cat('monitoramento')))}
        {row('CUSTO TOTAL', <Money cents={o.cost_cents} strong />, true)}
        {o.license_cents > 0 && row('Licença (receita)', brl(o.license_cents))}
        {row('Preço sugerido', brl(o.price_suggested_cents))}
        {o.discount_cents > 0 && row('Desconto', `- ${brl(o.discount_cents)}`)}
        {row('PREÇO FINAL NEGOCIADO', <Money cents={o.price_final_cents} strong />, true)}
        {row(`Tributos estimados${o.tax_rate_pct !== null ? ` (${pct(o.tax_rate_pct)})` : ''}`, brl(o.taxes_cents))}
        {row('Lucro estimado', <span style={{color: o.profit_cents < 0 ? 'var(--ads-color-danger-text)' : undefined}}>{brl(o.profit_cents)}</span>, true)}
        {row('Margem (sobre o preço)', pct(o.margin_pct), true)}
        {row('Markup (sobre o custo)', pct(o.markup_pct))}
      </div>
      <div className="totals" style={{marginTop: 12}}>
        <strong>Mensalidade</strong>
        {row('Custo interno de sustentação/infra', brl(m.cost_cents))}
        {m.license_cents > 0 && row('Licença mensal', brl(m.license_cents))}
        {row('PREÇO MENSAL COBRADO', <Money cents={m.price_final_cents} strong />, true)}
        {row('Tributos estimados', brl(m.taxes_cents))}
        {row('Lucro mensal', brl(m.profit_cents))}
        {row('Margem mensal', pct(m.margin_pct))}
      </div>
      {c.tax_used ? <p className="muted" style={{fontSize: '.8rem'}}>Tributação: {c.tax_used.name} (validada por {c.tax_used.validated_by_name}).</p> : null}
      {c.fx_used.map((f) => <p key={f.currency} className="muted" style={{fontSize: '.8rem', margin: 0}}>Câmbio {f.currency}/BRL {String(f.rate)} em {f.as_of} — {f.source}</p>)}
      <div className="stack-lg" style={{marginTop: 12}}>
        {c.result.alerts.map((a) => <Alert key={a.code} tone={a.level === 'critico' ? 'danger' : a.level === 'aviso' ? 'warning' : 'info'} title={a.blocking ? 'Bloqueia a emissão' : a.level === 'info' ? 'Informação' : 'Atenção'}>{a.message}</Alert>)}
        {c.warnings.map((w, i) => <Alert key={i} tone="warning" title="Catálogo">{w}</Alert>)}
        {c.result.blocking_open.length === 0 && <Badge tone="success">Sem bloqueios para emissão</Badge>}
      </div>
    </Card>
  );
}
