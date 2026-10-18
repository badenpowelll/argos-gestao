import {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, Button, Dialog, FormField, Heading, Spinner, StatusBadge, Text, Textarea, type Tone} from './ds';
import {brl, fromCents, label, toCents} from './format';

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    fn()
      .then((d) => id === seq.current && (setData(d), setError(null)))
      .catch((e: Error) => id === seq.current && setError(e.message))
      .finally(() => id === seq.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return {data, error, loading, reload: run, setData};
}

export function PageHeader({title, subtitle, actions}: {title: string; subtitle?: string; actions?: React.ReactNode}) {
  return (
    <header className="page-header">
      <div>
        <Heading level={1} size="lg" headline>{title}</Heading>
        {subtitle && <Text muted size="sm">{subtitle}</Text>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

const TONES: Record<string, Tone> = {
  paga: 'success', ativo: 'success', confirmado: 'success', em_producao: 'success',
  pendente: 'info', proposta: 'info', contrato: 'info', em_desenvolvimento: 'info', prospecto: 'info',
  parcial: 'warning', suspenso: 'warning', manutencao: 'warning', rascunho: 'neutral',
  vencida: 'danger',
  cancelada: 'neutral', cancelado: 'neutral', estornado: 'neutral', inativo: 'neutral', encerrado: 'neutral', descontinuado: 'neutral', aditivo: 'info'
};
export const Status = ({value}: {value: string}) => <StatusBadge tone={TONES[value] ?? 'neutral'}>{label(value)}</StatusBadge>;

export function ErrorNote({error}: {error: string | null}) {
  return error ? <Alert tone="danger" title="Não foi possível concluir">{error}</Alert> : null;
}
export const Loading = () => <div className="center-pad"><Spinner label="Carregando" /></div>;

export function Money({cents, strong}: {cents: number | null | undefined; strong?: boolean}) {
  return <span className={strong ? 'money money--strong' : 'money'}>{brl(cents)}</span>;
}

/** Campo de valor em reais ("1.499,80") que entrega centavos inteiros. */
export function MoneyInput({
  label: lbl, value, onChange, required, hint, error
}: {label: string; value: number | null; onChange: (c: number | null) => void; required?: boolean; hint?: string; error?: string}) {
  const [text, setText] = useState(value === null ? '' : fromCents(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value === null ? '' : fromCents(value));
    }
  }, [value]);
  const invalid = text.trim() !== '' && toCents(text) === null;
  return (
    <FormField label={lbl} required={required} hint={hint} error={error ?? (invalid ? 'Valor inválido (use 1.499,80)' : undefined)}>
      {(a11y) => (
        <input
          {...a11y} className="ads-input" inputMode="decimal" autoComplete="off" value={text} placeholder="0,00"
          onChange={(e) => {
            setText(e.target.value);
            const c = e.target.value.trim() === '' ? null : toCents(e.target.value);
            last.current = c;
            onChange(c);
          }}
        />
      )}
    </FormField>
  );
}

export function ConfirmDialog({
  open, title, children, confirmLabel = 'Confirmar', danger, reasonLabel, onConfirm, onClose
}: {
  open: boolean; title: string; children?: React.ReactNode; confirmLabel?: string; danger?: boolean;
  reasonLabel?: string; onConfirm: (reason: string) => Promise<void>; onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setReason(''); setError(null); } }, [open]);
  return (
    <Dialog open={open} onClose={busy ? () => undefined : onClose} title={title}>
      <div className="dialog-body">
        {children}
        {reasonLabel && <Textarea label={reasonLabel} required value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />}
        <ErrorNote error={error} />
        <div className="dialog-actions">
          <Button variant="outline" onClick={onClose} disabled={busy}>Voltar</Button>
          <Button
            variant={danger ? 'danger' : 'primary'} loading={busy}
            disabled={!!reasonLabel && reason.trim().length < 5}
            onClick={async () => {
              setBusy(true); setError(null);
              try { await onConfirm(reason.trim()); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
            }}
          >{confirmLabel}</Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Barras simples (SVG) — cobrado x recebido por mês. Acessível via tabela alternativa oculta. */
export function BarChart({series}: {series: {ym: string; billed: number; received: number}[]}) {
  const max = Math.max(1, ...series.flatMap((s) => [s.billed, s.received]));
  const W = 720, H = 200, pad = 24, bw = (W - pad * 2) / series.length;
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H + 28}`} role="img" aria-label="Valores cobrados e recebidos por mês, últimos 12 meses" preserveAspectRatio="xMidYMid meet">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad} x2={W - pad} y1={H - f * (H - 16)} y2={H - f * (H - 16)} className="chart__grid" />
        ))}
        {series.map((s, i) => {
          const x = pad + i * bw;
          const h1 = (s.billed / max) * (H - 16), h2 = (s.received / max) * (H - 16);
          return (
            <g key={s.ym}>
              <rect x={x + bw * 0.12} y={H - h1} width={bw * 0.36} height={h1} className="chart__billed"><title>{`${s.ym} cobrado ${brl(s.billed)}`}</title></rect>
              <rect x={x + bw * 0.5} y={H - h2} width={bw * 0.36} height={h2} className="chart__received"><title>{`${s.ym} recebido ${brl(s.received)}`}</title></rect>
              <text x={x + bw / 2} y={H + 16} textAnchor="middle" className="chart__label">{s.ym.slice(5)}/{s.ym.slice(2, 4)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="chart__legend">
        <span><i className="dot dot--billed" /> Cobrado (vencimentos)</span>
        <span><i className="dot dot--received" /> Recebido</span>
      </figcaption>
      <table className="ads-sr-only">
        <caption>Cobrado e recebido por mês</caption>
        <thead><tr><th>Mês</th><th>Cobrado</th><th>Recebido</th></tr></thead>
        <tbody>{series.map((s) => <tr key={s.ym}><td>{s.ym}</td><td>{brl(s.billed)}</td><td>{brl(s.received)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

export const Field = ({children}: {children: React.ReactNode}) => <div className="form-grid">{children}</div>;
