import {useMemo, useRef, useState} from 'react';
import {Link as RLink, useSearchParams} from 'react-router-dom';
import {Alert, Button, Card, Checkbox, DataTable, Dialog, Input, Select, Textarea, useToast} from '../ds';
import {api, qs} from '../api';
import {useAuth} from '../auth';
import {brl, dateBR, dateTimeBR, label, newKey} from '../format';
import {ConfirmDialog, ErrorNote, Loading, Money, MoneyInput, PageHeader, Status, useLoad} from '../ui';

export interface Charge {
  id: string; client_id: string; client_name: string; contract_id: string | null; contract_number: string | null; system_name: string | null; description: string;
  due_date: string; amount_cents: number; discount_cents: number; interest_cents: number; fine_cents: number; paid_cents: number; total_cents: number; balance_cents: number;
  status: string; display_status: string; competence: string | null; administrative_process: string | null; commitment_number: string | null; invoice_number: string | null;
  liquidation_date: string | null; payment_forecast_date: string | null;
}
interface Payment {id: string; method: string; amount_cents: number; paid_at: string; reference: string | null; operator_name: string; status: string; reversal_reason: string | null}
interface ChargeDetail {charge: Charge; payments: Payment[]; suggested_fees: {days_late: number; fine_cents: number; interest_cents: number}; history: {at: string; user_name: string; action: string; detail: unknown}[]}

const METHODS = ['pix', 'transferencia', 'cartao', 'boleto', 'dinheiro'].map((m) => ({value: m, label: label(m)}));
interface Line {method: string; amount: number | null; reference: string}

/** PDV: RECEBER / DAR BAIXA */
export function ReceiveDialog({chargeId, onClose, onDone}: {chargeId: string; onClose: () => void; onDone: () => void}) {
  const {can} = useAuth();
  const {toast} = useToast();
  const keyRef = useRef(newKey()); // mesma chave em reenvios: impede baixa duplicada
  const {data, error, loading} = useLoad(() => api.get<ChargeDetail>(`/charges/${chargeId}`), [chargeId]);
  const [lines, setLines] = useState<Line[]>([{method: 'pix', amount: null, reference: ''}]);
  const [adj, setAdj] = useState<{discount: number | null; interest: number | null; fine: number | null} | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const finance = can('admin', 'financeiro');

  const c = data?.charge;
  const a = adj ?? (c ? {discount: c.discount_cents, interest: c.interest_cents, fine: c.fine_cents} : {discount: 0, interest: 0, fine: 0});
  const total = c ? c.amount_cents - (a.discount ?? 0) + (a.interest ?? 0) + (a.fine ?? 0) : 0;
  const balance = c ? total - c.paid_cents : 0;
  const sum = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const remaining = balance - sum;
  const valid = !!c && sum > 0 && remaining >= 0 && lines.every((l) => (l.amount ?? 0) > 0) && confirmed;

  async function submit() {
    if (!c) return;
    setBusy(true); setErr(null);
    try {
      const changed = adj && (adj.discount !== c.discount_cents || adj.interest !== c.interest_cents || adj.fine !== c.fine_cents);
      const r = await api.post<{duplicate: boolean; charge: {status: string}}>(`/charges/${c.id}/receive`, {
        idempotency_key: keyRef.current, confirm: true,
        lines: lines.map((l) => ({method: l.method, amount_cents: l.amount, reference: l.reference || null})),
        adjustments: changed ? {discount_cents: a.discount ?? 0, interest_cents: a.interest ?? 0, fine_cents: a.fine ?? 0} : null
      });
      toast({title: r.duplicate ? 'Este recebimento já havia sido registrado' : r.charge.status === 'paga' ? 'Cobrança quitada' : 'Pagamento parcial registrado', tone: 'success'});
      onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open onClose={onClose} title="Receber / dar baixa">
      <div className="dialog-body">
        {loading && !data ? <Loading /> : <ErrorNote error={error} />}
        {c && (<>
          <div className="totals">
            <div><span>Cliente</span><strong>{c.client_name}</strong></div>
            <div><span>{c.description}</span><span>venc. {dateBR(c.due_date)}</span></div>
            <div><span>Valor</span><Money cents={c.amount_cents} /></div>
            {c.paid_cents > 0 && <div><span>Já pago</span><Money cents={c.paid_cents} /></div>}
          </div>
          {data.suggested_fees.days_late > 0 && (
            <Alert tone="warning" title={`${data.suggested_fees.days_late} dia(s) em atraso`}>
              Pelo contrato: multa {brl(data.suggested_fees.fine_cents)} + juros {brl(data.suggested_fees.interest_cents)}.{' '}
              {finance ? <Button size="sm" variant="outline" onClick={() => setAdj({discount: a.discount, interest: data.suggested_fees.interest_cents, fine: data.suggested_fees.fine_cents})}>Aplicar encargos do contrato</Button> : 'Peça ao financeiro para aplicar.'}
            </Alert>)}
          {finance && (
            <details>
              <summary>Descontos, juros e multa</summary>
              <div className="form-grid" style={{marginTop: 8}}>
                <MoneyInput label="Desconto" value={a.discount} onChange={(v) => setAdj({...a, discount: v})} />
                <MoneyInput label="Juros" value={a.interest} onChange={(v) => setAdj({...a, interest: v})} />
                <MoneyInput label="Multa" value={a.fine} onChange={(v) => setAdj({...a, fine: v})} />
              </div>
            </details>)}
          <div className="totals">
            <div className="big"><span>Saldo a receber</span><Money cents={balance} strong /></div>
            <div><span>Informado</span><Money cents={sum} /></div>
            <div><span>Restante após esta baixa</span><strong style={{color: remaining < 0 ? 'var(--ads-color-danger-text)' : undefined}}>{brl(remaining)}</strong></div>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="pay-line">
              <Select label="Forma" value={l.method} options={METHODS} onChange={(e) => setLines(lines.map((x, j) => (j === i ? {...x, method: e.target.value} : x)))} />
              <MoneyInput label="Valor" value={l.amount} onChange={(v) => setLines(lines.map((x, j) => (j === i ? {...x, amount: v} : x)))} />
              <Input label="Referência / comprovante" value={l.reference} onChange={(e) => setLines(lines.map((x, j) => (j === i ? {...x, reference: e.target.value} : x)))} placeholder="ID Pix, autenticação, nº…" />
              {lines.length > 1 && <Button variant="outline" size="sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remover</Button>}
            </div>))}
          <div className="dialog-actions" style={{justifyContent: 'flex-start'}}>
            <Button variant="outline" size="sm" onClick={() => setLines([{...(lines[0] as Line), amount: balance}, ...lines.slice(1)])}>Preencher saldo total</Button>
            <Button variant="outline" size="sm" onClick={() => setLines([...lines, {method: 'dinheiro', amount: remaining > 0 ? remaining : null, reference: ''}])}>+ Outra forma de pagamento</Button>
          </div>
          <Checkbox label={`Confirmo o recebimento de ${brl(sum)}`} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <ErrorNote error={err} />
          <div className="dialog-actions"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!valid} onClick={submit}>Dar baixa</Button></div>
        </>)}
      </div>
    </Dialog>
  );
}

function ChargeDetailDialog({id, onClose, onChanged}: {id: string; onClose: () => void; onChanged: () => void}) {
  const {can} = useAuth();
  const {toast} = useToast();
  const {data, error, loading, reload} = useLoad(() => api.get<ChargeDetail>(`/charges/${id}`), [id]);
  const wa = useLoad(() => api.get<{message: string; link: string | null; phone: string | null; client_has_number: boolean; provider: {automatic: boolean}}>(`/charges/${id}/whatsapp`), [id]);
  const [reverse, setReverse] = useState<string | null>(null);
  const [cancel, setCancel] = useState(false);
  const [receive, setReceive] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const c = data?.charge;
  const finance = can('admin', 'financeiro');
  const open = c && ['pendente', 'parcial'].includes(c.status);
  const text = msg ?? wa.data?.message ?? '';
  return (
    <Dialog open onClose={onClose} title="Detalhe da cobrança">
      <div className="dialog-body">
        {loading && !data ? <Loading /> : <ErrorNote error={error} />}
        {c && (<>
          <div className="totals">
            <div><span>Cliente</span><RLink to={`/clientes/${c.client_id}`}>{c.client_name}</RLink></div>
            <div><span>Descrição</span><strong>{c.description}</strong></div>
            <div><span>Contrato</span>{c.contract_id ? <RLink to={`/contratos/${c.contract_id}`}>{c.contract_number}</RLink> : 'Avulsa'}</div>
            <div><span>Vencimento</span><span>{dateBR(c.due_date)} · <Status value={c.display_status} /></span></div>
            <div><span>Total</span><Money cents={c.total_cents} strong /></div>
            <div><span>Pago</span><Money cents={c.paid_cents} /></div>
            <div><span>Saldo</span><Money cents={c.balance_cents} strong /></div>
            {(c.commitment_number || c.administrative_process || c.invoice_number) && <div><span>Setor público</span><span>Proc. {c.administrative_process ?? '—'} · Empenho {c.commitment_number ?? '—'} · NF {c.invoice_number ?? '—'}</span></div>}
          </div>
          <div className="dialog-actions" style={{justifyContent: 'flex-start'}}>
            {open && can('admin', 'financeiro', 'operador') && <Button onClick={() => setReceive(true)}>Receber / dar baixa</Button>}
            {open && finance && c.paid_cents === 0 && <Button variant="danger" onClick={() => setCancel(true)}>Cancelar cobrança</Button>}
          </div>

          <Card title="Pagamentos">
            {data.payments.length === 0 ? <p className="muted">Nenhum pagamento.</p> : (
              <ul className="list">{data.payments.map((p) => (
                <li key={p.id}><span>{label(p.method)} · <Money cents={p.amount_cents} strong /> · {dateTimeBR(p.paid_at)}<br /><small className="muted">{p.reference ?? 'sem referência'} · {p.operator_name}{p.reversal_reason ? ` · estorno: ${p.reversal_reason}` : ''}</small></span>
                  <span><Status value={p.status} /> {finance && p.status === 'confirmado' && <Button size="sm" variant="outline" onClick={() => setReverse(p.id)}>Estornar</Button>}</span></li>))}
              </ul>)}
          </Card>

          {open && wa.data && (
            <Card title="Cobrar por WhatsApp">
              {!wa.data.client_has_number && <Alert tone="warning" title="Cliente sem WhatsApp/telefone válido">Cadastre o número para abrir a conversa. Você ainda pode copiar a mensagem.</Alert>}
              <Textarea label="Mensagem" rows={7} value={text} onChange={(e) => setMsg(e.target.value)} />
              <div className="dialog-actions" style={{justifyContent: 'flex-start'}}>
                {wa.data.link && <a className="ads-btn ads-btn--secondary" style={{textDecoration: 'none'}} href={`https://wa.me/${wa.data.phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">Abrir no WhatsApp</a>}
                <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(text).then(() => toast({title: 'Mensagem copiada'}))}>Copiar</Button>
                <Button variant="outline" onClick={async () => { await api.post(`/charges/${id}/contacts`, {channel: 'whatsapp', message: text}); toast({title: 'Envio registrado no histórico', tone: 'success'}); }}>Registrar envio manual</Button>
              </div>
              <p className="muted" style={{fontSize: '.8rem'}}>Envio automático pela API do WhatsApp Business ainda não está ativo: por enquanto o envio é manual e fica registrado no histórico do cliente.</p>
            </Card>)}

          <Card title="Histórico da cobrança">
            <ul className="list">{data.history.map((h, i) => <li key={i}><span>{h.action} · {h.user_name}</span><small>{dateTimeBR(h.at)}</small></li>)}{data.history.length === 0 && <li className="muted">Sem eventos.</li>}</ul>
          </Card>
        </>)}
        <div className="dialog-actions"><Button variant="outline" onClick={onClose}>Fechar</Button></div>
      </div>
      {receive && <ReceiveDialog chargeId={id} onClose={() => setReceive(false)} onDone={() => { setReceive(false); reload(); onChanged(); }} />}
      <ConfirmDialog open={!!reverse} danger title="Estornar pagamento" reasonLabel="Motivo do estorno" confirmLabel="Estornar" onClose={() => setReverse(null)}
        onConfirm={async (reason) => { await api.post(`/charges/payments/${reverse}/reverse`, {reason, confirm: true}); setReverse(null); toast({title: 'Pagamento estornado', tone: 'success'}); reload(); onChanged(); }}>
        <p>O pagamento é preservado no histórico como estornado e o saldo da cobrança é reaberto.</p>
      </ConfirmDialog>
      <ConfirmDialog open={cancel} danger title="Cancelar cobrança" reasonLabel="Motivo do cancelamento" confirmLabel="Cancelar cobrança" onClose={() => setCancel(false)}
        onConfirm={async (reason) => { await api.post(`/charges/${id}/cancel`, {reason, confirm: true}); setCancel(false); toast({title: 'Cobrança cancelada'}); reload(); onChanged(); }} />
    </Dialog>
  );
}

const VIEWS = [['abertas', 'Em aberto'], ['futuras', 'Futuras'], ['pendentes', 'Pendentes'], ['vencidas', 'Vencidas'], ['parciais', 'Parciais'], ['pagas', 'Pagas'], ['', 'Todas']] as const;

function NewChargeDialog({onClose, onDone}: {onClose: () => void; onDone: () => void}) {
  const {toast} = useToast();
  const clients = useLoad(() => api.get<{id: string; name: string}[]>('/clients'), []);
  const [f, setF] = useState({client_id: '', description: '', due_date: '', administrative_process: '', commitment_number: '', invoice_number: ''});
  const [amount, setAmount] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({...f, [k]: e.target.value});
  return (
    <Dialog open onClose={onClose} title="Cobrança avulsa">
      <form className="dialog-body" onSubmit={async (e) => {
        e.preventDefault();
        try { await api.post('/charges', {...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v || null])), amount_cents: amount, discount_cents: 0}); toast({title: 'Cobrança criada', tone: 'success'}); onDone(); } catch (x) { setErr((x as Error).message); }
      }}>
        <p className="muted">Para serviços sob demanda ou extras. Mensalidades e parcelas nascem da ativação do contrato.</p>
        <div className="form-grid">
          <Select label="Cliente" required value={f.client_id} placeholder="Selecione" onChange={set('client_id')} options={(clients.data ?? []).map((c) => ({value: c.id, label: c.name}))} />
          <Input label="Descrição" required value={f.description} onChange={set('description')} />
          <MoneyInput label="Valor" required value={amount} onChange={setAmount} />
          <Input label="Vencimento" type="date" required value={f.due_date} onChange={set('due_date')} />
          <Input label="Processo administrativo" value={f.administrative_process} onChange={set('administrative_process')} />
          <Input label="Empenho" value={f.commitment_number} onChange={set('commitment_number')} />
          <Input label="Nota fiscal" value={f.invoice_number} onChange={set('invoice_number')} />
        </div>
        <ErrorNote error={err} />
        <div className="dialog-actions"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={!f.client_id || !amount}>Criar</Button></div>
      </form>
    </Dialog>
  );
}

export function ChargesPage() {
  const {can} = useAuth();
  const [sp, setSp] = useSearchParams();
  const view = sp.get('view') ?? 'abertas';
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const {data, error, loading, reload} = useLoad(() => api.get<Charge[]>(`/charges${qs({view, q, from, to})}`), [view, q, from, to]);
  const totals = useMemo(() => (data ?? []).reduce((s, c) => s + (c.status === 'cancelada' ? 0 : c.balance_cents), 0), [data]);
  return (
    <div className="stack-lg">
      <PageHeader title="Financeiro" subtitle="Cobranças a receber, vencidas e pagas. Clique no cliente para receber ou dar baixa." actions={<>
        <RLink to="/pdv" className="ads-btn ads-btn--primary" style={{textDecoration: 'none'}}>Modo caixa (receber)</RLink>
        {can('admin', 'financeiro') && <Button variant="outline" onClick={() => setCreating(true)}>Cobrança avulsa</Button>}</>} />
      <div className="chips" role="group" aria-label="Filtro de situação">
        {VIEWS.map(([v, text]) => <Button key={v || 'todas'} size="sm" variant={view === v ? 'secondary' : 'outline'} aria-pressed={view === v} onClick={() => setSp(v ? {view: v} : {view: ''})}>{text}</Button>)}
      </div>
      <div className="filters">
        <Input label="Buscar cliente, descrição ou contrato" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        <Input label="Vencimento de" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="até" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <ErrorNote error={error} />
      <p className="muted">{data?.length ?? 0} cobrança(s) · saldo em aberto na lista: <Money cents={totals} strong /></p>
      <div className="table-click">
        <DataTable<Charge> caption="Cobranças" loading={loading} rows={data ?? []} getRowKey={(r) => r.id} emptyTitle="Nenhuma cobrança neste filtro" emptyDescription="Ative um contrato para gerar cobranças."
          columns={[
            {key: 'due_date', header: 'Vencimento', sortable: true, render: (r) => dateBR(r.due_date)},
            {key: 'client_name', header: 'Cliente', sortable: true, render: (r) => <button type="button" className="ads-link" style={{background: 'none', border: 0, cursor: 'pointer', font: 'inherit', padding: 0, textAlign: 'left'}} onClick={() => setSel(r.id)}>{r.client_name}</button>},
            {key: 'description', header: 'Descrição'},
            {key: 'total_cents', header: 'Total', sortable: true, render: (r) => <Money cents={r.total_cents} />},
            {key: 'balance_cents', header: 'Saldo', sortable: true, render: (r) => <Money cents={r.balance_cents} strong />},
            {key: 'display_status', header: 'Situação', render: (r) => <Status value={r.display_status} />}
          ]} />
      </div>
      {sel && <ChargeDetailDialog id={sel} onClose={() => setSel(null)} onChanged={reload} />}
      {creating && <NewChargeDialog onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
    </div>
  );
}

export function PdvPage() {
  const {can} = useAuth();
  const [q, setQ] = useState('');
  const [view, setView] = useState('abertas');
  const [recv, setRecv] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const {data, error, loading, reload} = useLoad(() => api.get<Charge[]>(`/charges${qs({view, q})}`), [view, q]);
  return (
    <div className="stack-lg">
      <PageHeader title="PDV financeiro" subtitle="Localize a cobrança, receba e dê baixa" />
      <div className="pdv-search">
        <Input label="Buscar por cliente, descrição ou número do contrato" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips" role="group" aria-label="Filtro">
          {([['abertas', 'Em aberto'], ['vencidas', 'Vencidas'], ['pendentes', 'A vencer'], ['parciais', 'Parciais']] as const).map(([v, t]) => <Button key={v} size="sm" variant={view === v ? 'secondary' : 'outline'} aria-pressed={view === v} onClick={() => setView(v)}>{t}</Button>)}
        </div>
      </div>
      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : (data ?? []).length === 0 ? <Alert tone="info" title="Nenhuma cobrança encontrada">Ajuste a busca ou ative contratos para gerar cobranças.</Alert> : (
        <div className="pdv-list">
          {(data ?? []).slice(0, 60).map((c) => (
            <Card key={c.id} className="pdv-card">
              <div className="pdv-card__row"><strong>{c.client_name}</strong><Status value={c.display_status} /></div>
              <div className="muted">{c.description}<br />Vence em {dateBR(c.due_date)}{c.contract_number ? ` · ${c.contract_number}` : ''}</div>
              <div className="pdv-big">{brl(c.balance_cents)}</div>
              {c.paid_cents > 0 && <small className="muted">Já pago: {brl(c.paid_cents)} de {brl(c.total_cents)}</small>}
              {can('admin', 'financeiro', 'operador') && <Button className="btn-receive" onClick={() => setRecv(c.id)}>Receber / dar baixa</Button>}
              <Button variant="ghost" size="sm" onClick={() => setDetail(c.id)}>Ver detalhes e WhatsApp</Button>
            </Card>))}
        </div>)}
      {recv && <ReceiveDialog chargeId={recv} onClose={() => setRecv(null)} onDone={() => { setRecv(null); reload(); }} />}
      {detail && <ChargeDetailDialog id={detail} onClose={() => setDetail(null)} onChanged={reload} />}
    </div>
  );
}
