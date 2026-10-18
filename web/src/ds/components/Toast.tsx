import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {Alert} from './Alert';
import type {AlertTone} from './Alert';

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: AlertTone;
  /** ms até fechar. 0 = permanece até ser dispensado. Padrão: 6000 (0 para `danger`). */
  duration?: number;
}
interface ToastItem extends ToastOptions {
  id: number;
}
interface ToastApi {
  toast: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>.');
  return ctx;
}

function ToastView({item, onDismiss}: {item: ToastItem; onDismiss: (id: number) => void}) {
  const duration = item.duration ?? (item.tone === 'danger' ? 0 : 6000);
  useEffect(() => {
    if (!duration) return;
    const timer = window.setTimeout(() => onDismiss(item.id), duration);
    return () => window.clearTimeout(timer);
  }, [duration, item.id, onDismiss]);
  return (
    <Alert tone={item.tone ?? 'info'} title={item.title} onDismiss={() => onDismiss(item.id)}>
      {item.description}
    </Alert>
  );
}

export function ToastProvider({children}: {children: React.ReactNode}) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const toast = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    setItems((list) => [...list, {...options, id}]);
    return id;
  }, []);
  const api = useMemo(() => ({toast, dismiss}), [toast, dismiss]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ads-toast-region" role="region" aria-label="Notificações">
        {items.map((item) => (
          <ToastView key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
