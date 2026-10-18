import {useEffect, useMemo, useRef, useState} from 'react';
import {Link as RLink, useNavigate, useParams, useSearchParams} from 'react-router-dom';
import {Alert, Button, Card, Checkbox, DataTable, Dialog, Input, Select, Tabs, Textarea, useToast} from '../ds';
import {api} from '../api';
import {useAuth} from '../auth';
import {brl, dateBR, dateTimeBR, formatDocument} from '../format';
import {ConfirmDialog, ErrorNote, Loading, Money, MoneyInput, PageHeader, Status, useLoad} from '../ui';
import {CatalogRefsEditor, LinesEditor, ListEditor, MethodEditor, PaymentEditor, SimulationPanel, cleanList} from '../pricing/editors';
import type {CatalogItem, Computed, Content} from '../pricing/types';

interface Row {id: string; number: string; project_name: string; client_name: string; display_status: string; one_time_cents: number; monthly_cents: number; issued_at: string | null; valid_until: string | null; current_version: number; contract_id: string | null}

function NewProposalDialog({onClose}: {onClose: () => void}) {
  const nav = useNavigate();
  const clients = useLoad(() => api.get<{id: string; name: string; document: string | null}[]>('/clients'), []);
  const templates = useLoad(() => api.get<{id: string; name: string; kind: string}[]>('/pricing/templates'), []);
  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [doc, setDoc] = useState('');
  const [address, setAddress] = useState('');
  const [project, setProject] = useState('');
  const [owner, setOwner] = useState('');
  const [tpl, setTpl] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={onClose} title="Nova proposta">
      <form className="dialog-body" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        try {
          const p = await api.post<{id: string}>('/proposals', {...(clientId ? {client_id: clientId} : {client: {name, document: doc || null, address: address || null}}), project_name: project, commercial_owner: owner || null, template_ids: tpl});
          nav(`/propostas/${p.id}`);
        } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}>
        <Select label="Cliente cadastrado" value={clientId} placeholder="— cliente novo / ainda não cadastrado —" onChange={(e) => setClientId(e.target.value)} options={(clients.data ?? []).map((c) => ({value: c.id, label: `${c.name}${c.document ? ` · ${formatDocument(c.document)}` : ''}`}))} />
        {!clientId && (<div className="form-grid">
          <Input label="Nome / razão social" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="CPF/CNPJ" value={doc} onChange={(e) => setDoc(e.target.value)} />
          <div className="span-2"><Input label="Endereço completo" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        </div>)}
        <div className="form-grid">
          <Input label="Nome do sistema/projeto" required value={project} onChange={(e) => setProject(e.target.value)} />
          <Input label="Responsável comercial" value={owner} onChange={(e) => setOwner(e.target.value)} />
        </div>
        {(templates.data ?? []).length > 0 && (<fieldset className="form-section"><legend>Modelos reutilizáveis</legend>
          {(templates.data ?? []).map((t) => <Checkbox key={t.id} label={`${t.name} (${t.kind})`} checked={tpl.includes(t.id)} onChange={(e) => setTpl(e.target.checked ? [...tpl, t.id] : tpl.filter((x) => x !== t.id))} />)}</fieldset>)}
        <ErrorNote error={error} />
        <div className="dialog-actions"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" loading={busy} disabled={!project || (!clientId && !name)}>Criar e calcular</Button></div>
      </form>
    </Dialog>
  );
}

export function ProposalsPage() {
  const {can} = useAuth();
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState('');
  const {data, error, loading} = useLoad(() => api.get<Row[]>('/proposals'), []);
  const rows = (data ?? []).filter((r) => !status || r.display_status === status);
  return (
    <div className="stack-lg">
      <PageHeader title="Propostas" subtitle="Precificação, propostas comerciais em PDF e aprovação" actions={<>
        <RLink to="/precificacao" className="ads-btn ads-btn--outline" style={{textDecoration: 'none'}}>Catálogo, tributos e parâmetros</RLink>
        {can('admin', 'financeiro', 'operador') && <Button onClick={() => setCreating(true)}>Nova proposta</Button>}</>} />
      <div className="filters"><Select label="Situação" value={status} placeholder="Todas" onChange={(e) => setStatus(e.target.value)} options={['rascunho', 'emitida', 'enviada', 'aprovada', 'recusada', 'expirada', 'cancelada'].map((s) => ({value: s, label: s[0]!.toUpperCase() + s.slice(1)}))} /></div>
      <ErrorNote error={error} />
      <DataTable<Row> caption="Propostas" loading={loading} rows={rows} getRowKey={(r) => r.id} emptyTitle="Nenhuma proposta" emptyDescription="Crie a primeira proposta para calcular preço e gerar o PDF."
        columns={[
          {key: 'number', header: 'Número', sortable: true, render: (r) => <RLink to={`/propostas/${r.id}`}>{r.number}</RLink>},
          {key: 'client_name', header: 'Cliente', sortable: true}, {key: 'project_name', header: 'Projeto'},
          {key: 'display_status', header: 'Situação', render: (r) => <Status value={r.display_status === 'emitida' || r.display_status === 'enviada' ? 'proposta' : r.display_status === 'aprovada' ? 'ativo' : r.display_status === 'expirada' ? 'vencida' : r.display_status} />},
          {key: 'one_time_cents', header: 'Inicial', render: (r) => <Money cents={r.one_time_cents} />}, {key: 'monthly_cents', header: 'Mensal', render: (r) => <Money cents={r.monthly_cents} />},
          {key: 'valid_until', header: 'Validade', render: (r) => dateBR(r.valid_until)}, {key: 'current_version', header: 'Versão', render: (r) => `v${r.current_version}`}
        ]} />
      {creating && <NewProposalDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

interface Detail {
  proposal: {id: string; number: string; status: string; client_id: string | null; client_snapshot: {name: string; document: string | null; address: string | null}; current_version: number; approved_version: number | null; contract_id: string | null; valid_until: string | null; issued_at: string | null};
  version: {version: number; status: 'rascunho' | 'emitida'; content: Content; change_note: string | null; pdf_document_id: string | null};
  computed: Computed;
  versions: {version: number; status: string; change_note: string | null; created_at: string; issued_at: string | null; one_time_cents: number; monthly_cents: number}[];
  history: {at: string; user_name: string | null; action: string; detail: Record<string, unknown>}[];
}

const TABS = [['ident', 'Identificação'], ['escopo', 'Escopo'], ['prazo', 'Prazo e infraestrutura'], ['calc', 'Calculadora'], ['pagto', 'Pagamento'], ['fora', 'Fora do escopo e condições'], ['preview', 'Pré-visualização e PDF'], ['hist', 'Histórico'], ['aprov', 'Aprovação e contrato']] as const;

export function ProposalEditorPage() {
  const {id = ''} = useParams();
  const [sp, setSp] = useSearchParams();
  const wanted = sp.get('version');
  const {can} = useAuth();
  const {toast} = useToast();
  const [tab, setTab] = useState('ident');
  const {data, error, loading, reload} = useLoad(() => api.get<Detail>(`/proposals/${id}${wanted ? `?version=${wanted}` : ''}`), [id, wanted]);
  const catalog = useLoad(() => api.get<CatalogItem[]>('/pricing/catalog'), []);
  const settings = useLoad(() => api.get<{hourly_rate_cents: number; card_fees: {installments: number; fee_pct: number; source?: string}[]}>('/pricing/settings'), []);
  const clients = useLoad(() => api.get<{id: string; name: string; document: string | null}[]>('/clients'), []);
  const [content, setContent] = useState<Content | null>(null);
  const [clientId, setClientId] = useState('');
  const [cd, setCd] = useState({name: '', document: '', address: ''});
  const [dirty, setDirty] = useState(false);
  const [sim, setSim] = useState<Computed | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stamp, setStamp] = useState(1);
  const [dlg, setDlg] = useState<'issue' | 'newver' | 'status' | null>(null);
  const [note, setNote] = useState('');
  const [issueErr, setIssueErr] = useState<string[] | null>(null);

  useEffect(() => {
    if (!data) return;
    setContent(data.version.content);
    setClientId(data.proposal.client_id ?? '');
    setCd({name: data.proposal.client_snapshot?.name ?? '', document: data.proposal.client_snapshot?.document ?? '', address: data.proposal.client_snapshot?.address ?? ''});
    setSim(data.computed); setDirty(false);
  }, [data]);

  const readOnly = data?.version.status === 'emitida';
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!content || readOnly) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSimBusy(true);
      try { setSim(await api.post<Computed>('/pricing/simulate', {content: normalize(content)})); } catch { /* validação parcial durante digitação */ } finally { setSimBusy(false); }
    }, 450);
    return () => window.clearTimeout(timer.current);
  }, [content, readOnly]);

  const upd = (fn: (c: Content) => Content) => { setContent((c) => (c ? fn(c) : c)); setDirty(true); };
  const catalogOpts = catalog.data ?? [];
  const canEdit = can('admin', 'financeiro', 'operador') && !readOnly;
  const finance = can('admin', 'financeiro');

  async function save(): Promise<boolean> {
    if (!content) return false;
    setSaving(true);
    try {
      await api.put(`/proposals/${id}/draft`, {content: normalize(content), ...(clientId ? {client_id: clientId} : {client: {name: cd.name, document: cd.document || null, address: cd.address || null}})});
      setDirty(false); setStamp((s) => s + 1); toast({title: 'Rascunho salvo', tone: 'success'});
      return true;
    } catch (e) { toast({title: 'Não foi possível salvar', description: (e as Error).message, tone: 'danger'}); return false; } finally { setSaving(false); }
  }

  if (loading && !data) return <Loading />;
  if (!data || !content) return <ErrorNote error={error} />;
  const p = data.proposal;
  const c = content;
  const pdfUrl = `/api/proposals/${id}/pdf?version=${data.version.version}&t=${stamp}`;
  const resolvedOne = sim?.catalog_resolved.one_time ?? [];
  const resolvedRec = sim?.catalog_resolved.recurring ?? [];

  return (
    <div className="stack-lg">
      <PageHeader title={`${p.number} · v${data.version.version}`} subtitle={`${c.identification.project_name} — ${p.client_snapshot?.name ?? ''}`} actions={<>
        <Status value={readOnly ? (p.status === 'aprovada' ? 'ativo' : 'proposta') : 'rascunho'} />
        {canEdit && <Button variant="outline" loading={saving} disabled={!dirty} onClick={() => void save()}>Salvar rascunho</Button>}
        {finance && !readOnly && <Button onClick={async () => { if (dirty && !(await save())) return; setIssueErr(null); setDlg('issue'); }}>Emitir proposta</Button>}
        {readOnly && data.version.version !== p.current_version && <Button variant="outline" onClick={() => setSp({})}>Ver versão atual</Button>}
        <RLink to="/propostas" className="ads-btn ads-btn--outline" style={{textDecoration: 'none'}}>Voltar</RLink>
      </>} />
      {readOnly && <Alert tone="info" title={`Versão ${data.version.version} emitida: congelada`}>Valores, câmbio, tributação e catálogo desta versão foram preservados e não mudam com novas cotações. Para alterar, crie uma nova versão (aba Histórico).</Alert>}
      {dirty && <Alert tone="warning" title="Alterações não salvas">Clique em “Salvar rascunho” antes de pré-visualizar o PDF ou emitir.</Alert>}
      <div className="two-col" style={{alignItems: 'start'}}>
        <div className="stack-lg" style={{minWidth: 0}}>
          <Tabs label="Seções da proposta" idPrefix="prop" value={tab} onChange={setTab} items={TABS.map(([i, l]) => ({id: i, label: l}))} />

          {tab === 'ident' && (<Card title="Identificação da proposta">
            <div className="form-grid">
              <Select label="Cliente cadastrado" value={clientId} placeholder="— cliente ainda não cadastrado —" disabled={!canEdit} onChange={(e) => { setClientId(e.target.value); const cl = (clients.data ?? []).find((x) => x.id === e.target.value); if (cl) setCd({name: cl.name, document: cl.document ?? '', address: cd.address}); setDirty(true); }}
                options={(clients.data ?? []).map((x) => ({value: x.id, label: x.name}))} hint="Ao aprovar, a proposta é vinculada ao cliente (ou o cliente é criado com sua confirmação)." />
              <Input label="Cliente (nome/razão social)" disabled={!canEdit || !!clientId} value={cd.name} onChange={(e) => { setCd({...cd, name: e.target.value}); setDirty(true); }} />
              <Input label="CPF/CNPJ" disabled={!canEdit || !!clientId} value={formatDocument(cd.document)} onChange={(e) => { setCd({...cd, document: e.target.value}); setDirty(true); }} />
              <Input label="Endereço completo" disabled={!canEdit || !!clientId} value={cd.address} onChange={(e) => { setCd({...cd, address: e.target.value}); setDirty(true); }} hint={clientId ? 'Vem do cadastro do cliente' : undefined} />
              <Input label="Nome do sistema/projeto" disabled={!canEdit} value={c.identification.project_name} onChange={(e) => upd((x) => ({...x, identification: {...x.identification, project_name: e.target.value}}))} />
              <Input label="Responsável comercial" disabled={!canEdit} value={c.identification.commercial_owner ?? ''} onChange={(e) => upd((x) => ({...x, identification: {...x.identification, commercial_owner: e.target.value}}))} />
              <Input label="Validade (dias)" type="number" min={1} disabled={!canEdit} value={String(c.identification.validity_days)} onChange={(e) => upd((x) => ({...x, identification: {...x.identification, validity_days: Number(e.target.value)}}))} hint="Padrão 15 dias, contados da emissão" />
              <Input label="Data de emissão" disabled value={p.issued_at ? dateBR(p.issued_at) : 'preenchida na emissão'} onChange={() => undefined} />
            </div>
          </Card>)}

          {tab === 'escopo' && (<Card title="Objeto e escopo">
            <Textarea label="Objeto (descrição dos serviços)" rows={4} disabled={!canEdit} value={c.scope.summary} onChange={(e) => upd((x) => ({...x, scope: {...x.scope, summary: e.target.value}}))} />
            <p className="muted" style={{fontSize: '.85rem'}}>Módulos e funcionalidades. A IA para sugerir descrições ainda não está ativa: escreva ou use modelos.</p>
            {c.scope.groups.map((g, i) => (
              <div key={i} className="item-card">
                <Input label="Módulo / grupo" disabled={!canEdit} value={g.title} onChange={(e) => upd((x) => ({...x, scope: {...x.scope, groups: x.scope.groups.map((y, j) => (j === i ? {...y, title: e.target.value} : y))}}))} />
                <ListEditor label="Funcionalidades, entregas e tecnologias" value={g.items} onChange={(v) => upd((x) => ({...x, scope: {...x.scope, groups: x.scope.groups.map((y, j) => (j === i ? {...y, items: v} : y))}}))} />
                {canEdit && <div><Button variant="outline" size="sm" onClick={() => upd((x) => ({...x, scope: {...x.scope, groups: x.scope.groups.filter((_, j) => j !== i)}}))}>Remover grupo</Button></div>}
              </div>))}
            {canEdit && <div className="dialog-actions" style={{justifyContent: 'flex-start'}}>
              <Button variant="outline" onClick={() => upd((x) => ({...x, scope: {...x.scope, groups: [...x.scope.groups, {title: '', items: []}]}}))}>+ Grupo</Button>
              <TemplateButtons kind="escopo" current={() => ({summary: c.scope.summary, groups: c.scope.groups.map((g) => ({...g, items: cleanList(g.items)}))})} onLoad={(b) => upd((x) => ({...x, scope: {summary: (b as Content['scope']).summary ?? '', groups: (b as Content['scope']).groups ?? []}}))} />
            </div>}
          </Card>)}

          {tab === 'prazo' && (<Card title="Prazo e infraestrutura">
            <div className="form-grid">
              {([['dev_hours_text', 'Horas previstas (texto)'], ['deadline', 'Prazo de implantação'], ['training', 'Treinamento'], ['hosting', 'Hospedagem e banco de dados'], ['database', 'Banco de dados'], ['domain', 'Domínio'], ['email', 'E-mail']] as const).map(([k, l]) => (
                <Input key={k} label={l} disabled={!canEdit} value={c.schedule[k] ?? ''} onChange={(e) => upd((x) => ({...x, schedule: {...x.schedule, [k]: e.target.value}}))} />))}
              <div className="span-2"><Textarea label="Responsabilidades pelos custos (quem paga o quê)" rows={3} disabled={!canEdit} value={c.schedule.responsibilities ?? ''} onChange={(e) => upd((x) => ({...x, schedule: {...x.schedule, responsibilities: e.target.value}}))} /></div>
            </div>
          </Card>)}

          {tab === 'calc' && (<div className="stack-lg">
            <Card title="Desenvolvimento, testes, publicação, implementação e treinamento (custos únicos)">
              <MoneyInput label="Valor/hora padrão" value={c.calc.hourly_rate_cents} onChange={(v) => upd((x) => ({...x, calc: {...x.calc, hourly_rate_cents: v ?? 0}}))} hint="Padrão da empresa: R$ 35,00. Mínimo de referência: 24 h de desenvolvimento (exceção exige justificativa)." />
              {canEdit ? <LinesEditor lines={c.calc.one_time_lines} hourlyRate={c.calc.hourly_rate_cents} onChange={(l) => upd((x) => ({...x, calc: {...x.calc, one_time_lines: l}}))} /> : <p className="muted">Somente leitura.</p>}
            </Card>
            <Card title="Ferramentas, domínio, e-mail e infraestrutura no valor inicial (catálogo)">
              <CatalogRefsEditor refs={c.calc.one_time_catalog} catalog={catalogOpts} resolved={resolvedOne} onChange={(r) => upd((x) => ({...x, calc: {...x.calc, one_time_catalog: r}}))} />
            </Card>
            <Card title="Custo mensal interno (sustentação, ferramentas, infraestrutura)">
              <p className="muted" style={{fontSize: '.85rem'}}>Custo interno — separado do preço mensal cobrado. Itens do catálogo são rateados entre os projetos atendidos.</p>
              <CatalogRefsEditor recurring refs={c.calc.recurring_catalog} catalog={catalogOpts} resolved={resolvedRec} onChange={(r) => upd((x) => ({...x, calc: {...x.calc, recurring_catalog: r}}))} />
              <LinesEditor recurring lines={c.calc.recurring_lines} hourlyRate={c.calc.hourly_rate_cents} onChange={(l) => upd((x) => ({...x, calc: {...x.calc, recurring_lines: l}}))} />
            </Card>
            <Card title="Licença do sistema">
              <div className="form-grid">
                <Select label="Modelo" value={c.calc.license.mode} onChange={(e) => upd((x) => ({...x, calc: {...x.calc, license: {mode: e.target.value as Content['calc']['license']['mode'], value: 0}}}))}
                  options={[{value: 'none', label: 'Sem licença'}, {value: 'fixed_once', label: 'Valor fixo (único)'}, {value: 'pct_dev_cost', label: '% sobre custo de desenvolvimento'}, {value: 'pct_subtotal', label: '% sobre subtotal do projeto'}, {value: 'monthly_fixed', label: 'Licença recorrente mensal'}]} />
                {(c.calc.license.mode === 'fixed_once' || c.calc.license.mode === 'monthly_fixed') && <MoneyInput label="Valor" value={c.calc.license.value} onChange={(v) => upd((x) => ({...x, calc: {...x.calc, license: {...x.calc.license, value: v ?? 0}}}))} />}
                {(c.calc.license.mode === 'pct_dev_cost' || c.calc.license.mode === 'pct_subtotal') && <Input label="Percentual (%)" type="number" min={0} step="0.5" value={String(c.calc.license.value)} onChange={(e) => upd((x) => ({...x, calc: {...x.calc, license: {...x.calc.license, value: Number(e.target.value)}}}))} hint="Definido manualmente pelo administrador" />}
              </div>
            </Card>
            <MethodEditor title="Preço da parte inicial" value={c.calc.pricing} onChange={(m) => upd((x) => ({...x, calc: {...x.calc, pricing: m}}))} />
            <MethodEditor title="Preço da mensalidade (sobre o custo mensal interno)" value={c.calc.recurring_pricing} onChange={(m) => upd((x) => ({...x, calc: {...x.calc, recurring_pricing: m}}))} />
            <Card title="Desconto sobre o preço inicial">
              <div className="form-grid">
                <Select label="Tipo" value={c.calc.discount.type} options={[{value: 'none', label: 'Sem desconto'}, {value: 'pct', label: 'Percentual'}, {value: 'amount', label: 'Valor em reais'}]} onChange={(e) => upd((x) => ({...x, calc: {...x.calc, discount: {type: e.target.value as 'none' | 'pct' | 'amount', value: 0}}}))} />
                {c.calc.discount.type === 'pct' && <Input label="Desconto (%)" type="number" min={0} max={100} value={String(c.calc.discount.value)} onChange={(e) => upd((x) => ({...x, calc: {...x.calc, discount: {...x.calc.discount, value: Number(e.target.value)}}}))} />}
                {c.calc.discount.type === 'amount' && <MoneyInput label="Desconto (R$)" value={c.calc.discount.value} onChange={(v) => upd((x) => ({...x, calc: {...x.calc, discount: {...x.calc.discount, value: v ?? 0}}}))} />}
              </div>
              <p className="muted" style={{fontSize: '.85rem'}}>Descontos por item ficam em cada linha de custo.</p>
            </Card>
            <Card title="Confirmações para emitir com alertas">
              <Checkbox label="Confirmo emitir mesmo com preço/lucro abaixo do custo" checked={c.calc.acks.below_cost} onChange={(e) => upd((x) => ({...x, calc: {...x.calc, acks: {...x.calc.acks, below_cost: e.target.checked}}}))} />
              <Checkbox label="Confirmo emitir sem estimativa tributária (sem alíquota validada pela contabilidade)" checked={c.calc.acks.no_tax_config} onChange={(e) => upd((x) => ({...x, calc: {...x.calc, acks: {...x.calc.acks, no_tax_config: e.target.checked}}}))} />
              <Input label="Justificativa para horas abaixo do mínimo (24 h)" value={c.calc.acks.min_hours_reason ?? ''} onChange={(e) => upd((x) => ({...x, calc: {...x.calc, acks: {...x.calc.acks, min_hours_reason: e.target.value || null}}}))} />
            </Card>
          </div>)}

          {tab === 'pagto' && (<Card title="Investimento e forma de pagamento">
            <PaymentEditor options={c.payment.options} cardFees={settings.data?.card_fees ?? []} onChange={(o) => upd((x) => ({...x, payment: {...x.payment, options: o}}))} />
            <fieldset className="form-section"><legend>QR Code Pix e avaliação no Google</legend>
              <Checkbox label="Incluir QR Code Pix (validado antes de emitir)" checked={c.pix.include_qr} onChange={(e) => upd((x) => ({...x, pix: {...x.pix, include_qr: e.target.checked}}))} />
              {c.pix.include_qr && <div className="form-grid">
                <Select label="Chave" value={c.pix.key} options={[{value: 'cnpj', label: 'Pix CNPJ'}, {value: 'random', label: 'Pix chave aleatória'}]} onChange={(e) => upd((x) => ({...x, pix: {...x.pix, key: e.target.value as 'cnpj' | 'random'}}))} />
                <Select label="Valor no QR" value={c.pix.amount_mode} options={[{value: 'option', label: 'Entrada da opção escolhida'}, {value: 'none', label: 'Sem valor (livre)'}, {value: 'custom', label: 'Valor específico'}]} onChange={(e) => upd((x) => ({...x, pix: {...x.pix, amount_mode: e.target.value as 'none' | 'option' | 'custom'}}))} />
                {c.pix.amount_mode === 'option' && <Select label="Opção" value={c.pix.option_id ?? ''} placeholder="Selecione" options={c.payment.options.map((o, i) => ({value: o.id, label: `Opção ${i + 1}`}))} onChange={(e) => upd((x) => ({...x, pix: {...x.pix, option_id: e.target.value}}))} />}
                {c.pix.amount_mode === 'custom' && <MoneyInput label="Valor" value={c.pix.amount_cents ?? null} onChange={(v) => upd((x) => ({...x, pix: {...x.pix, amount_cents: v}}))} />}
              </div>}
              <Checkbox label="Incluir QR “Avalie nossa empresa no Google” (só aparece se o link oficial estiver configurado)" checked={c.google_review.include} onChange={(e) => upd((x) => ({...x, google_review: {include: e.target.checked}}))} />
            </fieldset>
          </Card>)}

          {tab === 'fora' && (<Card title="Fora do escopo e condições">
            <ListEditor label="Fora do escopo (exclusões, integrações, emissão fiscal, APIs, serviços sob orçamento)" value={c.out_of_scope} onChange={(v) => upd((x) => ({...x, out_of_scope: v}))} />
            <ListEditor label="Condições (pagamento, LGPD, reajuste, propriedade…)" value={c.conditions} onChange={(v) => upd((x) => ({...x, conditions: v}))} />
            {canEdit && <div className="dialog-actions" style={{justifyContent: 'flex-start'}}>
              <TemplateButtons kind="fora_escopo" current={() => cleanList(c.out_of_scope)} onLoad={(b) => upd((x) => ({...x, out_of_scope: b as string[]}))} />
              <TemplateButtons kind="condicoes" current={() => cleanList(c.conditions)} onLoad={(b) => upd((x) => ({...x, conditions: b as string[]}))} />
            </div>}
          </Card>)}

          {tab === 'preview' && (<div className="stack-lg">
            <Card title="O que o cliente vê">
              <p className="muted" style={{fontSize: '.85rem'}}>Por padrão margens, tributos e rateios de ferramentas ficam só na visão interna. Para exibir ao cliente, marque a autorização expressa.</p>
              <Checkbox label="Detalhar o investimento inicial por grupo de serviço" checked={c.visibility.show_one_time_breakdown} disabled={!canEdit} onChange={(e) => upd((x) => ({...x, visibility: {...x.visibility, show_one_time_breakdown: e.target.checked}}))} />
              <Checkbox label="AUTORIZO expor informações internas ao cliente (margem, tributos, rateios, custos)" checked={c.visibility.internal_disclosure_authorized} disabled={!canEdit} onChange={(e) => upd((x) => ({...x, visibility: {...x.visibility, internal_disclosure_authorized: e.target.checked}}))} />
              {c.visibility.internal_disclosure_authorized && (<div className="form-grid">
                {([['show_margin', 'Custos, subtotal e margem de lucro'], ['show_taxes', 'Tributos estimados'], ['show_monthly_breakdown', 'Mensalidade detalhada (ferramentas/rateios)'], ['show_infra_table', 'Tabela: custo de infraestrutura'], ['show_support_table', 'Tabela: custo de manutenção/suporte'], ['show_tools_allocation', 'Detalhes de câmbio e rateio de ferramentas']] as const).map(([k, l]) => (
                  <Checkbox key={k} label={l} checked={c.visibility[k]} disabled={!canEdit} onChange={(e) => upd((x) => ({...x, visibility: {...x.visibility, [k]: e.target.checked}}))} />))}
              </div>)}
            </Card>
            <Card title="Pré-visualização do PDF">
              <div className="dialog-actions" style={{justifyContent: 'flex-start'}}>
                {canEdit && <Button loading={saving} onClick={() => void save()}>Salvar e atualizar PDF</Button>}
                <a className="ads-btn ads-btn--outline" style={{textDecoration: 'none'}} href={`${pdfUrl}&download=1`}>Baixar PDF</a>
                <a className="ads-btn ads-btn--outline" style={{textDecoration: 'none'}} href={pdfUrl} target="_blank" rel="noopener noreferrer">Abrir em nova aba</a>
              </div>
              {dirty ? <Alert tone="warning" title="Há alterações não salvas">O PDF abaixo mostra a última versão salva.</Alert> : null}
              <iframe title="Pré-visualização da proposta em PDF" src={pdfUrl} style={{width: '100%', height: '78vh', border: '1px solid var(--ads-color-border)', borderRadius: 12, background: '#fff'}} />
            </Card>
          </div>)}

          {tab === 'hist' && (<div className="stack-lg">
            <Card title="Versões">
              <DataTable caption="Versões da proposta" rows={data.versions} getRowKey={(r) => String(r.version)} emptyTitle="Sem versões"
                columns={[{key: 'version', header: 'Versão', render: (r) => <button type="button" className="ads-link" style={{background: 'none', border: 0, cursor: 'pointer', font: 'inherit', padding: 0}} onClick={() => setSp({version: String(r.version)})}>v{r.version}</button>},
                  {key: 'status', header: 'Situação', render: (r) => <Status value={r.status === 'emitida' ? 'proposta' : 'rascunho'} />}, {key: 'one_time_cents', header: 'Inicial', render: (r) => (r.status === 'emitida' ? <Money cents={r.one_time_cents} /> : '—')},
                  {key: 'monthly_cents', header: 'Mensal', render: (r) => (r.status === 'emitida' ? <Money cents={r.monthly_cents} /> : '—')}, {key: 'change_note', header: 'Motivo', render: (r) => r.change_note ?? '—'},
                  {key: 'issued_at', header: 'Emitida em', render: (r) => dateTimeBR(r.issued_at)}, {key: 'pdf', header: 'PDF', render: (r) => (r.status === 'emitida' ? <a className="ads-link" href={`/api/proposals/${id}/pdf?version=${r.version}&download=1`}>baixar</a> : '—')}]} />
              {canEdit === false && finance && p.status !== 'aprovada' && readOnly && <div><Button onClick={() => setDlg('newver')}>Criar nova versão</Button></div>}
              {finance && p.status !== 'aprovada' && data.version.version === p.current_version && readOnly && <div><Button onClick={() => setDlg('newver')}>Criar nova versão</Button></div>}
              {can('admin', 'financeiro', 'operador') && p.status !== 'aprovada' && readOnly && data.version.version === p.current_version && null}
            </Card>
            <Card title="Quem alterou, quando e o valor anterior">
              <ul className="list">{data.history.map((h, i) => {
                const d = h.detail as {before?: {one_time_cents: number; monthly_cents: number}; after?: {one_time_cents: number; monthly_cents: number}; version?: number; note?: string};
                return <li key={i}><span><strong>{h.action}</strong> · {h.user_name ?? 'sistema'}{d.version ? ` · v${d.version}` : ''}{d.note ? ` · ${d.note}` : ''}
                  {d.before && d.after && <><br /><small className="muted">inicial {brl(d.before.one_time_cents)} → {brl(d.after.one_time_cents)} · mensal {brl(d.before.monthly_cents)} → {brl(d.after.monthly_cents)}</small></>}</span><small>{dateTimeBR(h.at)}</small></li>;
              })}</ul>
            </Card>
          </div>)}

          {tab === 'aprov' && <ApprovalPanel d={data} finance={finance} sim={sim} onDone={reload} />}
        </div>
        <div style={{position: 'sticky', top: 8, minWidth: 0}}><SimulationPanel c={readOnly ? data.computed : sim} loading={simBusy} /></div>
      </div>

      <ConfirmDialog open={dlg === 'issue'} title="Emitir proposta" confirmLabel="Emitir e gerar PDF oficial" onClose={() => setDlg(null)}
        onConfirm={async () => { try { await api.post(`/proposals/${id}/issue`, {confirm: true}); setDlg(null); toast({title: 'Proposta emitida e PDF gerado', tone: 'success'}); setSp({}); reload(); setTab('preview'); setStamp((s) => s + 1); } catch (e) { const x = e as {details?: {blocking?: {message: string}[]}; message: string}; setIssueErr(x.details?.blocking?.map((b) => b.message) ?? [x.message]); throw e; } }}>
        <p>Ao emitir, valores, câmbio, tributação, catálogo e dados do cliente são <strong>congelados</strong> nesta versão e o PDF oficial é gerado. Mudanças futuras exigem uma nova versão.</p>
        <p>Preço inicial <Money cents={sim?.totals.one_time_final_cents} strong /> · mensal <Money cents={sim?.totals.monthly_final_cents} strong />.</p>
        {issueErr && <Alert tone="danger" title="Pendências">{issueErr.join(' ')}</Alert>}
      </ConfirmDialog>
      <Dialog open={dlg === 'newver'} onClose={() => setDlg(null)} title="Nova versão">
        <form className="dialog-body" onSubmit={async (e) => { e.preventDefault(); await api.post(`/proposals/${id}/new-version`, {change_note: note}); setDlg(null); setNote(''); setSp({}); reload(); setTab('calc'); }}>
          <p>A versão emitida é preservada. Uma cópia editável (rascunho) é criada.</p>
          <Input label="Motivo da alteração" required value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="dialog-actions"><Button variant="outline" onClick={() => setDlg(null)}>Cancelar</Button><Button type="submit" disabled={note.trim().length < 3}>Criar versão</Button></div>
        </form>
      </Dialog>
    </div>
  );
}

function normalize(c: Content): Content {
  return {
    ...c,
    scope: {summary: c.scope.summary, groups: c.scope.groups.map((g) => ({title: g.title.trim() || 'Funcionalidades', items: cleanList(g.items)}))},
    out_of_scope: cleanList(c.out_of_scope), conditions: cleanList(c.conditions),
    calc: {...c.calc, one_time_catalog: c.calc.one_time_catalog.filter((r) => r.catalog_item_id), recurring_catalog: c.calc.recurring_catalog.filter((r) => r.catalog_item_id),
      one_time_lines: c.calc.one_time_lines.map((l) => ({...l, label: l.label.trim() || 'Item'})), recurring_lines: c.calc.recurring_lines.map((l) => ({...l, label: l.label.trim() || 'Item'}))}
  };
}

function TemplateButtons({kind, current, onLoad}: {kind: 'escopo' | 'fora_escopo' | 'condicoes'; current: () => unknown; onLoad: (b: unknown) => void}) {
  const {toast} = useToast();
  const list = useLoad(() => api.get<{id: string; name: string; kind: string; body: unknown}[]>('/pricing/templates'), []);
  const mine = (list.data ?? []).filter((t) => t.kind === kind);
  const label = kind === 'escopo' ? 'escopo' : kind === 'fora_escopo' ? 'fora do escopo' : 'condições';
  return (
    <>
      {mine.length > 0 && <Select label={`Carregar modelo de ${label}`} value="" placeholder="Selecionar…" options={mine.map((t) => ({value: t.id, label: t.name}))} onChange={(e) => { const t = mine.find((x) => x.id === e.target.value); if (t) onLoad(t.body); }} />}
      <Button variant="outline" size="sm" onClick={async () => { const name = window.prompt(`Nome do modelo de ${label}:`); if (!name) return; await api.post('/pricing/templates', {name, kind, body: current()}); toast({title: 'Modelo salvo', tone: 'success'}); list.reload(); }}>Salvar como modelo ({label})</Button>
    </>
  );
}

function ApprovalPanel({d, finance, sim, onDone}: {d: Detail; finance: boolean; sim: Computed | null; onDone: () => void}) {
  const {toast} = useToast();
  const nav = useNavigate();
  const p = d.proposal;
  const comp = d.version.status === 'emitida' ? d.computed : sim;
  const [opt, setOpt] = useState('');
  const [signed, setSigned] = useState('');
  const [entry, setEntry] = useState('');
  const [mo, setMo] = useState('');
  const [day, setDay] = useState('');
  const [create, setCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (p.status === 'aprovada') return (
    <Card title="Proposta aprovada"><Alert tone="success" title={`Versão ${p.approved_version} aprovada e preservada`}>Contrato gerado em rascunho. Confira os itens e ative para criar o cronograma financeiro no PDV.</Alert>
      {p.contract_id && <RLink to={`/contratos/${p.contract_id}`} className="ads-btn ads-btn--primary" style={{textDecoration: 'none', width: 'fit-content'}}>Abrir contrato</RLink>}</Card>);
  if (d.version.status !== 'emitida' || p.current_version !== d.version.version) return <Card title="Aprovação"><Alert tone="info" title="Emita a versão atual primeiro">Somente propostas emitidas podem ser aprovadas.</Alert></Card>;
  const has = {one: (comp?.totals.one_time_final_cents ?? 0) > 0, mo: (comp?.totals.monthly_final_cents ?? 0) > 0};
  return (
    <Card title="Aprovar e criar contrato">
      <p>Ao aprovar: a versão é preservada, o cliente é vinculado, o sistema é registrado e um <strong>contrato em rascunho</strong> é criado com os serviços contratados. As cobranças só nascem quando o contrato for ativado e confirmado.</p>
      <form className="dialog-body" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr(null);
        try {
          const r = await api.post<{contract_id: string}>(`/proposals/${p.id}/approve`, {confirm: true, option_id: opt, signed_at: signed, entry_due_date: entry || null, monthly_first_due_date: mo || null, due_day: day ? Number(day) : null, create_client: create});
          toast({title: 'Proposta aprovada — contrato criado', tone: 'success'}); onDone(); nav(`/contratos/${r.contract_id}`);
        } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
      }}>
        <div className="form-grid">
          <Select label="Opção de pagamento escolhida pelo cliente" required value={opt} placeholder="Selecione" options={(comp?.payments ?? []).map((x, i) => ({value: x.id, label: `Opção ${i + 1}: ${x.title}`}))} onChange={(e) => setOpt(e.target.value)} />
          <Input label="Data de aceite/assinatura" type="date" required value={signed} onChange={(e) => setSigned(e.target.value)} />
          {has.one && <Input label="Vencimento do valor inicial" type="date" required value={entry} onChange={(e) => setEntry(e.target.value)} />}
          {has.mo && <Input label="Primeiro vencimento da mensalidade" type="date" required value={mo} onChange={(e) => setMo(e.target.value)} />}
          {has.mo && <Input label="Dia fixo de vencimento (opcional)" type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} />}
        </div>
        {!p.client_id && <Checkbox label={`Criar o cliente “${p.client_snapshot?.name}” a partir dos dados da proposta`} checked={create} onChange={(e) => setCreate(e.target.checked)} />}
        <ErrorNote error={err} />
        {finance ? <div><Button type="submit" loading={busy} disabled={!opt || !signed || (!p.client_id && !create)}>Confirmar aprovação</Button></div> : <Alert tone="warning" title="Apenas financeiro/administrador aprova">Peça a um usuário com esse perfil.</Alert>}
      </form>
    </Card>
  );
}
