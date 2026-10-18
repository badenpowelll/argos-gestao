import {useMemo} from 'react';
import {Card} from './Layout';
import {cx} from './cx';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}
export function EmptyState({title, description, action}: EmptyStateProps) {
  return (
    <div className="ads-empty">
      <p className="ads-heading ads-heading--sm">{title}</p>
      {description && <p className="ads-text ads-text--muted">{description}</p>}
      {action}
    </div>
  );
}

export interface MetricCardProps {
  label: string;
  value: string;
  description?: string;
  /** Variação já formatada, ex.: "+12% vs. mês anterior". Inclua o sentido no texto, não só na cor. */
  delta?: string;
}
export function MetricCard({label, value, description, delta}: MetricCardProps) {
  return (
    <Card className="ads-metric">
      <p className="ads-text ads-text--muted ads-text--sm">{label}</p>
      <p className="ads-metric__value">{value}</p>
      {delta && <p className="ads-text ads-text--sm">{delta}</p>}
      {description && <p className="ads-text ads-text--muted ads-text--xs">{description}</p>}
    </Card>
  );
}

export type SortDirection = 'asc' | 'desc';
export interface SortState {
  key: string;
  direction: SortDirection;
}
export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  /** Valor usado na ordenação (padrão: row[key]). */
  sortValue?: (row: T) => string | number;
  sortable?: boolean;
}
export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  /** Legenda acessível obrigatória. */
  caption: string;
  getRowKey: (row: T, index: number) => string;
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  caption,
  getRowKey,
  sort,
  onSortChange,
  emptyTitle = 'Nenhum registro',
  emptyDescription,
  loading
}: DataTableProps<T>) {
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const value = (r: T) => col.sortValue?.(r) ?? ((r as Record<string, unknown>)[col.key] as string | number);
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * factor;
    });
  }, [rows, columns, sort]);

  return (
    <div className="ads-table-wrap" aria-busy={loading || undefined}>
      <table className="ads-table">
        <caption className="ads-sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const ariaSort = c.sortable
                ? active
                  ? sort?.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
                : undefined;
              return (
                <th key={c.key} scope="col" aria-sort={ariaSort}>
                  {c.sortable ? (
                    <button
                      type="button"
                      className={cx('ads-table__sort')}
                      onClick={() =>
                        onSortChange?.({key: c.key, direction: active && sort?.direction === 'asc' ? 'desc' : 'asc'})
                      }
                    >
                      {c.header}
                      <span aria-hidden="true">{active ? (sort?.direction === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={getRowKey(row, i)}>
              {columns.map((c) => (
                <td key={c.key}>{c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && sorted.length === 0 && <EmptyState title={emptyTitle} description={emptyDescription} />}
      {loading && (
        <p className="ads-text ads-text--muted ads-text--sm" role="status" style={{padding: 12}}>
          Carregando dados…
        </p>
      )}
    </div>
  );
}
