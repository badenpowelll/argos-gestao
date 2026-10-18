import {useState} from 'react';
import {Alert, Badge, Button, Card, Input} from '../ds';
import {api} from '../api';
import {ErrorNote} from '../ui';

export interface SiteAnalysis {
  final_url: string; status: number; title: string | null; requires_login: boolean; spa: boolean; limitations: string[]; evidence: {source: string; text: string}[];
  infra: {hosting: string | null; cdn: string | null; hostname: string; https: boolean; br_domain: boolean};
  suggestion: {summary: string; groups: {title: string; items: string[]}[]; schedule: {hosting: string | null; database: string | null; domain: string | null}};
}

/** Lê o link do sistema de teste e SUGERE escopo e infraestrutura. Nada é aplicado sem o clique do usuário. */
export function SiteAnalyzer({url, onUrl, disabled, onApplyScope, onApplySchedule}: {
  url: string; onUrl: (u: string) => void; disabled?: boolean;
  onApplyScope: (summary: string, groups: {title: string; items: string[]}[]) => void;
  onApplySchedule: (s: {hosting: string | null; database: string | null; domain: string | null}) => void;
}) {
  const [a, setA] = useState<SiteAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  return (
    <Card title="Analisar o sistema pelo link (automático)">
      <p className="muted" style={{fontSize: '.85rem', margin: 0}}>Cole o link do sistema de teste. O sistema lê a página e o código publicado e <strong>sugere</strong> telas, módulos e infraestrutura. O que não for possível detectar fica para preenchimento manual.</p>
      <div className="form-grid">
        <Input label="Link do sistema de teste" type="url" value={url} disabled={disabled} onChange={(e) => onUrl(e.target.value)} placeholder="https://sistema.exemplo.com.br" />
        <div style={{display: 'flex', alignItems: 'end'}}>
          <Button loading={busy} disabled={disabled || !/^https?:\/\//i.test(url)} onClick={async () => {
            setBusy(true); setErr(null); setA(null); setApplied(null);
            try { setA(await api.post<SiteAnalysis>('/pricing/analyze-url', {url})); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
          }}>Analisar link</Button>
        </div>
      </div>
      <ErrorNote error={err} />
      {a && (<div className="stack-lg">
        <div className="chips">
          <Badge tone={a.status < 400 ? 'success' : 'danger'}>HTTP {a.status}</Badge>
          {a.infra.hosting && <Badge tone="info">Hospedagem: {a.infra.hosting}</Badge>}
          {a.infra.cdn && <Badge tone="info">CDN: {a.infra.cdn}</Badge>}
          {a.requires_login && <Badge tone="warning">Exige login</Badge>}
          {a.spa && <Badge tone="neutral">Aplicação de página única</Badge>}
        </div>
        {a.suggestion.summary && <p><strong>Resumo sugerido:</strong> {a.suggestion.summary}</p>}
        {a.suggestion.groups.map((g) => (
          <div key={g.title} className="review-field"><strong>{g.title}</strong><span>{g.items.join(' · ')}</span></div>))}
        <div className="review-field"><strong>Infraestrutura sugerida</strong>
          <span>Hospedagem: {a.suggestion.schedule.hosting ?? '— (preencher manualmente)'}</span>
          <span>Banco de dados: {a.suggestion.schedule.database ?? '— (não detectável pelo link: preencher manualmente)'}</span>
          <span>Domínio: {a.suggestion.schedule.domain ?? '—'}</span></div>
        <details><summary>Evidências usadas ({a.evidence.length})</summary><ul className="list">{a.evidence.map((e, i) => <li key={i}><span><strong>{e.source}:</strong> {e.text}</span></li>)}</ul></details>
        {a.limitations.map((l, i) => <Alert key={i} tone="warning" title="Limitação">{l}</Alert>)}
        <div className="dialog-actions" style={{justifyContent: 'flex-start'}}>
          <Button disabled={disabled || (!a.suggestion.groups.length && !a.suggestion.summary)} onClick={() => { onApplyScope(a.suggestion.summary, a.suggestion.groups); setApplied('Escopo atualizado (revise e edite).'); }}>Aplicar ao escopo</Button>
          <Button variant="outline" disabled={disabled} onClick={() => { onApplySchedule(a.suggestion.schedule); setApplied('Prazo e infraestrutura preenchidos onde estavam vazios (revise).'); }}>Aplicar à infraestrutura</Button>
        </div>
        {applied && <Alert tone="success" title="Aplicado">{applied} Lembre-se de salvar o rascunho.</Alert>}
      </div>)}
    </Card>
  );
}
