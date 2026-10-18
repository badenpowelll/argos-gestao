import {cx} from './cx';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export function Spinner({label = 'Carregando', className}: {label?: string; className?: string}) {
  return (
    <span role="status" className={cx('ads-spinner-wrap', className)}>
      <span className="ads-spinner" aria-hidden="true" />
      <span className="ads-sr-only">{label}</span>
    </span>
  );
}

export function Skeleton({
  width,
  height,
  className
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
}) {
  return <span aria-hidden="true" className={cx('ads-skeleton', className)} style={{width, height}} />;
}

export interface ProgressProps {
  value: number;
  max?: number;
  label: string;
  showValue?: boolean;
}

export function Progress({value, max = 100, label, showValue = true}: ProgressProps) {
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const percent = Math.round((clamped / safeMax) * 100);
  return (
    <div className="ads-progress">
      <div className="ads-text ads-text--sm" style={{display: 'flex', justifyContent: 'space-between'}}>
        <span>{label}</span>
        {showValue && <span>{percent}%</span>}
      </div>
      <div
        className="ads-progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
      >
        <div className="ads-progress__bar" style={{width: `${percent}%`}} />
      </div>
    </div>
  );
}

export function Badge({
  tone = 'info',
  children,
  className
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cx('ads-badge', `ads-badge--${tone}`, className)}>{children}</span>;
}

const STATUS_GLYPH: Record<Tone, string> = {success: '✓', warning: '!', danger: '✕', info: 'i', neutral: '•'};
const STATUS_WORD: Record<Tone, string> = {
  success: 'Sucesso',
  warning: 'Atenção',
  danger: 'Erro',
  info: 'Informação',
  neutral: 'Status'
};

/** Badge de status que não depende só de cor: ícone + texto oculto de contexto. */
export function StatusBadge({tone, children}: {tone: Tone; children: React.ReactNode}) {
  return (
    <Badge tone={tone}>
      <span aria-hidden="true">{STATUS_GLYPH[tone]}</span>
      <span className="ads-sr-only">{STATUS_WORD[tone]}: </span>
      {children}
    </Badge>
  );
}

export function Avatar({name, src}: {name: string; src?: string}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span className="ads-avatar" role="img" aria-label={name}>
      {src ? <img src={src} alt="" /> : <span aria-hidden="true">{initials}</span>}
    </span>
  );
}
