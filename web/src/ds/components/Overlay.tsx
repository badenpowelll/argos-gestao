import {useEffect, useId, useRef} from 'react';
import {createPortal} from 'react-dom';
import {IconButton} from './Button';
import {cx} from './cx';

const FOCUSABLE = 'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Fechar ao clicar no fundo (padrão: true). */
  closeOnOverlayClick?: boolean;
}

/** Contenção e restauração de foco, Escape, bloqueio de rolagem e portal em document.body.
 *  `onClose` é lido via ref: um callback inline não reinicia o efeito nem rouba o foco. */
function useOverlay(open: boolean, onClose: () => void, ref: React.RefObject<HTMLDivElement | null>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const scrollLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key !== 'Tab') return;
      const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => !el.hasAttribute('disabled')
      );
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) {
        e.preventDefault();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = scrollLock;
      previous?.focus();
    };
  }, [open, ref]);
}

function OverlaySurface({
  open,
  onClose,
  title,
  children,
  closeOnOverlayClick = true,
  side
}: DialogProps & {side?: 'start' | 'end'}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlay(open, onClose, ref);
  if (!open) return null;
  return createPortal(
    <div
      role="presentation"
      className={cx('ads-overlay', side && `ads-overlay--drawer-${side}`)}
      onMouseDown={(e) => closeOnOverlayClick && e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx('ads-dialog', side && 'ads-dialog--drawer')}
      >
        <div className="ads-dialog__header">
          <h2 id={titleId} className="ads-heading ads-heading--md">
            {title}
          </h2>
          <IconButton variant="outline" label="Fechar diálogo" icon="✕" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function Dialog(props: DialogProps) {
  return <OverlaySurface {...props} />;
}
export function Drawer({side = 'end', ...props}: DialogProps & {side?: 'start' | 'end'}) {
  return <OverlaySurface {...props} side={side} />;
}
/** @deprecated Use `Dialog`. Mantido para compatibilidade com a v1. */
export const Modal = Dialog;
