import {useState} from 'react';
import {Alert, Badge, Button, Card, Checkbox, DataTable, Dialog, Input, Select, Tabs, Textarea, useToast} from '../ds';
import {api} from '../api';
import {useAuth} from '../auth';
import {brl, dateBR, dateTimeBR} from '../format';
import {ConfirmDialog, ErrorNote, MoneyInput, PageHeader, useLoad} from '../ui';
import type {CatalogItem} from '../pricing/types';

const CUR = {BRL: 'R$', USD: 'US$', EUR: '€'} as const;
const money = (c: number | null, cur: CatalogItem['currency']) => (c === null ? 'sem preço' : `${CUR[cur]} ${(c / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
const PERIOD = {mensal: 'por mês', anual: 'por ano', bienal: 'a cada 2 anos', trienal: 'a cada 3 anos', quadrienal: 'a cada 4 anos', unica: 'único'} as const;
const blank = (): Omit<CatalogItem, 'id'> => ({name: '', vendor: '', plan: '', category: 'ferramenta', price_cents: null, currency: 'BRL', periodicity: 'mensal', projects_served: 1, allocation_pct: null, included_in_id: null, price_verified: false, source: '', verified_at: null, notes: '', active: true});

function CatalogDialog({item, all, onClose, onSaved}: {item: CatalogItem | null; all: CatalogItem[]; onClose: () => void; onSaved: () => void}) {
  const {toast} = useToast();
  const [f, setF] = useState<Omit<CatalogItem, 'id'>>(item ? {...item} : blank());
  const [alloc, setAlloc] = useState(f.allocation_pct === null ? '' : String(f.allocation_pct));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({...f, [k]: e.target.value});
  return (
    <Dialog open onClose={onClose} title={item ? 'Editar item do catálogo' : 'Novo item do catálogo'}>
      <form className="dialog-body" onSubmit={async (e) => {
        e.preventDefault();
        const body = {...f, vendor: f.vendor || null, plan: f.plan || null, source: f.source || null, notes: f.notes || null, verified_at: f.verified_at || null, allocation_pct: alloc === '' ? null : Number(alloc), projects_served: Number(f.projects_served)};
        try { if (item) await api.patch(`/pricing/catalog/${item.id}`, body); else await api.post('/pricing/catalog', body); toast({title: 'Item salvo', tone: 'success'}); onSaved(); } catch (x) { setErr((x as Error).message); }
      }}>
        <div className="form-grid">
          <Input label="Nome" required value={f.name} onChange={set('name')} />
          <Input label="Fornecedor" value={f.vendor ?? ''} onChange={set('vendor')} />
          <Input label="Plano" value={f.plan ?? ''} onChange={set('plan')} />
          <Select label="Categoria" value={f.category} onChange={set('category')} options={[{value: 'ferramenta', label: 'Ferramenta'}, {value: 'infra', label: 'Infraestrutura'}, {value: 'dominio', label: 'Domínio'}, {value: 'email', label: 'E-mail'}, {value: 'outro', label: 'Outro'}]} />
          <MoneyInput label={`Custo (${f.currency})`} value={f.price_cents} onChange={(c) => setF({...f, price_cents: c, price_verified: c === null ? false : f.price_verified})} hint="Deixe em branco se ainda não verificado" />
          <Select label="Moeda" value={f.currency} onChange={set('currency')} options={[{value: 'BRL', label: 'Real (BRL)'}, {value: 'USD', label: 'Dólar (USD)'}, {value: 'EUR', label: 'Euro (EUR)'}]} />
          <Select label="Periodicidade" value={f.periodicity} onChange={set('periodicity')} options={Object.entries(PERIOD).map(([v, l]) => ({value: v, label: l}))} />
          <Input label="Projetos atendidos" type="number" min={1} value={String(f.projects_served)} onChange={set('projects_served')} hint="Custo ÷ projetos (rateio)" />
          <Input label="Alocação manual (%)" type="number" min={0} max={100} step="0.01" value={alloc} onChange={(e) => setAlloc(e.target.value)} hint="Se informada, substitui ÷ projetos" />
          <Select label="Já incluído no plano de…" value={f.included_in_id ?? ''} placeholder="(não está incluído em outro)" onChange={(e) => setF({...f, included_in_id: e.target.value || null})} options={all.filter((a) => a.id !== item?.id).map((a) => ({value: a.id, label: a.name}))} />
          <Input label="Fonte do preço" value={f.source ?? ''} onChange={set('source')} placeholder="site oficial, fatura, proposta…" />
          <Input label="Verificado em" type="date" value={f.verified_at ?? ''} onChange={set('verified_at')} />
          <div className="span-2"><Textarea label="Observações" rows={2} value={f.notes ?? ''} onChange={set('notes')} /></div>
        </div>
        <Checkbox label="Preço verificado" checked={f.price_verified} disabled={f.price_cents === null} onChange={(e) => setF({...f, price_verified: e.target.checked})} />
        <Checkbox label="Ativo" checked={f.active} onChange={(e) => setF({...f, active: e.target.checked})} />
        <ErrorNote error={err} />
        <div className="dialog-actions"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></div>
      </form>
    </Dialog>
  );
}

function Catalog() {
  const {can} = useAuth();
  const finance = can('admin', 'financeiro');
  const {data, error, reload} = useLoad(() => api.get<CatalogItem[]>('/pricing/catalog'), []);
  const [edit, setEdit] = useState<CatalogItem | 'new' | null>(null);
  return (
    <div className="stack-lg">
      {finance && <div><Button onClick={() => setEdit('new')}>Novo item</Button></div>}
      <ErrorNote error={error} />
      <DataTable<CatalogItem> caption="Catálogo de custos" rows={data ?? []} getRowKey={(r) => r.id} emptyTitle="Catálogo vazio"
        columns={[
          {key: 'name', header: 'Item', render: (r) => (finance ? <button type="button" className="ads-link" style={{background: 'none', border: 0, cursor: 'pointer', font: 'inherit', padding: 0, textAlign: 'left'}} onClick={() => setEdit(r)}>{r.name}</button> : r.name)},
          {key: 'vendor', header: 'Fornecedor / plano', render: (r) => [r.vendor, r.plan].filter(Boolean).join(' · ') || '—'},
          {key: 'price', header: 'Custo', render: (r) => <>{money(r.price_cents, r.currency)} <small className="muted">{PERIOD[r.periodicity]}</small></>},
          {key: 'projects_served', header: 'Projetos', render: (r) => (r.allocation_pct !== null ? `${r.allocation_pct}%` : `÷ ${r.projects_served}`)},
          {key: 'v', header: 'Situação', render: (r) => (!r.active ? <Badge tone="neutral">Inativo</Badge> : r.price_cents === null ? <Badge tone="warning">Preencher preço</Badge> : r.price_verified ? <Badge tone="success">Verificado {r.verified_at ? dateBR(r.verified_at) : ''}</Badge> : <Badge tone="info">Manual</Badge>)},
          {key: 'inc', header: 'Observação', render: (r) => (r.included_in_id ? `incluído em ${(data ?? []).find((x) => x.id === r.included_in_id)?.name ?? 'outro plano'}` : (r.source ?? '—'))}
        ]} />
      {edit && <CatalogDialog item={edit === 'new' ? null : edit} all={data ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function Fx() {
  const {can} = useAuth();
  const {toast} = useToast();
  const finance = can('admin', 'financeiro');
  const {data, error, reload} = useLoad(() => api.get<{latest: {currency: string; rate: number; as_of: string; source: string}[]; history: {id: string; currency: string; rate: number; as_of: string; source: string; manual: boolean; created_at: string}[]}>('/pricing/fx'), []);
  const [f, setF] = useState({currency: 'EUR', rate: '', as_of: new Date().toISOString().slice(0, 10), source: ''});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="stack-lg">
      <ErrorNote error={error} />
      <div className="kpis">{['EUR', 'USD'].map((c) => { const x = data?.latest.find((l) => l.currency === c); return (
        <Card key={c} className="kpi"><p className="muted">{c}/BRL</p><p className="pdv-big">{x ? `R$ ${x.rate.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 4})}` : '—'}</p><small className="muted">{x ? `${dateBR(x.as_of)} · ${x.source}` : 'sem cotação cadastrada'}</small></Card>); })}</div>
      {finance && <Card title="Atualizar cotação">
        <div className="dialog-actions" style={{justifyContent: 'flex-start'}}>
          <Button loading={busy} onClick={async () => { setBusy(true); setErr(null); try { await api.post('/pricing/fx/refresh'); toast({title: 'Cotações oficiais atualizadas', tone: 'success'}); reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }}>Buscar cotação oficial (BCE)</Button>
        </div>
        <ErrorNote error={err} />
        <form className="form-grid" onSubmit={async (e) => { e.preventDefault(); try { await api.post('/pricing/fx', {currency: f.currency, rate: Number(f.rate.replace(',', '.')), as_of: f.as_of, source: f.source}); setF({...f, rate: '', source: ''}); toast({title: 'Cotação registrada', tone: 'success'}); reload(); } catch (x) { setErr((x as Error).message); } }}>
          <Select label="Moeda" value={f.currency} options={[{value: 'EUR', label: 'EUR'}, {value: 'USD', label: 'USD'}]} onChange={(e) => setF({...f, currency: e.target.value})} />
          <Input label="Cotação (BRL)" required inputMode="decimal" value={f.rate} onChange={(e) => setF({...f, rate: e.target.value})} />
          <Input label="Data" type="date" required value={f.as_of} onChange={(e) => setF({...f, as_of: e.target.value})} />
          <Input label="Fonte" required value={f.source} onChange={(e) => setF({...f, source: e.target.value})} placeholder="ex.: Banco Central (PTAX)" />
          <div><Button type="submit" variant="outline">Registrar manualmente</Button></div>
        </form>
        <p className="muted" style={{fontSize: '.85rem'}}>Propostas já emitidas guardam a cotação usada e não mudam.</p>
      </Card>}
      <DataTable caption="Histórico de cotações" rows={data?.history ?? []} getRowKey={(r) => r.id} emptyTitle="Sem cotações"
        columns={[{key: 'created_at', header: 'Registrada', render: (r) => dateTimeBR(r.created_at)}, {key: 'currency', header: 'Moeda'}, {key: 'rate', header: 'Cotação', render: (r) => r.rate.toLocaleString('pt-BR', {maximumFractionDigits: 4})}, {key: 'as_of', header: 'Data', render: (r) => dateBR(r.as_of)}, {key: 'source', header: 'Fonte'}, {key: 'manual', header: 'Origem', render: (r) => (r.manual ? 'manual' : 'automática')}]} />
    </div>
  );
}

interface TaxRow {id: string; name: string; regime: string; initial_rate_pct: number | null; recurring_rate_pct: number | null; base: string; valid_from: string; valid_to: string | null; validated_at: string | null; validated_by_name: string | null; validation_ref: string | null; active: boolean}
function Tax() {
  const {can} = useAuth();
  const {toast} = useToast();
  const finance = can('admin', 'financeiro');
  const {data, error, reload} = useLoad(() => api.get<{configs: TaxRow[]; current: TaxRow | null}>('/pricing/tax'), []);
  const [f, setF] = useState({name: '', regime: '', initial: '', recurring: '', valid_from: new Date().toISOString().slice(0, 10), base: 'receita_bruta'});
  const [val, setVal] = useState<TaxRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
  return (
    <div className="stack-lg">
      <Alert tone={data?.current ? 'success' : 'warning'} title={data?.current ? `Em uso: ${data.current.name}` : 'Nenhuma configuração tributária validada'}>
        {data?.current ? `Alíquota inicial ${data.current.initial_rate_pct}% · recorrente ${data.current.recurring_rate_pct}% — validada por ${data.current.validated_by_name}.` : 'A Argos não presume alíquotas. Cadastre a configuração e registre a validação da contabilidade; até lá, tributos = R$ 0,00 e a emissão exige confirmação expressa.'}
      </Alert>
      <ErrorNote error={error} />
      <DataTable<TaxRow> caption="Configurações tributárias" rows={data?.configs ?? []} getRowKey={(r) => r.id} emptyTitle="Nenhuma configuração"
        columns={[{key: 'name', header: 'Configuração'}, {key: 'regime', header: 'Regime'}, {key: 'rates', header: 'Alíquota inicial / recorrente', render: (r) => `${r.initial_rate_pct ?? '—'}% / ${r.recurring_rate_pct ?? '—'}%`},
          {key: 'vig', header: 'Vigência', render: (r) => `${dateBR(r.valid_from)} → ${r.valid_to ? dateBR(r.valid_to) : 'indeterminada'}`},
          {key: 'v', header: 'Validação', render: (r) => (r.validated_at ? <Badge tone="success">Validada por {r.validated_by_name}</Badge> : finance ? <Button size="sm" onClick={() => setVal(r)}>Registrar validação</Button> : <Badge tone="warning">Pendente</Badge>)}]} />
      {finance && <Card title="Nova configuração">
        <form className="form-grid" onSubmit={async (e) => { e.preventDefault(); try { await api.post('/pricing/tax', {name: f.name, regime: f.regime, initial_rate_pct: num(f.initial), recurring_rate_pct: num(f.recurring), base: f.base, valid_from: f.valid_from, valid_to: null, notes: null}); setF({...f, name: '', initial: '', recurring: ''}); toast({title: 'Configuração criada (pendente de validação)', tone: 'success'}); reload(); } catch (x) { setErr((x as Error).message); } }}>
          <Input label="Nome" required value={f.name} onChange={(e) => setF({...f, name: e.target.value})} />
          <Input label="Regime tributário" required value={f.regime} onChange={(e) => setF({...f, regime: e.target.value})} hint="Conforme definido pela contabilidade" />
          <Input label="Alíquota efetiva — receita inicial (%)" inputMode="decimal" value={f.initial} onChange={(e) => setF({...f, initial: e.target.value})} />
          <Input label="Alíquota efetiva — receita recorrente (%)" inputMode="decimal" value={f.recurring} onChange={(e) => setF({...f, recurring: e.target.value})} />
          <Select label="Base de cálculo" value={f.base} onChange={(e) => setF({...f, base: e.target.value})} options={[{value: 'receita_bruta', label: 'Receita bruta'}, {value: 'receita_liquida', label: 'Receita líquida'}, {value: 'outra', label: 'Outra'}]} />
          <Input label="Vigência a partir de" type="date" required value={f.valid_from} onChange={(e) => setF({...f, valid_from: e.target.value})} />
          <div><Button type="submit">Criar</Button></div>
        </form>
        <ErrorNote error={err} />
      </Card>}
      {val && <ConfirmDialogValidate row={val} onClose={() => setVal(null)} onDone={() => { setVal(null); reload(); toast({title: 'Validação registrada', tone: 'success'}); }} />}
    </div>
  );
}

function ConfirmDialogValidate({row, onClose, onDone}: {row: TaxRow; onClose: () => void; onDone: () => void}) {
  const [who, setWho] = useState('');
  const [ref, setRef] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog open onClose={onClose} title="Registrar validação da contabilidade">
      <form className="dialog-body" onSubmit={async (e) => { e.preventDefault(); try { await api.post(`/pricing/tax/${row.id}/validate`, {validated_by_name: who, validation_ref: ref, confirm: true}); onDone(); } catch (x) { setErr((x as Error).message); } }}>
        <p>Confirme que <strong>{row.name}</strong> ({row.initial_rate_pct}% inicial / {row.recurring_rate_pct}% recorrente) foi validada pela contabilidade. Alterar alíquotas depois revoga esta validação.</p>
        <Input label="Quem validou (contador/escritório)" required value={who} onChange={(e) => setWho(e.target.value)} />
        <Input label="Documento ou parecer de referência" required value={ref} onChange={(e) => setRef(e.target.value)} />
        <ErrorNote error={err} />
        <div className="dialog-actions"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit">Confirmar validação</Button></div>
      </form>
    </Dialog>
  );
}

interface Profile {address: string | null; phone: string | null; email: string | null; bank_name: string | null; bank_agency: string | null; bank_account: string | null; pix_key_cnpj: string | null; pix_key_random: string | null; pix_receiver_name: string | null; pix_city: string | null; google_review_url: string | null; responsible_name: string | null; responsible_role: string | null}
function Settings() {
  const {can} = useAuth();
  const {toast} = useToast();
  const st = useLoad(() => api.get<{hourly_rate_cents: number; min_dev_hours: number; validity_days: number; default_margin_pct: number; card_fees: {installments: number; fee_pct: number; source?: string}[]}>('/pricing/settings'), []);
  const pr = useLoad(() => api.get<Profile>('/pricing/profile'), []);
  const [s, setS] = useState<typeof st.data>(null);
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const sv = s ?? st.data;
  const pv = p ?? pr.data;
  if (!sv || !pv) return null;
  const finance = can('admin', 'financeiro');
  const setPf = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => setP({...pv, [k]: e.target.value});
  return (
    <div className="stack-lg">
      <Card title="Parâmetros de precificação">
        <div className="form-grid">
          <MoneyInput label="Valor/hora padrão" value={sv.hourly_rate_cents} onChange={(c) => setS({...sv, hourly_rate_cents: c ?? 0})} />
          <Input label="Mínimo de referência (horas de desenvolvimento)" type="number" value={String(sv.min_dev_hours)} onChange={(e) => setS({...sv, min_dev_hours: Number(e.target.value)})} />
          <Input label="Validade padrão (dias)" type="number" value={String(sv.validity_days)} onChange={(e) => setS({...sv, validity_days: Number(e.target.value)})} />
          <Input label="Margem padrão (%)" type="number" value={String(sv.default_margin_pct)} onChange={(e) => setS({...sv, default_margin_pct: Number(e.target.value)})} />
        </div>
        <p className="muted" style={{fontSize: '.85rem'}}>Taxas de cartão cadastradas: {sv.card_fees.map((c) => `${c.installments}x = ${c.fee_pct}%`).join(' · ') || 'nenhuma'}</p>
        {finance && <div><Button onClick={async () => { try { await api.patch('/pricing/settings', sv); toast({title: 'Parâmetros salvos', tone: 'success'}); setS(null); st.reload(); } catch (e) { setErr((e as Error).message); } }}>Salvar parâmetros</Button></div>}
      </Card>
      <Card title="Dados da Argos nas propostas (pagamento, Pix e avaliação no Google)">
        <div className="form-grid">
          <Input label="Endereço" value={pv.address ?? ''} onChange={setPf('address')} disabled={!can('admin')} />
          <Input label="Telefone" value={pv.phone ?? ''} onChange={setPf('phone')} disabled={!can('admin')} />
          <Input label="E-mail" value={pv.email ?? ''} onChange={setPf('email')} disabled={!can('admin')} />
          <Input label="Responsável (assinatura)" value={pv.responsible_name ?? ''} onChange={setPf('responsible_name')} disabled={!can('admin')} />
          <Input label="Cargo" value={pv.responsible_role ?? ''} onChange={setPf('responsible_role')} disabled={!can('admin')} />
          <Input label="Banco" value={pv.bank_name ?? ''} onChange={setPf('bank_name')} disabled={!can('admin')} />
          <Input label="Agência" value={pv.bank_agency ?? ''} onChange={setPf('bank_agency')} disabled={!can('admin')} />
          <Input label="Conta" value={pv.bank_account ?? ''} onChange={setPf('bank_account')} disabled={!can('admin')} />
          <Input label="Pix (CNPJ)" value={pv.pix_key_cnpj ?? ''} onChange={setPf('pix_key_cnpj')} disabled={!can('admin')} />
          <Input label="Pix (chave aleatória)" value={pv.pix_key_random ?? ''} onChange={setPf('pix_key_random')} disabled={!can('admin')} />
          <Input label="Nome do recebedor no Pix (até 25)" maxLength={25} value={pv.pix_receiver_name ?? ''} onChange={setPf('pix_receiver_name')} disabled={!can('admin')} />
          <Input label="Cidade do recebedor no Pix (até 15)" maxLength={15} value={pv.pix_city ?? ''} onChange={setPf('pix_city')} disabled={!can('admin')} />
          <div className="span-2"><Input label="Link oficial de avaliação no Google" value={pv.google_review_url ?? ''} onChange={setPf('google_review_url')} disabled={!can('admin')} placeholder="https://g.page/r/…/review" hint="Cole o link real do seu Perfil da Empresa no Google. Sem link, o QR não aparece na proposta." /></div>
        </div>
        <ErrorNote error={err} />
        {can('admin') ? <div><Button onClick={async () => { try { await api.patch('/pricing/profile', pick(pv)); toast({title: 'Dados salvos', tone: 'success'}); setP(null); pr.reload(); } catch (e) { setErr((e as Error).message); } }}>Salvar dados</Button></div> : <p className="muted">Somente administradores alteram estes dados.</p>}
      </Card>
    </div>
  );
}
const KEYS = ['address', 'phone', 'email', 'bank_name', 'bank_agency', 'bank_account', 'pix_key_cnpj', 'pix_key_random', 'pix_receiver_name', 'pix_city', 'google_review_url', 'responsible_name', 'responsible_role'] as const;
const pick = (p: Profile) => Object.fromEntries(KEYS.map((k) => [k, (p[k] ?? '') || null]));

export function PricingAdminPage() {
  const [tab, setTab] = useState('catalogo');
  return (
    <div className="stack-lg">
      <PageHeader title="Precificação" subtitle="Catálogo de custos, câmbio, tributos e parâmetros do módulo Argos Pricing" />
      <Tabs label="Precificação" idPrefix="prc" value={tab} onChange={setTab} items={[{id: 'catalogo', label: 'Catálogo de custos'}, {id: 'cambio', label: 'Câmbio'}, {id: 'tributos', label: 'Tributos'}, {id: 'param', label: 'Parâmetros e dados da empresa'}]} />
      {tab === 'catalogo' && <Catalog />}
      {tab === 'cambio' && <Fx />}
      {tab === 'tributos' && <Tax />}
      {tab === 'param' && <Settings />}
    </div>
  );
}
void brl; void ConfirmDialog;
