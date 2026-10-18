import {useState} from 'react';
import {Link as RLink, useNavigate, useParams} from 'react-router-dom';
import {Alert, Button, Card, DataTable, Dialog, Input, Select, Tabs, Textarea, useToast} from '../ds';
import {api, qs} from '../api';
import {useAuth} from '../auth';
import {brl, dateBR, dateTimeBR, formatDocument, label} from '../format';
import {ErrorNote, Loading, Money, PageHeader, Status, useLoad} from '../ui';
import {SystemFormDialog} from './Systems';

export interface ClientForm {
  kind: string; name: string; trade_name: string; document: string; email: string; phone: string; whatsapp: string;
  zip: string; street: string; number: string; complement: string; district: string; city: string; state: string;
  responsible_name: string; responsible_role: string; sector: string; public_sphere: string; notes: string; status: string;
}
export const emptyClient = (over: Partial<ClientForm> = {}): ClientForm => ({
  kind: 'empresa_privada', name: '', trade_name: '', document: '', email: '', phone: '', whatsapp: '', zip: '', street: '', number: '',
  complement: '', district: '', city: '', state: '', responsible_name: '', responsible_role: '', sector: '', public_sphere: '', notes: '', status: 'ativo', ...over
});
export const clientPayload = (f: ClientForm) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]).map(([k, v]) => (k === 'name' || k === 'kind' || k === 'status' ? [k, v ?? ''] : [k, v])));

export function ClientFields({value, onChange}: {value: ClientForm; onChange: (v: ClientForm) => void}) {
  const set = (k: keyof ClientForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange({...value, [k]: e.target.value});
  const isPublic = value.kind === 'orgao_publico';
  return (
    <div className="stack-lg">
      <fieldset className="form-section">
        <legend>Identificação</legend>
        <div className="form-grid">
          <Select label="Tipo de cliente" required value={value.kind} onChange={set('kind')} options={[
            {value: 'pessoa_fisica', label: 'Pessoa física'}, {value: 'empresa_privada', label: 'Empresa privada'}, {value: 'orgao_publico', label: 'Órgão público'}]} />
          <Input label={value.kind === 'pessoa_fisica' ? 'Nome completo' : 'Razão social / órgão'} required value={value.name} onChange={set('name')} />
          <Input label="Nome fantasia / sigla" value={value.trade_name} onChange={set('trade_name')} />
          <Input label={value.kind === 'pessoa_fisica' ? 'CPF' : 'CNPJ'} value={formatDocument(value.document)} onChange={set('document')} inputMode="numeric" hint="Validado pelos dígitos verificadores" />
          <Select label="Situação" value={value.status} onChange={set('status')} options={[{value: 'ativo', label: 'Ativo'}, {value: 'prospecto', label: 'Prospecto'}, {value: 'inativo', label: 'Inativo'}]} />
          {isPublic && <Select label="Esfera" value={value.public_sphere} placeholder="Selecione" onChange={set('public_sphere')} options={[{value: 'municipal', label: 'Municipal'}, {value: 'estadual', label: 'Estadual'}, {value: 'federal', label: 'Federal'}]} />}
        </div>
      </fieldset>
      <fieldset className="form-section">
        <legend>Contato e responsável</legend>
        <div className="form-grid">
          <Input label="Responsável" value={value.responsible_name} onChange={set('responsible_name')} />
          <Input label="Cargo" value={value.responsible_role} onChange={set('responsible_role')} />
          <Input label="Setor" value={value.sector} onChange={set('sector')} />
          <Input label="E-mail" type="email" value={value.email} onChange={set('email')} />
          <Input label="Telefone" type="tel" value={value.phone} onChange={set('phone')} />
          <Input label="WhatsApp" type="tel" value={value.whatsapp} onChange={set('whatsapp')} hint="Com DDD. Usado nas cobranças." />
        </div>
      </fieldset>
      <fieldset className="form-section">
        <legend>Endereço</legend>
        <div className="form-grid">
          <Input label="CEP" value={value.zip} onChange={set('zip')} inputMode="numeric" />
          <Input label="Logradouro" value={value.street} onChange={set('street')} />
          <Input label="Número" value={value.number} onChange={set('number')} />
          <Input label="Complemento" value={value.complement} onChange={set('complement')} />
          <Input label="Bairro" value={value.district} onChange={set('district')} />
          <Input label="Cidade" value={value.city} onChange={set('city')} />
          <Input label="UF" maxLength={2} value={value.state} onChange={set('state')} />
        </div>
      </fieldset>
      <Textarea label="Observações" rows={3} value={value.notes} onChange={set('notes')} />
    </div>
  );
}

function ClientDialog({open, onClose, initial, id, onSaved}: {open: boolean; onClose: () => void; initial: ClientForm; id?: string; onSaved: (c: {id: string}) => void}) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {toast} = useToast();
  return (
    <Dialog open={open} onClose={onClose} title={id ? 'Editar cliente' : 'Novo cliente'}>
      <form className="dialog-body" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        try {
          const saved = id ? await api.patch<{id: string}>(`/clients/${id}`, clientPayload(form)) : await api.post<{id: string}>('/clients', clientPayload(form));
          toast({title: id ? 'Cliente atualizado' : 'Cliente cadastrado', tone: 'success'});
          onSaved(saved);
        } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}>
        <ClientFields value={form} onChange={setForm} />
        <ErrorNote error={error} />
        <div className="dialog-actions"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" loading={busy}>Salvar</Button></div>
      </form>
    </Dialog>
  );
}

interface ClientRow {
  id: string; name: string; trade_name: string | null; document: string | null; kind: string; status: string; city: string | null;
  active_contracts: number; systems_count: number; open_balance_cents: number; overdue_cents: number;
}

export function ClientsPage() {
  const {can} = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const {data, error, loading} = useLoad(() => api.get<ClientRow[]>(`/clients${qs({q, kind, status})}`), [q, kind, status]);
  return (
    <div className="stack-lg">
      <PageHeader title="Clientes" subtitle="Pessoas físicas, empresas privadas e órgãos públicos" actions={can('admin', 'financeiro', 'operador') && <Button onClick={() => setCreating(true)}>Novo cliente</Button>} />
      <div className="filters">
        <Input label="Buscar por nome ou CPF/CNPJ" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select label="Tipo" value={kind} placeholder="Todos" onChange={(e) => setKind(e.target.value)} options={[{value: 'pessoa_fisica', label: 'Pessoa física'}, {value: 'empresa_privada', label: 'Empresa privada'}, {value: 'orgao_publico', label: 'Órgão público'}]} />
        <Select label="Situação" value={status} placeholder="Todas" onChange={(e) => setStatus(e.target.value)} options={[{value: 'ativo', label: 'Ativo'}, {value: 'prospecto', label: 'Prospecto'}, {value: 'inativo', label: 'Inativo'}]} />
      </div>
      <ErrorNote error={error} />
      <div className="table-click">
        <DataTable<ClientRow>
          caption="Lista de clientes" loading={loading} rows={data ?? []} getRowKey={(r) => r.id}
          emptyTitle="Nenhum cliente cadastrado" emptyDescription="Cadastre um cliente ou importe um contrato para começar."
          columns={[
            {key: 'name', header: 'Cliente', render: (r) => <RLink to={`/clientes/${r.id}`}>{r.name}</RLink>, sortable: true},
            {key: 'document', header: 'CPF/CNPJ', render: (r) => formatDocument(r.document) || '—'},
            {key: 'kind', header: 'Tipo', render: (r) => label(r.kind)},
            {key: 'status', header: 'Situação', render: (r) => <Status value={r.status} />},
            {key: 'active_contracts', header: 'Contratos', sortable: true},
            {key: 'open_balance_cents', header: 'Em aberto', render: (r) => <Money cents={r.open_balance_cents} />, sortable: true},
            {key: 'overdue_cents', header: 'Vencido', render: (r) => (r.overdue_cents > 0 ? <strong style={{color: 'var(--ads-color-danger-text)'}}><Money cents={r.overdue_cents} /></strong> : '—'), sortable: true}
          ]}
        />
      </div>
      {creating && <ClientDialog open onClose={() => setCreating(false)} initial={emptyClient()} onSaved={(c) => nav(`/clientes/${c.id}`)} />}
    </div>
  );
}

interface Detail {
  client: ClientForm & {id: string};
  contracts: {id: string; number: string; kind: string; status: string; object: string | null; start_date: string | null; end_date: string | null}[];
  systems: {id: string; name: string; status: string; access_url: string | null; domain: string | null; operational_cost_cents: number}[];
  contacts: {id: string; channel: string; direction: string; message: string | null; operator_name: string; created_at: string}[];
  balance: {open_cents: number; overdue_cents: number; paid_cents: number};
}

export function ClientDetailPage() {
  const {id = ''} = useParams();
  const {can} = useAuth();
  const [tab, setTab] = useState('contratos');
  const [editing, setEditing] = useState(false);
  const [addSystem, setAddSystem] = useState(false);
  const {data, error, loading, reload} = useLoad(() => api.get<Detail>(`/clients/${id}`), [id]);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote error={error} />;
  const c = data.client;
  const publicBody = c.kind === 'orgao_publico';
  return (
    <div className="stack-lg">
      <PageHeader title={c.name} subtitle={`${label(c.kind)} · ${formatDocument(c.document) || 'sem documento'}`} actions={<>
        {can('admin', 'financeiro', 'operador') && <Button variant="outline" onClick={() => setEditing(true)}>Editar</Button>}
        <Button variant="outline" onClick={() => window.history.back()}>Voltar</Button>
      </>} />
      <div className="kpis">
        <Card className="kpi"><p className="muted">Situação</p><Status value={c.status} /></Card>
        <Card className="kpi kpi--navy"><p className="muted">Em aberto</p><p className="pdv-big"><Money cents={data.balance.open_cents} /></p></Card>
        <Card className="kpi kpi--danger"><p className="muted">Vencido</p><p className="pdv-big"><Money cents={data.balance.overdue_cents} /></p></Card>
        <Card className="kpi kpi--ok"><p className="muted">Já recebido</p><p className="pdv-big"><Money cents={data.balance.paid_cents} /></p></Card>
      </div>
      <Card title="Dados">
        <dl className="form-grid" style={{margin: 0}}>
          {([['Responsável', c.responsible_name ? `${c.responsible_name}${c.responsible_role ? ` (${c.responsible_role})` : ''}` : null], ['Setor', c.sector], ['E-mail', c.email], ['Telefone', c.phone], ['WhatsApp', c.whatsapp],
            ['Endereço', [c.street, c.number, c.district, c.city, c.state].filter(Boolean).join(', ') || null], publicBody ? ['Esfera', c.public_sphere ? label(c.public_sphere) : null] : null, ['Observações', c.notes]] as ([string, string | null] | null)[]).filter(Boolean).map((row) => (
            <div key={row![0]}><dt className="muted" style={{fontSize: '.8rem'}}>{row![0]}</dt><dd style={{margin: 0}}>{row![1] || '—'}</dd></div>))}
        </dl>
      </Card>
      <Tabs label="Seções do cliente" idPrefix="cli" value={tab} onChange={setTab} items={[{id: 'contratos', label: `Contratos (${data.contracts.length})`}, {id: 'sistemas', label: `Sistemas (${data.systems.length})`}, {id: 'contatos', label: `Contatos (${data.contacts.length})`}]} />
      {tab === 'contratos' && (
        <DataTable caption="Contratos do cliente" rows={data.contracts} getRowKey={(r) => r.id} emptyTitle="Nenhum contrato" emptyDescription="Importe um contrato PDF ou crie um manualmente."
          columns={[{key: 'number', header: 'Número', render: (r) => <RLink to={`/contratos/${r.id}`}>{r.number}</RLink>}, {key: 'kind', header: 'Tipo', render: (r) => label(r.kind)},
            {key: 'status', header: 'Situação', render: (r) => <Status value={r.status} />}, {key: 'object', header: 'Objeto', render: (r) => r.object?.slice(0, 80) ?? '—'},
            {key: 'vig', header: 'Vigência', render: (r) => `${dateBR(r.start_date)} → ${dateBR(r.end_date)}`}]} />
      )}
      {tab === 'sistemas' && (<>
        {can('admin', 'financeiro', 'operador') && <div><Button onClick={() => setAddSystem(true)}>Cadastrar sistema</Button></div>}
        <DataTable caption="Sistemas do cliente" rows={data.systems} getRowKey={(r) => r.id} emptyTitle="Nenhum sistema"
          columns={[{key: 'name', header: 'Sistema'}, {key: 'status', header: 'Situação', render: (r) => <Status value={r.status} />}, {key: 'domain', header: 'Domínio', render: (r) => r.domain ?? '—'},
            {key: 'cost', header: 'Custo mensal', render: (r) => brl(r.operational_cost_cents)}]} />
      </>)}
      {tab === 'contatos' && (data.contacts.length === 0 ? <Alert title="Sem histórico de contatos">Registros de WhatsApp e outros contatos feitos pelas cobranças aparecem aqui.</Alert> : (
        <Card><ul className="list">{data.contacts.map((k) => <li key={k.id}><span><strong>{label(k.channel)}</strong> · {k.direction === 'saida' ? 'enviado' : 'recebido'} por {k.operator_name}<br /><small className="muted">{k.message?.slice(0, 160)}</small></span><small>{dateTimeBR(k.created_at)}</small></li>)}</ul></Card>))}
      {editing && <ClientDialog open onClose={() => setEditing(false)} id={id}
        initial={emptyClient(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ''])) as Partial<ClientForm>)} onSaved={() => { setEditing(false); reload(); }} />}
      {addSystem && <SystemFormDialog open onClose={() => setAddSystem(false)} clientId={id} onSaved={() => { setAddSystem(false); reload(); }} />}
    </div>
  );
}
