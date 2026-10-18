import {Button, Checkbox, Input, Select, Textarea} from '../ds';
import {brl, label} from '../format';
import {MoneyInput} from '../ui';

export interface ItemForm {
  kind: string; description: string; billing_type: string; unit: number | null; quantity: string; installments: string;
  interval_months: string; first_due_date: string; discount: number | null;
}
export const emptyItem = (over: Partial<ItemForm> = {}): ItemForm => ({
  kind: 'mensalidade', description: '', billing_type: 'recorrente', unit: null, quantity: '1', installments: '', interval_months: '1', first_due_date: '', discount: 0, ...over
});
export const itemPayload = (i: ItemForm) => ({
  kind: i.kind, description: i.description.trim(), billing_type: i.billing_type, unit_amount_cents: i.unit ?? 0, quantity: Number(i.quantity.replace(',', '.')) || 1,
  installments: i.billing_type === 'parcelado' && i.installments ? Number(i.installments) : null, interval_months: Number(i.interval_months) || 1,
  first_due_date: i.first_due_date || null, discount_cents: i.discount ?? 0
});
export const itemTotal = (i: ItemForm) => Math.round((i.unit ?? 0) * (Number(i.quantity.replace(',', '.')) || 1));

const KINDS = ['implementacao', 'desenvolvimento', 'licenca', 'mensalidade', 'hospedagem', 'dominio', 'treinamento', 'suporte', 'outro'];
const BILLING = ['unico', 'recorrente', 'parcelado', 'por_usuario', 'sob_demanda'];

export function ItemFields({value, onChange, onRemove}: {value: ItemForm; onChange: (v: ItemForm) => void; onRemove?: () => void}) {
  const set = (k: keyof ItemForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({...value, [k]: e.target.value});
  const perUser = value.billing_type === 'por_usuario';
  return (
    <div className="item-card">
      <div className="form-grid">
        <Select label="Tipo de serviço" value={value.kind} onChange={set('kind')} options={KINDS.map((k) => ({value: k, label: label(k)}))} />
        <Input label="Descrição" required value={value.description} onChange={set('description')} />
        <Select label="Cobrança" value={value.billing_type} onChange={set('billing_type')} options={BILLING.map((k) => ({value: k, label: label(k)}))}
          hint={value.billing_type === 'sob_demanda' ? 'Não gera cobrança automática' : undefined} />
        <MoneyInput label={perUser ? 'Valor por usuário' : value.billing_type === 'parcelado' ? 'Valor total' : 'Valor'} required value={value.unit} onChange={(c) => onChange({...value, unit: c})} />
        {perUser && <Input label="Usuários" type="number" min={1} value={value.quantity} onChange={set('quantity')} hint={`Total mensal: ${brl(itemTotal(value))}`} />}
        {value.billing_type === 'parcelado' && <Input label="Parcelas" type="number" min={1} max={120} value={value.installments} onChange={set('installments')} required />}
        {(value.billing_type === 'recorrente' || value.billing_type === 'por_usuario' || value.billing_type === 'parcelado') && (
          <Select label="Periodicidade" value={value.interval_months} onChange={set('interval_months')} options={[{value: '1', label: 'Mensal'}, {value: '3', label: 'Trimestral'}, {value: '6', label: 'Semestral'}, {value: '12', label: 'Anual'}]} />)}
        {value.billing_type !== 'sob_demanda' && <Input label="Primeiro vencimento" type="date" value={value.first_due_date} onChange={set('first_due_date')} required />}
        <MoneyInput label="Desconto por cobrança" value={value.discount} onChange={(c) => onChange({...value, discount: c})} />
      </div>
      {onRemove && <div><Button variant="outline" size="sm" onClick={onRemove}>Remover item</Button></div>}
    </div>
  );
}

export interface ContractForm {
  kind: string; object: string; signed_at: string; start_date: string; end_date: string; auto_renew: boolean; adjustment_index: string; adjustment_month: string;
  payment_terms: string; due_day: string; fine_percent: string; interest_monthly_percent: string; is_public_flow: boolean; administrative_process: string;
  commitment_number: string; notes: string; system_id: string;
}
export const emptyContract = (over: Partial<ContractForm> = {}): ContractForm => ({
  kind: 'contrato', object: '', signed_at: '', start_date: '', end_date: '', auto_renew: false, adjustment_index: '', adjustment_month: '', payment_terms: '', due_day: '',
  fine_percent: '0', interest_monthly_percent: '0', is_public_flow: false, administrative_process: '', commitment_number: '', notes: '', system_id: '', ...over
});
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
export const contractPayload = (c: ContractForm) => ({
  kind: c.kind, object: c.object || null, signed_at: c.signed_at || null, start_date: c.start_date || null, end_date: c.end_date || null, auto_renew: c.auto_renew,
  adjustment_index: c.adjustment_index || null, adjustment_month: num(c.adjustment_month), payment_terms: c.payment_terms || null, due_day: num(c.due_day),
  fine_percent: num(c.fine_percent) ?? 0, interest_monthly_percent: num(c.interest_monthly_percent) ?? 0, is_public_flow: c.is_public_flow,
  administrative_process: c.administrative_process || null, commitment_number: c.commitment_number || null, notes: c.notes || null, system_id: c.system_id || null
});

export function ContractFields({value, onChange, systems, lockKind}: {value: ContractForm; onChange: (v: ContractForm) => void; systems?: {id: string; name: string}[]; lockKind?: boolean}) {
  const set = (k: keyof ContractForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange({...value, [k]: e.target.value});
  return (
    <div className="stack-lg">
      <fieldset className="form-section">
        <legend>Dados do contrato</legend>
        <div className="form-grid">
          <Select label="Natureza do documento" required value={value.kind} onChange={set('kind')} disabled={lockKind}
            hint={value.kind === 'proposta' ? 'Proposta NÃO gera cobranças.' : 'Contrato assinado/aditivo.'} options={[{value: 'contrato', label: 'Contrato assinado'}, {value: 'proposta', label: 'Proposta'}, {value: 'aditivo', label: 'Aditivo'}]} />
          {systems && <Select label="Sistema vinculado" value={value.system_id} placeholder="(nenhum)" onChange={set('system_id')} options={systems.map((s) => ({value: s.id, label: s.name}))} />}
          <Input label="Data de assinatura" type="date" value={value.signed_at} onChange={set('signed_at')} hint="Obrigatória para ativar" />
          <Input label="Início da vigência" type="date" value={value.start_date} onChange={set('start_date')} />
          <Input label="Fim da vigência" type="date" value={value.end_date} onChange={set('end_date')} />
          <Input label="Dia de vencimento" type="number" min={1} max={31} value={value.due_day} onChange={set('due_day')} />
          <Input label="Multa por atraso (%)" inputMode="decimal" value={value.fine_percent} onChange={set('fine_percent')} />
          <Input label="Juros ao mês (%)" inputMode="decimal" value={value.interest_monthly_percent} onChange={set('interest_monthly_percent')} />
          <Input label="Índice de reajuste" value={value.adjustment_index} onChange={set('adjustment_index')} placeholder="IPCA, IGP-M…" />
          <Input label="Mês do reajuste (1–12)" type="number" min={1} max={12} value={value.adjustment_month} onChange={set('adjustment_month')} />
          <div className="span-2"><Textarea label="Objeto" rows={3} value={value.object} onChange={set('object')} /></div>
          <div className="span-2"><Textarea label="Condições de pagamento" rows={2} value={value.payment_terms} onChange={set('payment_terms')} /></div>
          <Checkbox label="Renovação automática" checked={value.auto_renew} onChange={(e) => onChange({...value, auto_renew: e.target.checked})} />
        </div>
      </fieldset>
      <fieldset className="form-section">
        <legend>Setor público (opcional)</legend>
        <Checkbox label="Este contrato segue fluxo de órgão público (processo, empenho, nota fiscal)" checked={value.is_public_flow} onChange={(e) => onChange({...value, is_public_flow: e.target.checked})} />
        {value.is_public_flow && (<div className="form-grid">
          <Input label="Processo administrativo" value={value.administrative_process} onChange={set('administrative_process')} />
          <Input label="Nº do empenho" value={value.commitment_number} onChange={set('commitment_number')} />
        </div>)}
        <p className="muted" style={{fontSize: '.85rem', margin: 0}}>Nota fiscal, liquidação, competência e previsão de pagamento são informadas em cada cobrança, conforme aplicável.</p>
      </fieldset>
      <Textarea label="Observações internas" rows={2} value={value.notes} onChange={set('notes')} />
    </div>
  );
}
