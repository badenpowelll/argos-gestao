import {useRef} from 'react';
import {Button} from './Button';
import {cx} from './cx';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}
export function Breadcrumb({items}: {items: BreadcrumbItem[]}) {
  return (
    <nav aria-label="Trilha de navegação" className="ads-breadcrumb">
      <ol>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`}>
              {last || !item.href ? (
                <span aria-current={last ? 'page' : undefined}>{item.label}</span>
              ) : (
                <a className="ads-link" href={item.href}>
                  {item.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Páginas exibidas ao redor da atual. */
  siblings?: number;
}
type PageToken = number | 'gap-start' | 'gap-end';

export function getPageTokens(page: number, pageCount: number, siblings: number): PageToken[] {
  const first = 1;
  const start = Math.max(page - siblings, first + 1);
  const end = Math.min(page + siblings, pageCount - 1);
  const tokens: PageToken[] = [first];
  if (start > first + 1) tokens.push('gap-start');
  for (let p = start; p <= end; p++) tokens.push(p);
  if (end < pageCount - 1) tokens.push('gap-end');
  if (pageCount > first) tokens.push(pageCount);
  return tokens;
}

export function Pagination({page, pageCount, onPageChange, siblings = 1}: PaginationProps) {
  if (pageCount < 1) return null;
  return (
    <nav aria-label="Paginação" className="ads-pagination">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Anterior
      </Button>
      {getPageTokens(page, pageCount, siblings).map((t) =>
        typeof t === 'number' ? (
          <Button
            key={t}
            variant={t === page ? 'secondary' : 'outline'}
            size="sm"
            aria-label={`Página ${t}`}
            aria-current={t === page ? 'page' : undefined}
            onClick={() => onPageChange(t)}
          >
            {t}
          </Button>
        ) : (
          <span key={t} aria-hidden="true">
            …
          </span>
        )
      )}
      <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
        Próxima
      </Button>
    </nav>
  );
}

export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const tabPanelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

export interface TabsProps {
  items: {id: string; label: string}[];
  value: string;
  onChange: (id: string) => void;
  idPrefix?: string;
  label?: string;
}
/** ARIA Tabs: setas, Home/End, tabindex móvel. Renderize o painel com <TabPanel>. */
export function Tabs({items, value, onChange, idPrefix = 'tabs', label = 'Seções'}: TabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (e: React.KeyboardEvent, index: number) => {
    const last = items.length - 1;
    const targets: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last
    };
    const next = targets[e.key];
    const target = next === undefined ? undefined : items[next];
    if (!target) return;
    e.preventDefault();
    onChange(target.id);
    refs.current[target.id]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="ads-tabs">
      {items.map((item, i) => {
        const selected = value === item.id;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[item.id] = el;
            }}
            type="button"
            role="tab"
            id={tabId(idPrefix, item.id)}
            aria-selected={selected}
            aria-controls={tabPanelId(idPrefix, item.id)}
            tabIndex={selected ? 0 : -1}
            className={cx('ads-btn', selected ? 'ads-btn--secondary' : 'ads-btn--outline')}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => move(e, i)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idPrefix = 'tabs',
  value,
  children
}: {
  idPrefix?: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div role="tabpanel" id={tabPanelId(idPrefix, value)} aria-labelledby={tabId(idPrefix, value)} tabIndex={0}>
      {children}
    </div>
  );
}
