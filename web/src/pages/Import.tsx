import {useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Alert, Button, Card, Checkbox, Input, RadioGroup, Select, Textarea, useToast} from '../ds';
import {api} from '../api';
import {CLAUDE_JSON_PROMPT} from '../importPrompt';
import {brl, formatDocument, label} from '../format';
import {ErrorNote, MoneyInput, PageHeader} from '../ui';
import {emptyItem, itemPayload, type ItemForm} from './contractParts';

interface Field {key: string; label: string; value: string | number | boolean | null; confidence: number; status: 'ok' | 'baixa_confianca' | 'divergente' | 'ausente'; source: string | null; page: number | null}
interface XItem {kind: string; description: string; billing_type: string; amount_cents: number; quantity: number; installments: number | null; interval_months: number; confidence: number; status: Field['status']; source: string; due_date?: string | null}
interface Extraction {document_kind: string; fields: Field[]; items: XItem[]; issues: {level: 'erro' | 'aviso' | 'info'; message: string}[]; pages: number}
interface UploadResult {import: {id: string}; document: {filename: string}; extraction: Extraction; duplicate_of: string | null}
interface Match {id: string; name: string; document: string | null}

const KINDS = ['implementacao', 'desenvolvimento', 'licenca', 'mensalidade', 'hospedagem', 'dominio', 'treinamento', 'suporte', 'outro'];
const BILLING = ['unico', 'recorrente', 'parcelado', 'por_usuario', 'sob_demanda'];

function Steps({step}: {step: 1 | 2 | 3}) {
  const items = ['Carregar documento', 'Conferir dados', 'Confirmar cadastro'];
  return (
    <ol className="steps" aria-label="Etapas">
      {items.map((t, i) => <li key={t} className={step === i + 1 ? 'is-current' : step > i + 1 ? 'is-done' : ''} aria-current={step === i + 1 ? 'step' : undefined}><span>{i + 1}</span> {t}</li>)}
    </ol>
  );
}

/** Aviso discreto quando o dado não foi reconhecido com segurança. */
function Check({f}: {f?: Field}) {
  if (!f) return null;
  if (f.status === 'ausente') return <small className="muted">Não encontrado no documento — preencha se necessário.</small>;
  if (f.status === 'ok') return null;
  return <small style={{color: 'var(--ads-color-warning-fg)'}}>Conferir: {f.status === 'divergente' ? 'valores divergentes' : 'baixa confiança'}{f.source ? ` — “${f.source.slice(0, 90)}”` : ''}</small>;
}

export function ImportPage() {
  const nav = useNavigate();
  const {toast} = useToast();
  const [up, setUp] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  // dados editáveis (preenchidos pelo reconhecimento)
  const [c, setC] = useState({name: '', document: '', kind: 'empresa_privada', email: '', whatsapp: '', address: '', responsible: ''});
  const [k, setK] = useState({nature: 'proposta', project: '', object: '', scope: '', deadline: '', hosting: '', domain: '', clientPaid: '', discounts: '', options: '', payment: '', dueDay: '', term: '', index: '', fine: '', interest: '', signed: '', start: '', end: '', process: '', commitment: ''});
  const [items, setItems] = useState<{form: ItemForm; x: XItem | null}[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [link, setLink] = useState<'new' | string>('new');
  const [prompt, setPrompt] = useState(false);

  const F = (key: string) => up?.extraction.fields.find((f) => f.key === key);
  const step: 1 | 2 = up ? 2 : 1;

  async function onFile(file: File) {
    setUploading(true); setError(null); setUp(null); setReviewed(false);
    try {
      const r = await api.upload<UploadResult>('/imports', file);
      setUp(r);
      const get = (key: string) => r.extraction.fields.find((f) => f.key === key)?.value ?? null;
      const s = (key: string) => (get(key) === null ? '' : String(get(key)));
      const doc = s('client_document');
      setC({name: s('client_name'), document: doc, kind: s('client_kind') || (doc.length === 11 ? 'pessoa_fisica' : get('is_public_flow') ? 'orgao_publico' : 'empresa_privada'),
        email: s('client_email'), whatsapp: s('client_whatsapp') || s('client_phone'), address: s('client_address'), responsible: s('client_responsible')});
      const d = (key: string) => s(key);
      const term = Number(get('term_months') ?? 0);
      let end = s('end_date');
      if (!end && s('start_date') && term) { const dt = new Date(`${s('start_date')}T00:00:00Z`); dt.setUTCMonth(dt.getUTCMonth() + term); dt.setUTCDate(dt.getUTCDate() - 1); end = dt.toISOString().slice(0, 10); }
      setK({nature: r.extraction.document_kind === 'contrato' ? 'contrato' : r.extraction.document_kind === 'aditivo' ? 'aditivo' : 'proposta',
        project: d('project_name'), object: d('object'), scope: d('scope'), deadline: d('deadline'), hosting: d('hosting'), domain: d('domain_email'), clientPaid: d('client_paid_costs'),
        discounts: d('discounts'), options: d('payment_options'), payment: d('payment_terms'), dueDay: d('due_day'), term: d('term_months'), index: d('adjustment_index'),
        fine: d('fine_percent'), interest: d('interest_monthly_percent'), signed: d('signed_at'), start: d('start_date'), end, process: d('administrative_process'), commitment: d('commitment_number')});
      setItems(r.extraction.items.map((x) => ({x, form: emptyItem({kind: x.kind, description: x.description, billing_type: x.billing_type, unit: x.amount_cents, quantity: String(x.quantity), installments: x.installments ? String(x.installments) : '', interval_months: String(x.interval_months), first_due_date: x.due_date ?? ''})})));
      setLink('new');
    } catch (err) { setError((err as Error).message); } finally { setUploading(false); }
  }

  // cliente já cadastrado? (por CPF/CNPJ; sem documento, pelo nome)
  useEffect(() => {
    if (!up) return;
    const d = c.document.replace(/\D/g, '');
    const q = d.length >= 11 ? d : c.name.trim().length >= 4 ? c.name.trim().slice(0, 30) : '';
    if (!q) { setMatches([]); return; }
    const t = window.setTimeout(() => api.get<Match[]>(`/clients?q=${encodeURIComponent(q)}`).then((m) => { setMatches(m.slice(0, 5)); if (m[0] && d.length >= 11) setLink(m[0].id); }).catch(() => setMatches([])), 350);
    return () => window.clearTimeout(t);
  }, [up, c.document, c.name]);

  const total = useMemo(() => items.reduce((s, i) => s + (i.form.billing_type === 'sob_demanda' ? 0 : Math.round((i.form.unit ?? 0) * (Number(i.form.quantity) || 1))), 0), [items]);
  const oneTime = items.filter((i) => ['unico', 'parcelado'].includes(i.form.billing_type)).reduce((s, i) => s + (i.form.unit ?? 0), 0);
  const monthly = items.filter((i) => ['recorrente', 'por_usuario'].includes(i.form.billing_type) && i.form.interval_months === '1').reduce((s, i) => s + Math.round((i.form.unit ?? 0) * (Number(i.form.quantity) || 1)), 0);

  async function confirm() {
    if (!up) return;
    setBusy(true); setError(null);
    const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
    const notes = [
      k.scope && `ESCOPO: ${k.scope}`, k.deadline && `PRAZO: ${k.deadline}`, k.hosting && `HOSPEDAGEM E BANCO: ${k.hosting}`, k.domain && `DOMÍNIO E E-MAIL: ${k.domain}`,
      k.clientPaid && `CUSTOS PAGOS DIRETAMENTE PELO CLIENTE (não cobrados pela Argos): ${k.clientPaid}`, k.discounts && `DESCONTOS: ${k.discounts}`, k.options && `OPÇÕES DE PAGAMENTO: ${k.options}`,
      `ORIGEM: documento importado "${up.document.filename}".`
    ].filter(Boolean).join('\n');
    try {
      const body = {
        reviewed: true,
        ...(link !== 'new' ? {client_id: link} : {}),
        client: {kind: c.kind, name: c.name, document: c.document || null, email: c.email || null, whatsapp: c.whatsapp || null, street: c.address || null, responsible_name: c.responsible || null, status: 'ativo'},
        system: k.project.trim() ? {name: k.project.trim(), description: k.object || null, status: 'em_desenvolvimento', operational_cost_cents: 0} : null,
        contract: {kind: k.nature, object: k.object || null, signed_at: k.signed || null, start_date: k.start || null, end_date: k.end || null, due_day: num(k.dueDay), adjustment_index: k.index || null,
          payment_terms: k.payment || null, fine_percent: num(k.fine) ?? 0, interest_monthly_percent: num(k.interest) ?? 0, is_public_flow: c.kind === 'orgao_publico' || !!k.process || !!k.commitment,
          administrative_process: k.process || null, commitment_number: k.commitment || null, notes},
        items: items.map((i) => itemPayload(i.form))
      };
      const r = await api.post<{contract: {id: string}; created_client: boolean}>(`/imports/${up.import.id}/confirm`, body);
      toast({title: r.created_client ? 'Cliente cadastrado e documento registrado' : 'Documento registrado no cliente existente', description: k.nature === 'proposta' ? 'Quando o cliente aprovar, clique em “Aprovar e gerar cobranças”.' : 'Confira e ative para gerar as cobranças.', tone: 'success'});
      nav(`/contratos/${r.contract.id}`);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  const ex = up?.extraction;
  const recognized = ex ? ex.fields.filter((f) => f.status !== 'ausente').length + ex.items.length : 0;
  const canConfirm = reviewed && c.name.trim().length > 1 && items.length > 0 && items.every((i) => i.form.description.trim() && (i.form.unit ?? 0) > 0 || i.form.billing_type === 'sob_demanda');

  return (
    <div className="stack-lg">
      <PageHeader title="Importar proposta" subtitle="Envie o documento feito no Claude. O sistema reconhece os dados e você só confere." />
      <Steps step={up ? 2 : 1} />
      {step === 1 && (<>
        <Card>
          <div className="dropzone">
            <label className="ads-btn ads-btn--primary dropzone__btn">
              {uploading ? 'Lendo documento…' : 'Escolher arquivo'}
              <input type="file" accept=".pdf,.docx,.txt,.json,application/pdf,application/json" className="ads-sr-only" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
            </label>
            <p className="muted" style={{margin: 0}}>PDF, Word, TXT ou <strong>JSON do Claude</strong> (o mais preciso). O original é guardado com segurança.</p>
          </div>
          <ErrorNote error={error} />
        </Card>
        <details open={prompt} onToggle={(e) => setPrompt((e.target as HTMLDetailsElement).open)}>
          <summary>Como gerar o JSON no Claude (recomendado)</summary>
          <p className="muted">Ao terminar a precificação, cole esta instrução no Claude e carregue aqui o arquivo que ele gerar. O sistema lê cada campo sem adivinhar.</p>
          <Textarea label="Instrução para o Claude" rows={10} value={CLAUDE_JSON_PROMPT} readOnly onChange={() => undefined} />
          <Button variant="outline" size="sm" onClick={() => void navigator.clipboard?.writeText(CLAUDE_JSON_PROMPT).then(() => toast({title: 'Instrução copiada'}))}>Copiar instrução</Button>
        </details>
      </>)}

      {step === 2 && ex && up && (<>
        <Alert tone="info" title={`${up.document.filename}`}>Reconhecidos {recognized} dados · tipo <strong>{ex.document_kind === 'indefinido' ? 'não identificado' : label(ex.document_kind)}</strong>. Revise abaixo; o que não foi encontrado fica em branco. <Button variant="ghost" size="sm" onClick={() => setUp(null)}>Trocar arquivo</Button></Alert>
        {up.duplicate_of && <Alert tone="warning" title="Arquivo já enviado antes">Confira se este documento já está cadastrado para não duplicar.</Alert>}
        {ex.issues.filter((i) => i.level !== 'info').map((i, n) => <Alert key={n} tone={i.level === 'erro' ? 'danger' : 'warning'} title={i.level === 'erro' ? 'Atenção' : 'Conferir'}>{i.message}</Alert>)}

        <Card title="Cliente">
          {matches.length > 0 && (
            <RadioGroup legend="Já existe cliente parecido" name="link" value={link} onChange={setLink}
              options={[...matches.map((m) => ({value: m.id, label: `Usar o cadastro de ${m.name}${m.document ? ` (${formatDocument(m.document)})` : ''} — só completa campos em branco`})), {value: 'new', label: 'Cadastrar como novo cliente'}]} />)}
          <div className="form-grid">
            <div><Input label="Nome / razão social" required value={c.name} onChange={(e) => setC({...c, name: e.target.value})} /><Check f={F('client_name')} /></div>
            <div><Input label="CPF/CNPJ" value={formatDocument(c.document)} onChange={(e) => setC({...c, document: e.target.value})} inputMode="numeric" /><Check f={F('client_document')} /></div>
            <Select label="Tipo" value={c.kind} onChange={(e) => setC({...c, kind: e.target.value})} options={[{value: 'pessoa_fisica', label: 'Pessoa física'}, {value: 'empresa_privada', label: 'Empresa privada'}, {value: 'orgao_publico', label: 'Órgão público'}]} />
            <Input label="WhatsApp" value={c.whatsapp} onChange={(e) => setC({...c, whatsapp: e.target.value})} />
            <Input label="E-mail" type="email" value={c.email} onChange={(e) => setC({...c, email: e.target.value})} />
            <Input label="Responsável" value={c.responsible} onChange={(e) => setC({...c, responsible: e.target.value})} />
            <div className="span-2"><Input label="Endereço" value={c.address} onChange={(e) => setC({...c, address: e.target.value})} /><Check f={F('client_address')} /></div>
          </div>
        </Card>

        <Card title="Serviço">
          <div className="form-grid">
            <Select label="Este documento é" value={k.nature} onChange={(e) => setK({...k, nature: e.target.value})} options={[{value: 'proposta', label: 'Proposta (ainda não aprovada)'}, {value: 'contrato', label: 'Contrato assinado'}, {value: 'aditivo', label: 'Aditivo'}]} />
            <div><Input label="Sistema / projeto" value={k.project} onChange={(e) => setK({...k, project: e.target.value})} /><Check f={F('project_name')} /></div>
            <div className="span-2"><Textarea label="Objeto" rows={2} value={k.object} onChange={(e) => setK({...k, object: e.target.value})} /><Check f={F('object')} /></div>
            <div className="span-2"><Textarea label="Escopo — módulos e funcionalidades" rows={3} value={k.scope} onChange={(e) => setK({...k, scope: e.target.value})} /></div>
            <Input label="Prazo de implantação" value={k.deadline} onChange={(e) => setK({...k, deadline: e.target.value})} />
            <Input label="Hospedagem e banco de dados" value={k.hosting} onChange={(e) => setK({...k, hosting: e.target.value})} />
            <Input label="Domínio e e-mail" value={k.domain} onChange={(e) => setK({...k, domain: e.target.value})} />
          </div>
        </Card>

        <Card title="Valores">
          <div className="totals">
            <div><span>Implantação / valor inicial</span><strong>{brl(oneTime)}</strong></div>
            <div><span>Mensalidade</span><strong>{brl(monthly)}</strong></div>
            <div><span>Total cobrado pela Argos (1ª competência)</span><strong>{brl(total)}</strong></div>
          </div>
          {items.map((it, i) => {
            const set = (p: Partial<ItemForm>) => setItems(items.map((x, j) => (j === i ? {...x, form: {...x.form, ...p}} : x)));
            return (
              <div key={i} className="item-card">
                <div className="form-grid">
                  <Select label="Tipo" value={it.form.kind} onChange={(e) => set({kind: e.target.value})} options={KINDS.map((x) => ({value: x, label: label(x)}))} />
                  <Input label="Descrição" value={it.form.description} onChange={(e) => set({description: e.target.value})} />
                  <Select label="Cobrança" value={it.form.billing_type} onChange={(e) => set({billing_type: e.target.value})} options={BILLING.map((x) => ({value: x, label: label(x)}))} />
                  <MoneyInput label={it.form.billing_type === 'por_usuario' ? 'Valor por usuário' : 'Valor'} value={it.form.unit} onChange={(v) => set({unit: v})} />
                  {it.form.billing_type === 'por_usuario' && <Input label="Usuários" type="number" min={1} value={it.form.quantity} onChange={(e) => set({quantity: e.target.value})} />}
                  {it.form.billing_type === 'parcelado' && <Input label="Parcelas" type="number" min={1} value={it.form.installments} onChange={(e) => set({installments: e.target.value})} />}
                  {k.nature !== 'proposta' && it.form.billing_type !== 'sob_demanda' && <Input label="1º vencimento" type="date" value={it.form.first_due_date} onChange={(e) => set({first_due_date: e.target.value})} />}
                </div>
                {it.x && it.x.status !== 'ok' && <small style={{color: 'var(--ads-color-warning-fg)'}}>Conferir — origem: “{it.x.source.slice(0, 120)}”</small>}
                <div><Button variant="ghost" size="sm" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remover</Button></div>
              </div>);
          })}
          <div><Button variant="outline" onClick={() => setItems([...items, {x: null, form: emptyItem({kind: 'outro', billing_type: 'unico'})}])}>+ Adicionar valor</Button></div>
          <Textarea label="Custos pagos diretamente pelo cliente (não cobrados pela Argos)" rows={2} value={k.clientPaid} onChange={(e) => setK({...k, clientPaid: e.target.value})} hint="Ex.: hospedagem, domínio. Fica registrado, sem gerar cobrança." />
        </Card>

        <Card title="Condições">
          <div className="form-grid">
            <Input label="Dia de vencimento" type="number" min={1} max={31} value={k.dueDay} onChange={(e) => setK({...k, dueDay: e.target.value})} />
            <Input label="Vigência (meses)" type="number" min={1} value={k.term} onChange={(e) => setK({...k, term: e.target.value})} />
            <Input label="Reajuste" value={k.index} onChange={(e) => setK({...k, index: e.target.value})} placeholder="IPCA, IGP-M…" />
            <div className="span-2"><Textarea label="Forma de pagamento" rows={2} value={k.payment} onChange={(e) => setK({...k, payment: e.target.value})} /><Check f={F('payment_terms')} /></div>
            <div className="span-2"><Input label="Descontos" value={k.discounts} onChange={(e) => setK({...k, discounts: e.target.value})} /></div>
          </div>
          <details><summary>Mais condições (multa, juros, datas, setor público)</summary>
            <div className="form-grid" style={{marginTop: 8}}>
              <Input label="Multa por atraso (%)" value={k.fine} onChange={(e) => setK({...k, fine: e.target.value})} />
              <Input label="Juros ao mês (%)" value={k.interest} onChange={(e) => setK({...k, interest: e.target.value})} />
              <Input label="Data de assinatura" type="date" value={k.signed} onChange={(e) => setK({...k, signed: e.target.value})} />
              <Input label="Início da vigência" type="date" value={k.start} onChange={(e) => setK({...k, start: e.target.value})} />
              <Input label="Fim da vigência" type="date" value={k.end} onChange={(e) => setK({...k, end: e.target.value})} />
              <Input label="Processo administrativo" value={k.process} onChange={(e) => setK({...k, process: e.target.value})} />
              <Input label="Nº do empenho" value={k.commitment} onChange={(e) => setK({...k, commitment: e.target.value})} />
            </div>
          </details>
        </Card>

        <Card title="Confirmar cadastro">
          <div className="dialog-body">
            <p style={{margin: 0}}>{link === 'new' ? 'Será criado o cliente' : 'Será usado o cliente existente'} e registrado {k.nature === 'proposta' ? 'a proposta (sem gerar cobranças)' : k.nature === 'contrato' ? 'o contrato em rascunho' : 'o aditivo'}. Nada é cobrado antes da aprovação.</p>
            <Checkbox label="Conferi os dados com o documento original." checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
            <ErrorNote error={error} />
            <div className="dialog-actions">
              <Button variant="outline" onClick={async () => { await api.post(`/imports/${up.import.id}/discard`); setUp(null); toast({title: 'Importação descartada'}); }}>Descartar</Button>
              <Button loading={busy} disabled={!canConfirm} onClick={confirm}>Confirmar cadastro</Button>
            </div>
          </div>
        </Card>
      </>)}
    </div>
  );
}
