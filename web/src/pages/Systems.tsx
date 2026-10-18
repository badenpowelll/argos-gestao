import {useState} from 'react';
import {Link as RLink} from 'react-router-dom';
import {Button, DataTable, Dialog, Input, Select, Textarea, useToast} from '../ds';
import {api} from '../api';
import {useAuth} from '../auth';
import {brl, dateBR} from '../format';
import {ErrorNote, MoneyInput, PageHeader, Status, useLoad} from '../ui';

export interface SystemRow {
  id: string; client_id: string; client_name: string; name: string; description: string | null; access_url: string | null; domain: string | null;
  infrastructure: string | null; database_info: string | null; version: string | null; delivered_at: string | null; implemented_at: string | null;
  maintenance_until: string | null; support_until: string | null; operational_cost_cents: number; status: string; active_contracts: number;
}

export function SystemFormDialog({open, onClose, clientId, system, onSaved}: {open: boolean; onClose: () => void; clientId?: string; system?: SystemRow; onSaved: () => void}) {
  const {toast} = useToast();
  const [f, setF] = useState({
    client_id: system?.client_id ?? clientId ?? '', name: system?.name ?? '', description: system?.description ?? '', access_url: system?.access_url ?? '', domain: system?.domain ?? '',
    infrastructure: system?.infrastructure ?? '', database_info: system?.database_info ?? '', version: system?.version ?? '', delivered_at: system?.delivered_at ?? '',
    implemented_at: system?.implemented_at ?? '', maintenance_until: system?.maintenance_until ?? '', support_until: system?.support_until ?? '', status: system?.status ?? 'em_desenvolvimento'
  });
  const [cost, setCost] = useState<number | null>(system?.operational_cost_cents ?? 0);
  const clients = useLoad(() => (clientId || system ? Promise.resolve([]) : api.get<{id: string; name: string}[]>('/clients')), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({...f, [k]: e.target.value});
  return (
    <Dialog open={open} onClose={onClose} title={system ? 'Editar sistema' : 'Novo sistema'}>
      <form className="dialog-body" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        const body = {...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v])), name: f.name, client_id: f.client_id, status: f.status, operational_cost_cents: cost ?? 0};
        try {
          if (system) await api.patch(`/systems/${system.id}`, body); else await api.post('/systems', body);
          toast({title: 'Sistema salvo', tone: 'success'}); onSaved();
        } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}>
        <div className="form-grid">
          {!clientId && !system && <Select label="Cliente" required value={f.client_id} placeholder="Selecione" onChange={set('client_id')} options={(clients.data ?? []).map((c) => ({value: c.id, label: c.name}))} />}
          <Input label="Nome do software" required value={f.name} onChange={set('name')} />
          <Select label="Situação" value={f.status} onChange={set('status')} options={[{value: 'em_desenvolvimento', label: 'Em desenvolvimento'}, {value: 'em_producao', label: 'Em produção'}, {value: 'manutencao', label: 'Manutenção'}, {value: 'suspenso', label: 'Suspenso'}, {value: 'descontinuado', label: 'Descontinuado'}]} />
          <Input label="Link de acesso" type="url" value={f.access_url} onChange={set('access_url')} placeholder="https://" />
          <Input label="Domínio" value={f.domain} onChange={set('domain')} />
          <Input label="Infraestrutura / hospedagem" value={f.infrastructure} onChange={set('infrastructure')} />
          <Input label="Banco de dados" value={f.database_info} onChange={set('database_info')} hint="Apenas tipo/provedor. Nunca registre senhas." />
          <Input label="Versão" value={f.version} onChange={set('version')} />
          <MoneyInput label="Custo operacional mensal" value={cost} onChange={setCost} hint="Hospedagem/infra por mês" />
          <Input label="Data de entrega" type="date" value={f.delivered_at} onChange={set('delivered_at')} />
          <Input label="Implementação concluída em" type="date" value={f.implemented_at} onChange={set('implemented_at')} />
          <Input label="Manutenção até" type="date" value={f.maintenance_until} onChange={set('maintenance_until')} />
          <Input label="Suporte até" type="date" value={f.support_until} onChange={set('support_until')} />
          <div className="span-2"><Textarea label="Descrição" rows={3} value={f.description} onChange={set('description')} /></div>
        </div>
        <ErrorNote error={error} />
        <div className="dialog-actions"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" loading={busy}>Salvar</Button></div>
      </form>
    </Dialog>
  );
}

export function SystemsPage() {
  const {can} = useAuth();
  const {data, error, loading, reload} = useLoad(() => api.get<SystemRow[]>('/systems'), []);
  const [edit, setEdit] = useState<SystemRow | 'new' | null>(null);
  return (
    <div className="stack-lg">
      <PageHeader title="Sistemas" subtitle="Catálogo de softwares entregues e sua operação" actions={can('admin', 'financeiro', 'operador') && <Button onClick={() => setEdit('new')}>Novo sistema</Button>} />
      <ErrorNote error={error} />
      <DataTable<SystemRow> caption="Sistemas" loading={loading} rows={data ?? []} getRowKey={(r) => r.id} emptyTitle="Nenhum sistema cadastrado"
        columns={[
          {key: 'name', header: 'Sistema', sortable: true, render: (r) => (can('admin', 'financeiro', 'operador') ? <button type="button" className="ads-link" style={{background: 'none', border: 0, cursor: 'pointer', font: 'inherit', padding: 0}} onClick={() => setEdit(r)}>{r.name}</button> : r.name)},
          {key: 'client_name', header: 'Cliente', render: (r) => <RLink to={`/clientes/${r.client_id}`}>{r.client_name}</RLink>},
          {key: 'status', header: 'Situação', render: (r) => <Status value={r.status} />},
          {key: 'access_url', header: 'Acesso', render: (r) => (r.access_url ? <a className="ads-link" href={r.access_url} target="_blank" rel="noopener noreferrer">{r.domain ?? 'abrir'}</a> : (r.domain ?? '—'))},
          {key: 'infrastructure', header: 'Infraestrutura', render: (r) => r.infrastructure ?? '—'},
          {key: 'delivered_at', header: 'Entrega', render: (r) => dateBR(r.delivered_at)},
          {key: 'operational_cost_cents', header: 'Custo/mês', sortable: true, render: (r) => brl(r.operational_cost_cents)}
        ]} />
      {edit && <SystemFormDialog open onClose={() => setEdit(null)} system={edit === 'new' ? undefined : edit} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}
