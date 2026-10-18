import {useState} from 'react';
import {DataTable, Input, Select} from '../ds';
import {api, qs} from '../api';
import {brl, dateBR} from '../format';
import {ErrorNote, PageHeader, useLoad} from '../ui';

interface Report {title: string; columns: {key: string; label: string; type: 'text' | 'money' | 'date' | 'int' | 'percent'}[]; rows: Record<string, unknown>[]; period: {from: string; to: string}}

const REPORTS: [string, string, boolean][] = [
  ['recebimentos', 'Recebimentos', true], ['inadimplencia', 'Inadimplência', false], ['receita_por_sistema', 'Receita por sistema', true],
  ['contratos', 'Contratos', false], ['clientes', 'Clientes', false], ['custos_infraestrutura', 'Custos de infraestrutura', false], ['lucratividade', 'Lucratividade por sistema', true]
];

export function ReportsPage() {
  const now = new Date(Date.now() - 3 * 3600_000);
  const [name, setName] = useState('recebimentos');
  const [from, setFrom] = useState(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10));
  const usesPeriod = REPORTS.find((r) => r[0] === name)?.[2];
  const {data, error, loading} = useLoad(() => api.get<Report>(`/reports/${name}${qs({from, to})}`), [name, from, to]);
  const fmt = (t: string, v: unknown) => (v === null || v === undefined ? '—' : t === 'money' ? brl(Number(v)) : t === 'date' ? dateBR(String(v)) : t === 'percent' ? `${v}%` : String(v));
  const link = (format: 'csv' | 'pdf') => `/api/reports/${name}${qs({from, to, format})}`;
  const totals = data ? data.columns.filter((c) => c.type === 'money').map((c) => [c.label, data.rows.reduce((s, r) => s + Number(r[c.key] ?? 0), 0)] as const) : [];
  return (
    <div className="stack-lg">
      <PageHeader title="Relatórios" subtitle="Exportação em CSV (Excel) e PDF" actions={<>
        <a className="ads-btn ads-btn--outline" style={{textDecoration: 'none'}} href={link('csv')}>Exportar CSV</a>
        <a className="ads-btn ads-btn--secondary" style={{textDecoration: 'none'}} href={link('pdf')}>Exportar PDF</a></>} />
      <div className="filters">
        <Select label="Relatório" value={name} onChange={(e) => setName(e.target.value)} options={REPORTS.map(([v, l]) => ({value: v, label: l}))} />
        {usesPeriod && (<><Input label="De" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><Input label="Até" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></>)}
      </div>
      <ErrorNote error={error} />
      {data && (<>
        <DataTable<Record<string, unknown>> caption={data.title} loading={loading} rows={data.rows} getRowKey={(_, i) => String(i)} emptyTitle="Sem dados para este relatório/período"
          columns={data.columns.map((c) => ({key: c.key, header: c.label, render: (r: Record<string, unknown>) => fmt(c.type, r[c.key])}))} />
        {totals.length > 0 && data.rows.length > 0 && <p><strong>Totais:</strong> {totals.map(([l, v]) => `${l}: ${brl(v)}`).join(' · ')}</p>}
      </>)}
    </div>
  );
}
