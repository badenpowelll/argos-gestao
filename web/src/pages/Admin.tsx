import {useState} from 'react';
import {Alert, Button, Card, DataTable, Dialog, Input, Select, Tabs, useToast} from '../ds';
import {api} from '../api';
import {useAuth} from '../auth';
import {dateTimeBR, label} from '../format';
import {ErrorNote, PageHeader, Status, useLoad} from '../ui';

interface U {id: string; name: string; email: string; role: string; active: boolean}
interface Co {legal_name: string; trade_name: string; cnpj: string | null; site: string | null; email: string | null; whatsapp: string | null}

function Users() {
  const {toast} = useToast();
  const {user} = useAuth();
  const {data, error, reload} = useLoad(() => api.get<U[]>('/users'), []);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({name: '', email: '', role: 'operador', password: ''});
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="stack-lg">
      <div><Button onClick={() => setOpen(true)}>Novo usuário</Button></div>
      <ErrorNote error={error} />
      <DataTable<U> caption="Usuários" rows={data ?? []} getRowKey={(r) => r.id}
        columns={[{key: 'name', header: 'Nome'}, {key: 'email', header: 'E-mail'},
          {key: 'role', header: 'Perfil', render: (r) => (
            <select aria-label={`Perfil de ${r.name}`} className="ads-input" value={r.role} disabled={r.id === user?.id}
              onChange={async (e) => { try { await api.patch(`/users/${r.id}`, {role: e.target.value}); reload(); } catch (x) { toast({title: 'Falha', description: (x as Error).message, tone: 'danger'}); } }}>
              {['admin', 'financeiro', 'operador', 'leitura'].map((o) => <option key={o} value={o}>{label(o)}</option>)}
            </select>)},
          {key: 'active', header: 'Acesso', render: (r) => <Button size="sm" variant="outline" disabled={r.id === user?.id} onClick={async () => { await api.patch(`/users/${r.id}`, {active: !r.active}); reload(); }}>{r.active ? 'Desativar' : 'Reativar'}</Button>}]} />
      <Dialog open={open} onClose={() => setOpen(false)} title="Novo usuário">
        <form className="dialog-body" onSubmit={async (e) => { e.preventDefault(); try { await api.post('/users', f); setOpen(false); setF({name: '', email: '', role: 'operador', password: ''}); reload(); toast({title: 'Usuário criado', tone: 'success'}); } catch (x) { setErr((x as Error).message); } }}>
          <Input label="Nome" required value={f.name} onChange={(e) => setF({...f, name: e.target.value})} />
          <Input label="E-mail" type="email" required value={f.email} onChange={(e) => setF({...f, email: e.target.value})} />
          <Select label="Perfil" value={f.role} onChange={(e) => setF({...f, role: e.target.value})} options={['admin', 'financeiro', 'operador', 'leitura'].map((o) => ({value: o, label: label(o)}))} />
          <Input label="Senha inicial" type="password" required value={f.password} onChange={(e) => setF({...f, password: e.target.value})} hint="Mínimo 10 caracteres, letras e números" autoComplete="new-password" />
          <ErrorNote error={err} />
          <div className="dialog-actions"><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit">Criar</Button></div>
        </form>
      </Dialog>
    </div>
  );
}

function Audit() {
  const {data, error} = useLoad(() => api.get<{at: string; user_name: string | null; action: string; entity: string; entity_id: string | null; detail: unknown}[]>('/audit'), []);
  return (<><ErrorNote error={error} />
    <DataTable caption="Auditoria (últimos 300 eventos)" rows={data ?? []} getRowKey={(_, i) => String(i)}
      columns={[{key: 'at', header: 'Quando', render: (r) => dateTimeBR(r.at)}, {key: 'user_name', header: 'Quem', render: (r) => r.user_name ?? 'sistema'}, {key: 'action', header: 'Ação'}, {key: 'entity', header: 'Entidade'},
        {key: 'detail', header: 'Detalhe', render: (r) => <small className="muted">{JSON.stringify(r.detail)?.slice(0, 140)}</small>}]} /></>);
}

function Company() {
  const {can} = useAuth();
  const {toast} = useToast();
  const {data, reload} = useLoad(() => api.get<Co>('/company'), []);
  const [email, setEmail] = useState<string | null>(null);
  const [wa, setWa] = useState<string | null>(null);
  if (!data) return null;
  return (
    <Card title="Dados da Argos Soluções">
      <dl className="form-grid" style={{margin: 0}}>
        <div><dt className="muted">Razão social</dt><dd style={{margin: 0}}>{data.legal_name}</dd></div>
        <div><dt className="muted">CNPJ</dt><dd style={{margin: 0}}>{data.cnpj?.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}</dd></div>
        <div><dt className="muted">Site</dt><dd style={{margin: 0}}>{data.site}</dd></div>
      </dl>
      {can('admin') && (
        <form className="form-grid" style={{marginTop: 12}} onSubmit={async (e) => { e.preventDefault(); await api.patch('/company', {email: email ?? data.email ?? '', whatsapp: wa ?? data.whatsapp ?? ''}); toast({title: 'Dados atualizados', tone: 'success'}); reload(); }}>
          <Input label="E-mail institucional" type="email" value={email ?? data.email ?? ''} onChange={(e) => setEmail(e.target.value)} hint="Defina quando o e-mail do domínio estiver criado na Hostinger" />
          <Input label="WhatsApp oficial (com DDI)" value={wa ?? data.whatsapp ?? ''} onChange={(e) => setWa(e.target.value)} hint="Ex.: 5584998590183" />
          <div><Button type="submit">Salvar</Button></div>
        </form>)}
    </Card>
  );
}

export function AdminPage() {
  const {can} = useAuth();
  const [tab, setTab] = useState(can('admin') ? 'usuarios' : 'auditoria');
  return (
    <div className="stack-lg">
      <PageHeader title="Administração" subtitle="Usuários, auditoria e dados da empresa" />
      <Alert tone="info" title="Integrações">
        WhatsApp: envio manual com mensagem pronta e histórico (ativo). API do WhatsApp Business e provedores de pagamento: <Status value="pendente" /> aguardando credenciais e implementação.
      </Alert>
      <Tabs label="Administração" idPrefix="adm" value={tab} onChange={setTab} items={[...(can('admin') ? [{id: 'usuarios', label: 'Usuários'}] : []), {id: 'auditoria', label: 'Auditoria'}, {id: 'empresa', label: 'Empresa'}]} />
      {tab === 'usuarios' && can('admin') && <Users />}
      {tab === 'auditoria' && <Audit />}
      {tab === 'empresa' && <Company />}
    </div>
  );
}
