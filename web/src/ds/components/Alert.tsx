import {Button} from './Button';
import {cx} from './cx';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';
export interface AlertProps {
  tone?: AlertTone;
  title: string;
  children?: React.ReactNode;
  /** Se informado, exibe botão de dispensar. */
  onDismiss?: () => void;
  className?: string;
}

/** `danger` usa role="alert" (assertivo); demais usam role="status" (educado). */
export function Alert({tone = 'info', title, children, onDismiss, className}: AlertProps) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('ads-alert', `ads-alert--${tone}`, className)}>
      <div className="ads-alert__body">
        <strong>{title}</strong>
        {children && <div className="ads-text ads-text--muted ads-text--sm">{children}</div>}
      </div>
      {onDismiss && (
        <Button variant="ghost" size="sm" aria-label={`Dispensar: ${title}`} onClick={onDismiss}>
          ✕
        </Button>
      )}
    </div>
  );
}
