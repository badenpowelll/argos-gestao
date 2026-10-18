import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Alert, Badge, Button, Card, Checkbox, Input, RadioGroup, Select, Text, useToast} from '../ds';
import {api} from '../api';
import {formatDocument, label} from '../format';
import {ErrorNote, PageHeader} from '../ui';
import {emptyClient, ClientFields, clientPayload, type ClientForm} from './Clients';
import {ContractFields, ItemFields, contractPayload, emptyContract, emptyItem, itemPayload, type ContractForm, type ItemForm} from './contractParts';

interface Field {key: string; label: string; value: string | number | boolean | null; confidence: number; status: 'ok' | 'baixa_confianca' | 'divergente' | 'ausente'; source: string | null; page: number | null; alternatives?: (string | number)[]}
interface XItem {kind: string; description: string; billing_type: string; amount_cents: number; quantity: number; installments: number | null; interval_months: number; confidence: number; status: Field['status']; source: string; page: number | null}
interface Extraction {document_kind: string; fields: Field[]; items: XItem[]; issues: {level: 'erro' | 'aviso' | 'info'; message: string}[]; text_length: number; pages: number}
interface UploadResult {import: {id: string}; document: {filename: string; sha256: string}; extraction: Extraction; duplicate_of: string | null}

const STATUS_TONE = {ok: 'success', baixa_confianca: 'warning', divergente: 'danger', ausente: 'danger'} as const;
const STATUS_TEXT = {ok: 'Encontrado', baixa_confianca: 'Baixa confiança', divergente: 'Divergente', ausente: 'Ausente'} as const;

function Origin({f}: {f: Pick<Field, 'status' | 'confidence' | 'source' | 'page'>}) {
  return (
    <div>
      <Badge tone={STATUS_TONE[f.status]}>{STATUS_TEXT[f.status]}{f.status !== 'ausente' && <span className="conf"> · {Math.round(f.confidence * 100)}%</span>}</Badge>
      {f.source ? <p className="src">Origem{f.page ? ` (pág. ${f.page})` : ''}: “{f.source}”</p> : f.status === 'ausente' ? <p className="src">Não encontrado no documento — preencha manualmente se aplicável.</p> : null}
    </div>
  );
}

export function ImportPage() {
  const nav = useNavigate();
  const {toast} = useToast();
  const [up, setUp] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientMode, setClientMode] = useState<'new' | 'existing'>('new');
  const [client, setClient] = useState<ClientForm>(emptyClient());
  const [existingId, setExistingId] = useState('');
  const [matches, setMatches] = useState<{id: string; name: string; document: string | null}[]>([]);
  const [contract, setContract] = useState<ContractForm>(emptyContract());
  const [items, setItems] = useState<{form: ItemForm; x: XItem | null}[]>([]);
  const [systemName, setSystemName] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [derivedEnd, setDerivedEnd] = useState(false);

  async function onFile(file: File) {
    setUploading(true); setError(null); setUp(null);
    try {
      const r = await api.upload<UploadResult>('/imports', file);
      setUp(r);
      const get = (k: string) => r.extraction.fields.find((f) => f.key === k)?.value ?? null;
      const str = (k: string) => (get(k) === null ? '' : String(get(k)));
      const doc = str('client_document');
      setClient(emptyClient({name: str('client_name'), document: doc, kind: doc.length === 11 ? 'pessoa_fisica' : get('is_public_flow') ? 'orgao_publico' : 'empresa_privada'}));
      const start = str('start_date');
      const term = Number(get('term_months') ?? 0);
      let end = '';
      if (start && term) { const d = new Date(`${start}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + term); d.setUTCDate(d.getUTCDate() - 1); end = d.toISOString().slice(0, 10); }
      setDerivedEnd(!!end);
      setContract(emptyContract({
        kind: r.extraction.document_kind === 'proposta' ? 'proposta' : r.extraction.document_kind === 'aditivo' ? 'aditivo' : 'contrato',
        object: str('object'), signed_at: str('signed_at'), start_date: start, end_date: end, due_day: str('due_day'), fine_percent: str('fine_percent') || '0',
        interest_monthly_percent: str('interest_monthly_percent') || '0', adjustment_index: str('adjustment_index'), payment_terms: str('payment_terms'),
        is_public_flow: get('is_public_flow') === true, administrative_process: str('administrative_process'), commitment_number: str('commitment_number'),
        notes: get('discounts') ? `Descontos mencionados no documento (aplicar manualmente nos itens): ${str('discounts')}` : ''
      }));
      setItems(r.extraction.items.map((x) => ({x, form: emptyItem({kind: x.kind, description: x.description, billing_type: x.billing_type, unit: x.amount_cents, quantity: String(x.quantity), installments: x.installments ? String(x.installments) : '', interval_months: String(x.interval_months)})})));
      setClientMode('new'); setReviewed(false); setSystemName('');
    } catch (err) { setError((err as Error).message); } finally { setUploading(false); }
  }

  useEffect(() => {
    const d = client.document.replace(/\D/g, '');
    if (!up || d.length < 11) { setMatches([]); return; }
    api.get<{id: string; name: string; document: string | null}[]>(`/clients?q=${d}`).then((m) => { setMatches(m); if (m[0]) { setClientMode('existing'); setExistingId(m[0].id); } }).catch(() => setMatches([]));
  }, [up, client.document]);

  async function confirm() {
    if (!up) return;
    setBusy(true); setError(null);
    try {
      const {contract: created} = await api.post<{contract: {id: string}}>(`/imports/${up.import.id}/confirm`, {
        reviewed: true,
        ...(clientMode === 'existing' ? {client_id: existingId} : {client: clientPayload(client)}),
        system: systemName.trim() ? {name: systemName.trim(), status: 'em_desenvolvimento', operational_cost_cents: 0} : null,
        contract: contractPayload(contract), items: items.map((i) => itemPayload(i.form))
      });
      toast({title: 'Contrato cadastrado', description: contract.kind === 'proposta' ? 'Proposta salva (não gera cobrança).' : 'Em rascunho: confira e ative para gerar cobranças.', tone: 'success'});
      nav(`/contratos/${created.id}`);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  const ex = up?.extraction;
  const canConfirm = reviewed && items.length > 0 && (clientMode === 'existing' ? !!existingId : client.name.trim().length > 1);
  return (
    <div className="stack-lg">
      <PageHeader title="Importar contrato" subtitle="Envie o PDF ou DOCX, revise os dados extraídos e confirme. Nada é cadastrado antes da sua confirmação." />
      <Card>
        <div className="dialog-body">
          <label className="ads-btn ads-btn--primary" style={{width: 'fit-content', cursor: 'pointer'}}>
            {uploading ? 'Lendo documento…' : 'Selecionar arquivo (PDF, DOCX ou TXT)'}
            <input type="file" accept=".pdf,.docx,.txt" className="ads-sr-only" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
          </label>
          <Text muted size="sm">O arquivo original é guardado em armazenamento privado. PDFs digitalizados (imagem) não têm texto: nesse caso preencha os dados manualmente.</Text>
          <ErrorNote error={error} />
        </div>
      </Card>

      {up && ex && (<>
        <Alert tone="info" title={`Arquivo: ${up.document.filename}`}>Tipo identificado: <strong>{ex.document_kind === 'indefinido' ? 'não identificado' : label(ex.document_kind)}</strong> · {ex.pages} página(s). Original preservado.</Alert>
        {ex.issues.map((i, k) => <Alert key={k} tone={i.level === 'erro' ? 'danger' : i.level === 'aviso' ? 'warning' : 'info'} title={i.level === 'erro' ? 'Atenção' : i.level === 'aviso' ? 'Verificar' : 'Informação'}>{i.message}</Alert>)}

        <Card title="1. Cliente">
          {matches.length > 0 && (
            <RadioGroup legend="Já existe cliente com este documento" name="cmode" value={clientMode} onChange={(v) => setClientMode(v as 'new' | 'existing')}
              options={[{value: 'existing', label: `Vincular a: ${matches[0]?.name} (${formatDocument(matches[0]?.document)})`}, {value: 'new', label: 'Cadastrar como novo cliente'}]} />)}
          {clientMode === 'existing' && matches.length > 1 && <Select label="Cliente" value={existingId} onChange={(e) => setExistingId(e.target.value)} options={matches.map((m) => ({value: m.id, label: m.name}))} />}
          {clientMode === 'new' && (<>
            <div className="review-grid">
              {['client_name', 'client_document'].map((k) => { const f = ex.fields.find((x) => x.key === k); return f ? <div key={k} className={`review-field ${f.status === 'ausente' ? 'is-missing' : f.status !== 'ok' ? 'is-warn' : ''}`}><strong>{f.label}</strong><Origin f={f} />{f.alternatives?.length ? <p className="src">Outros documentos encontrados: {f.alternatives.map((a) => formatDocument(String(a))).join(', ')}</p> : null}</div> : null; })}
            </div>
            <ClientFields value={client} onChange={setClient} />
          </>)}
        </Card>

        <Card title="2. Contrato">
          <div className="review-grid">
            {ex.fields.filter((f) => !['client_name', 'client_document'].includes(f.key) && f.key !== 'is_public_flow').map((f) => (
              <div key={f.key} className={`review-field ${f.status === 'ausente' ? 'is-missing' : f.status !== 'ok' ? 'is-warn' : ''}`}>
                <strong>{f.label}</strong>{f.value !== null && <span>{String(f.value)}</span>}<Origin f={f} />
              </div>))}
          </div>
          {derivedEnd && <Alert tone="info" title="Fim da vigência sugerido">Calculado a partir do início e do prazo em meses. Confira.</Alert>}
          <Input label="Nome do software/sistema (opcional)" value={systemName} onChange={(e) => setSystemName(e.target.value)} hint="Se informado, cria o sistema vinculado ao cliente e ao contrato." />
          <ContractFields value={contract} onChange={setContract} />
        </Card>

        <Card title="3. Itens financeiros">
          {items.length === 0 && <Alert tone="warning" title="Nenhum item identificado">Adicione os itens manualmente, conforme o documento.</Alert>}
          {items.map((it, i) => (
            <div key={i} className="stack-lg">
              {it.x && <div className="review-field"><strong>Trecho de origem</strong><Origin f={it.x} /></div>}
              <ItemFields value={it.form} onChange={(v) => setItems(items.map((x, j) => (j === i ? {...x, form: v} : x)))} onRemove={() => setItems(items.filter((_, j) => j !== i))} />
            </div>))}
          <div><Button variant="outline" onClick={() => setItems([...items, {x: null, form: emptyItem()}])}>Adicionar item</Button></div>
        </Card>

        <Card title="4. Confirmar">
          <div className="dialog-body">
            <Checkbox label="Revisei todos os dados com o documento original e confirmo o cadastro." checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
            <ErrorNote error={error} />
            <div className="dialog-actions">
              <Button variant="outline" onClick={async () => { await api.post(`/imports/${up.import.id}/discard`); setUp(null); toast({title: 'Importação descartada'}); }}>Descartar</Button>
              <Button loading={busy} disabled={!canConfirm} onClick={confirm}>Confirmar e cadastrar</Button>
            </div>
          </div>
        </Card>
      </>)}
    </div>
  );
}
