import {useState} from 'react';
import {Link as RLink, useNavigate, useParams} from 'react-router-dom';
import {Alert, Button, Card, DataTable, Dialog, Input, Select, Tabs, useToast} from '../ds';
import {api, qs} from '../api';
import {useAuth} from '../auth';
import {brl, dateBR, dateTimeBR, label} from '../format';
import {ConfirmDialog, ErrorNote, Loading, Money, PageHeader, Status, useLoad} from '../ui';
import {ContractFields, ItemFields, contractPayload, emptyContract, emptyItem, itemPayload, itemTotal, type ContractForm, type ItemForm} from './contractParts';

interface Row {
  id: string; number: string; kind: string; status: string; object: string | null; start_date: string | null; end_date: string | null;
  client_id: string; client_name: string; system_name: string | null; monthly_cents: number;
}

function NewContractDialog({onClose}: {onClose: () => void}) {
  const nav = useNavigate();
  const {toast} = useToast();
  const clients = useLoad(() => api.get<{id: string; name: string}[]>('/clients'), []);
  const [clientId, setClientId] = useState('');
  const systems = useLoad(() => (clientId ? api.get<{id: string; name: string}[]>(`/systems?client_id=${clientId}`) : Promise.resolve([])), [clientId]);
  const [form, setForm] = useState<ContractForm>(emptyContract());
  const [items, setItems] = useState<ItemForm[]>([emptyItem()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onClose={onClose} title="Novo contrato / proposta">
      <form className="dialog-body" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        try {
          const created = await api.post<{id: string}>('/contracts', {contract: {...contractPayload(form), client_id: clientId}, items: items.map(itemPayload)});
          toast({title: 'Contrato criado como rascunho', description: 'Revise e ative para gerar as cobranças.', tone: 'success'});
          nav(`/contratos/${created.id}`);
        } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}>
        <Select label="Cliente" required value={clientId} placeholder="Selecione" onChange={(e) => setClientId(e.target.value)} options={(clients.data ?? []).map((c) => ({value: c.id, label: c.name}))} />
        <ContractFields value={form} onChange={setForm} systems={systems.data ?? []} />
        <fieldset className="form-section">
          <legend>Itens e serviços</legend>
          {items.map((it, i) => <ItemFields key={i} value={it} onChange={(v) => setItems(items.map((x, j) => (j === i ? v : x)))} onRemove={items.length > 1 ? () => setItems(items.filter((_, j) => j !== i)) : undefined} />)}
          <div><Button variant="outline" onClick={() => setItems([...items, emptyItem()])}>Adicionar item</Button></div>
        </fieldset>
        <ErrorNote error={error} />
        <div className="dialog-actions"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" loading={busy} disabled={!clientId}>Salvar</Button></div>
      </form>
    </Dialog>
  );
}

export function ContractsPage() {
  const {can} = useAuth();
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [creating, setCreating] = useState(false);
  const {data, error, loading} = useLoad(() => api.get<Row[]>(`/contracts${qs({status, kind})}`), [status, kind]);
  return (
    <div className="stack-lg">
      <PageHeader title="Contratos" subtitle="Propostas, contratos assinados e aditivos" actions={can('admin', 'financeiro', 'operador') && <>
        <RLink to="/importar" className="ads-btn ads-btn--secondary" style={{textDecoration: 'none'}}>Importar PDF</RLink>
        <Button onClick={() => setCreating(true)}>Novo contrato</Button></>} />
      <div className="filters">
        <Select label="Natureza" value={kind} placeholder="Todas" onChange={(e) => setKind(e.target.value)} options={[{value: 'contrato', label: 'Contrato'}, {value: 'proposta', label: 'Proposta'}, {value: 'aditivo', label: 'Aditivo'}]} />
        <Select label="Situação" value={status} placeholder="Todas" onChange={(e) => setStatus(e.target.value)} options={['rascunho', 'proposta', 'ativo', 'suspenso', 'encerrado', 'cancelado'].map((s) => ({value: s, label: label(s)}))} />
      </div>
      <ErrorNote error={error} />
      <DataTable<Row> caption="Contratos" loading={loading} rows={data ?? []} getRowKey={(r) => r.id} emptyTitle="Nenhum contrato" emptyDescription="Importe um PDF ou crie manualmente."
        columns={[
          {key: 'number', header: 'Número', sortable: true, render: (r) => <RLink to={`/contratos/${r.id}`}>{r.number}</RLink>},
          {key: 'client_name', header: 'Cliente', sortable: true, render: (r) => <RLink to={`/clientes/${r.client_id}`}>{r.client_name}</RLink>},
          {key: 'kind', header: 'Natureza', render: (r) => label(r.kind)}, {key: 'status', header: 'Situação', render: (r) => <Status value={r.status} />},
          {key: 'system_name', header: 'Sistema', render: (r) => r.system_name ?? '—'}, {key: 'monthly_cents', header: 'Recorrência/mês', sortable: true, render: (r) => <Money cents={r.monthly_cents} />},
          {key: 'vig', header: 'Vigência', render: (r) => `${dateBR(r.start_date)} → ${dateBR(r.end_date)}`}
        ]} />
      {creating && <NewContractDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

interface Detail {
  contract: Record<string, string | number | boolean | null> & {id: string; number: string; kind: string; status: string; client_id: string; client_name: string};
  items: {id: string; kind: string; description: string; billing_type: string; unit_amount_cents: number; quantity: number; installments: number | null; interval_months: number; first_due_date: string | null; discount_cents: number; active: boolean}[];
  charge_summary: {status: string; n: number; total_cents: number; paid_cents: number}[];
  history: {at: string; user_name: string | null; action: string; detail: unknown}[];
  documents: {id: string; kind: string; filename: string; size_bytes: number; created_at: string}[];
}

export function ContractDetailPage() {
  const {id = ''} = useParams();
  const {can} = useAuth();
  const {toast} = useToast();
  const [tab, setTab] = useState('itens');
  const [dlg, setDlg] = useState<'activate' | 'approve' | 'generate' | 'suspend' | 'close' | 'cancel' | 'item' | null>(null);
  const [signed, setSigned] = useState('');
  const [newItem, setNewItem] = useState<ItemForm>(emptyItem());
  const {data, error, loading, reload} = useLoad(() => api.get<Detail>(`/contracts/${id}`), [id]);
  const charges = useLoad(() => api.get<{id: string; description: string; due_date: string; total_cents: number; balance_cents: number; display_status: string}[]>(`/charges?contract_id=${id}`), [id]);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote error={error} />;
  const c = data.contract;
  const finance = can('admin', 'financeiro');
  const isProposal = c.kind === 'proposta';
  const done = async (title: string) => { toast({title, tone: 'success'}); setDlg(null); reload(); charges.reload(); };

  return (
    <div className="stack-lg">
      <PageHeader title={c.number} subtitle={`${label(c.kind)} · ${c.client_name}`} actions={<>
        {finance && isProposal && c.status === 'proposta' && <Button onClick={() => setDlg('approve')}>Aprovar proposta</Button>}
        {finance && !isProposal && (c.status === 'rascunho' || c.status === 'suspenso') && <Button onClick={() => setDlg('activate')}>Ativar e gerar cobranças</Button>}
        {finance && c.status === 'ativo' && <Button variant="outline" onClick={() => setDlg('generate')}>Gerar próximas cobranças</Button>}
        {finance && c.status === 'ativo' && <Button variant="outline" onClick={() => setDlg('suspend')}>Suspender</Button>}
        {finance && ['ativo', 'suspenso'].includes(String(c.status)) && <Button variant="outline" onClick={() => setDlg('close')}>Encerrar</Button>}
        {finance && !['encerrado', 'cancelado'].includes(String(c.status)) && <Button variant="danger" onClick={() => setDlg('cancel')}>Cancelar</Button>}
      </>} />
      {isProposal && <Alert tone="info" title="Esta é uma proposta">Propostas não geram cobranças. Aprove-a (informando a data de aceite) para convertê-la em contrato e então ative.</Alert>}
      {c.status === 'rascunho' && !isProposal && <Alert tone="warning" title="Contrato em rascunho">Nenhuma cobrança foi criada. Confira itens, vencimentos e data de assinatura antes de ativar.</Alert>}
      <div className="kpis">
        <Card className="kpi"><p className="muted">Situação</p><Status value={String(c.status)} /></Card>
        <Card className="kpi kpi--navy"><p className="muted">Vigência</p><p>{dateBR(c.start_date as string)} → {dateBR(c.end_date as string)}</p></Card>
        <Card className="kpi"><p className="muted">Assinatura</p><p>{dateBR(c.signed_at as string)}</p></Card>
        <Card className="kpi"><p className="muted">Multa / juros</p><p>{String(c.fine_percent)}% · {String(c.interest_monthly_percent)}% a.m.</p></Card>
      </div>
      <Card title="Objeto e condições">
        <p>{(c.object as string) || '—'}</p>
        <p className="muted">Pagamento: {(c.payment_terms as string) || '—'} · Vencimento dia {String(c.due_day ?? '—')} · Reajuste: {(c.adjustment_index as string) || '—'}</p>
        {c.is_public_flow && <p className="muted">Processo: {(c.administrative_process as string) || '—'} · Empenho: {(c.commitment_number as string) || '—'}</p>}
      </Card>
      <Tabs label="Seções do contrato" idPrefix="ctr" value={tab} onChange={setTab} items={[{id: 'itens', label: 'Itens'}, {id: 'cobrancas', label: 'Cobranças'}, {id: 'historico', label: 'Histórico'}, {id: 'docs', label: 'Documentos'}]} />
      {tab === 'itens' && (<>
        {can('admin', 'financeiro', 'operador') && !['encerrado', 'cancelado'].includes(String(c.status)) && <div><Button variant="outline" onClick={() => { setNewItem(emptyItem()); setDlg('item'); }}>Adicionar item</Button></div>}
        <DataTable caption="Itens do contrato" rows={data.items} getRowKey={(r) => r.id} emptyTitle="Sem itens"
          columns={[{key: 'description', header: 'Descrição', render: (r) => <>{r.description}{!r.active && <small className="muted"> (inativo)</small>}</>}, {key: 'kind', header: 'Tipo', render: (r) => label(r.kind)},
            {key: 'billing_type', header: 'Cobrança', render: (r) => `${label(r.billing_type)}${r.billing_type === 'parcelado' ? ` ${r.installments}x` : ''}${r.interval_months > 1 ? ` · a cada ${r.interval_months}m` : ''}`},
            {key: 'value', header: 'Valor', render: (r) => <Money cents={Math.round(r.unit_amount_cents * r.quantity)} />}, {key: 'discount_cents', header: 'Desconto', render: (r) => brl(r.discount_cents)},
            {key: 'first_due_date', header: '1º vencimento', render: (r) => dateBR(r.first_due_date)}]} />
      </>)}
      {tab === 'cobrancas' && (<>
        <DataTable caption="Cobranças do contrato" loading={charges.loading} rows={charges.data ?? []} getRowKey={(r) => r.id} emptyTitle="Nenhuma cobrança gerada" emptyDescription="As cobranças surgem quando o contrato é ativado."
          columns={[{key: 'due_date', header: 'Vencimento', render: (r) => dateBR(r.due_date), sortable: true}, {key: 'description', header: 'Descrição'}, {key: 'total_cents', header: 'Total', render: (r) => <Money cents={r.total_cents} />},
            {key: 'balance_cents', header: 'Saldo', render: (r) => <Money cents={r.balance_cents} />}, {key: 'display_status', header: 'Situação', render: (r) => <Status value={r.display_status} />}]} />
        <p className="muted">Resumo: {data.charge_summary.map((s) => `${s.n} ${label(s.status).toLowerCase()}(s)`).join(' · ') || 'sem cobranças'}</p>
      </>)}
      {tab === 'historico' && <Card><ul className="list">{data.history.map((h, i) => <li key={i}><span><strong>{h.action}</strong> · {h.user_name ?? 'sistema'}<br /><small className="muted">{JSON.stringify(h.detail)?.slice(0, 220)}</small></span><small>{dateTimeBR(h.at)}</small></li>)}</ul></Card>}
      {tab === 'docs' && (<>
        {can('admin', 'financeiro', 'operador') && <label className="ads-btn ads-btn--outline" style={{width: 'fit-content', cursor: 'pointer'}}>Anexar arquivo (PDF/DOCX/TXT)
          <input type="file" accept=".pdf,.docx,.txt" className="ads-sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { await api.upload(`/contracts/${id}/documents`, f); toast({title: 'Arquivo anexado', tone: 'success'}); reload(); } catch (err) { toast({title: 'Falha no envio', description: (err as Error).message, tone: 'danger'}); } }} /></label>}
        <DataTable caption="Documentos" rows={data.documents} getRowKey={(r) => r.id} emptyTitle="Nenhum documento"
          columns={[{key: 'filename', header: 'Arquivo', render: (r) => <a className="ads-link" href={`/api/documents/${r.id}`}>{r.filename}</a>}, {key: 'kind', header: 'Tipo', render: (r) => (r.kind === 'contrato_original' ? 'Original importado' : 'Anexo')}, {key: 'size', header: 'Tamanho', render: (r) => `${Math.round(r.size_bytes / 1024)} KB`}, {key: 'created_at', header: 'Enviado em', render: (r) => dateTimeBR(r.created_at)}]} />
      </>)}

      <ConfirmDialog open={dlg === 'activate'} title="Ativar contrato e gerar cobranças" confirmLabel="Confirmar ativação" onClose={() => setDlg(null)}
        onConfirm={async () => { const r = await api.post<{created: number}>(`/contracts/${id}/activate`, {confirm: true}); await done(`Contrato ativo — ${r.created} cobrança(s) gerada(s)`); }}>
        <p>Você confirma que os <strong>{data.items.filter((i) => i.active).length} item(ns)</strong>, valores e vencimentos conferem com o contrato assinado? Serão criadas as cobranças (únicas, parcelas e mensalidades dos próximos 12 meses).</p>
        <ul>{data.items.filter((i) => i.active).map((i) => <li key={i.id}>{i.description}: <Money cents={Math.round(i.unit_amount_cents * i.quantity)} /> — {label(i.billing_type)}, 1º venc. {dateBR(i.first_due_date)}</li>)}</ul>
      </ConfirmDialog>
      <ConfirmDialog open={dlg === 'generate'} title="Gerar próximas cobranças" onClose={() => setDlg(null)} confirmLabel="Gerar"
        onConfirm={async () => { const r = await api.post<{created: number; skipped: number}>(`/contracts/${id}/generate-charges`, {horizon_months: 12}); await done(`${r.created} nova(s) cobrança(s); ${r.skipped} já existia(m)`); }}>
        <p>Gera as cobranças recorrentes dos próximos 12 meses que ainda não existem. Nada é duplicado.</p>
      </ConfirmDialog>
      <Dialog open={dlg === 'approve'} onClose={() => setDlg(null)} title="Aprovar proposta">
        <form className="dialog-body" onSubmit={async (e) => { e.preventDefault(); try { await api.post(`/contracts/${id}/approve-proposal`, {signed_at: signed, confirm: true}); await done('Proposta aprovada e convertida em contrato (rascunho)'); } catch (err) { toast({title: 'Falha', description: (err as Error).message, tone: 'danger'}); } }}>
          <p>Informe a data em que o cliente aceitou/assinou. O documento passa a ser contrato em rascunho; as cobranças só nascem na ativação.</p>
          <Input label="Data de aceite/assinatura" type="date" required value={signed} onChange={(e) => setSigned(e.target.value)} />
          <div className="dialog-actions"><Button variant="outline" onClick={() => setDlg(null)}>Voltar</Button><Button type="submit">Aprovar</Button></div>
        </form>
      </Dialog>
      {(['suspend', 'close', 'cancel'] as const).map((k) => (
        <ConfirmDialog key={k} open={dlg === k} danger={k !== 'suspend'} title={k === 'suspend' ? 'Suspender contrato' : k === 'close' ? 'Encerrar contrato' : 'Cancelar contrato'} reasonLabel="Motivo" confirmLabel="Confirmar" onClose={() => setDlg(null)}
          onConfirm={async (reason) => { await api.post(`/contracts/${id}/status`, {status: k === 'suspend' ? 'suspenso' : k === 'close' ? 'encerrado' : 'cancelado', reason}); await done('Situação atualizada'); }}>
          {k !== 'suspend' && <p>Cobranças futuras sem pagamento serão canceladas. As vencidas permanecem para cobrança.</p>}
        </ConfirmDialog>
      ))}
      <Dialog open={dlg === 'item'} onClose={() => setDlg(null)} title="Novo item">
        <form className="dialog-body" onSubmit={async (e) => { e.preventDefault(); try { await api.post(`/contracts/${id}/items`, itemPayload(newItem)); await done('Item adicionado'); } catch (err) { toast({title: 'Falha', description: (err as Error).message, tone: 'danger'}); } }}>
          <ItemFields value={newItem} onChange={setNewItem} />
          <p className="muted">Total por cobrança: {brl(itemTotal(newItem))}. Para um contrato já ativo, use “Gerar próximas cobranças” depois.</p>
          <div className="dialog-actions"><Button variant="outline" onClick={() => setDlg(null)}>Cancelar</Button><Button type="submit">Adicionar</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
