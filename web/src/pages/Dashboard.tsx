import {useState} from 'react';
import {Link as RLink} from 'react-router-dom';
import {Alert, Card, Input, MetricCard, Select} from '../ds';
import {api, qs} from '../api';
import {brl, dateBR, label} from '../format';
import {BarChart, ErrorNote, Loading, Money, PageHeader, useLoad} from '../ui';

interface Dash {
  period: {from: string; to: string; months: number; today: string};
  counts: {clients_total: number; clients_active: number; contracts_active: number; proposals_open: number; systems_live: number};
  mrr_cents: number; arr_cents: number; received_cents: number; implementation_received_cents: number;
  pending_cents: number; pending_count: number; overdue_cents: number; overdue_count: number; overdue_clients: number;
  delinquency_rate: number; expenses_cents: number; infra_cost_cents: number; result_cents: number;
  series: {ym: string; billed: number; received: number}[];
  top_overdue: {id: string; name: string; balance_cents: number; charges: number; oldest_due: string}[];
  upcoming: {id: string; description: string; due_date: string; client_name: string; balance_cents: number}[];
  contracts_ending: {id: string; number: string; end_date: string; client_name: string}[];
  by_method: {method: string; v: number}[];
  notes: {infra: string};
}

function range(preset: string): {from: string; to: string} {
  const now = new Date(Date.now() - 3 * 3600_000);
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === 'mes_anterior') return {from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0)))};
  if (preset === 'trimestre') return {from: iso(new Date(Date.UTC(y, m - 2, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0)))};
  if (preset === 'ano') return {from: `${y}-01-01`, to: `${y}-12-31`};
  return {from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0)))};
}

export function DashboardPage() {
  const [preset, setPreset] = useState('mes');
  const [custom, setCustom] = useState<{from: string; to: string}>({from: '', to: ''});
  const r = preset === 'custom' ? custom : range(preset);
  const {data, error, loading} = useLoad(() => api.get<Dash>(`/dashboard${qs(r)}`), [r.from, r.to]);

  return (
    <div className="stack-lg">
      <PageHeader title="Painel" subtitle={data ? `Período: ${dateBR(data.period.from)} a ${dateBR(data.period.to)}` : undefined} />
      <div className="filters">
        <Select label="Período" value={preset} onChange={(e) => setPreset(e.target.value)} options={[
          {value: 'mes', label: 'Mês atual'}, {value: 'mes_anterior', label: 'Mês anterior'}, {value: 'trimestre', label: 'Últimos 3 meses'},
          {value: 'ano', label: 'Ano atual'}, {value: 'custom', label: 'Personalizado'}]} />
        {preset === 'custom' && (<>
          <Input label="De" type="date" value={custom.from} onChange={(e) => setCustom({...custom, from: e.target.value})} />
          <Input label="Até" type="date" value={custom.to} onChange={(e) => setCustom({...custom, to: e.target.value})} />
        </>)}
      </div>
      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : data && (<>
        {data.overdue_count > 0 && (
          <Alert tone="danger" title={`${data.overdue_count} cobrança(s) vencida(s) — ${brl(data.overdue_cents)}`}>
            {data.overdue_clients} cliente(s) em atraso. <RLink to="/cobrancas?view=vencidas">Ver vencidas</RLink>
          </Alert>
        )}
        <div className="kpis">
          <MetricCard label="Clientes" value={String(data.counts.clients_total)} description={`${data.counts.clients_active} ativos`} />
          <MetricCard label="Contratos ativos" value={String(data.counts.contracts_active)} description={`${data.counts.proposals_open} proposta(s) em aberto (não geram cobrança)`} />
          <MetricCard label="Receita recorrente mensal (MRR)" value={brl(data.mrr_cents)} description={`Anualizada: ${brl(data.arr_cents)}`} />
          <MetricCard label="Recebido no período" value={brl(data.received_cents)} description={`Implementação: ${brl(data.implementation_received_cents)}`} />
          <MetricCard label="A receber (não vencido)" value={brl(data.pending_cents)} description={`${data.pending_count} cobrança(s)`} />
          <MetricCard label="Em atraso" value={brl(data.overdue_cents)} description={`Inadimplência: ${String(data.delinquency_rate).replace('.', ',')}% do devido até hoje`} />
          <MetricCard label="Despesas + infraestrutura" value={brl(data.expenses_cents + data.infra_cost_cents)} description={`Despesas ${brl(data.expenses_cents)} · infra ${brl(data.infra_cost_cents)}`} />
          <MetricCard label="Resultado do período" value={brl(data.result_cents)} description="Recebido − despesas − infraestrutura" />
        </div>

        <div className="two-col">
          <Card title="Cobrado × recebido — últimos 12 meses"><BarChart series={data.series} /></Card>
          <Card title="Recebido por forma de pagamento">
            {data.by_method.length === 0 ? <p className="muted">Nenhum recebimento no período.</p> : (
              <ul className="list">{data.by_method.map((m) => <li key={m.method}><span>{label(m.method)}</span><Money cents={m.v} strong /></li>)}</ul>
            )}
          </Card>
        </div>

        <div className="two-col">
          <Card title="Maiores saldos em atraso">
            {data.top_overdue.length === 0 ? <p className="muted">Sem inadimplência. ✓</p> : (
              <ul className="list">{data.top_overdue.map((c) => (
                <li key={c.id}><RLink to={`/clientes/${c.id}`}>{c.name}</RLink><span><Money cents={c.balance_cents} strong /> <small className="muted">· desde {dateBR(c.oldest_due)}</small></span></li>))}
              </ul>)}
          </Card>
          <Card title="Vencem nos próximos 7 dias">
            {data.upcoming.length === 0 ? <p className="muted">Nada vencendo.</p> : (
              <ul className="list">{data.upcoming.map((c) => <li key={c.id}><span>{dateBR(c.due_date)} · {c.client_name}<br /><small className="muted">{c.description}</small></span><Money cents={c.balance_cents} /></li>)}</ul>)}
          </Card>
        </div>
        <Card title="Contratos terminando em 60 dias">
          {data.contracts_ending.length === 0 ? <p className="muted">Nenhum contrato próximo do fim da vigência.</p> : (
            <ul className="list">{data.contracts_ending.map((c) => <li key={c.id}><RLink to={`/contratos/${c.id}`}>{c.number} · {c.client_name}</RLink><span>{dateBR(c.end_date)}</span></li>)}</ul>)}
        </Card>
        <p className="muted" style={{fontSize: '.8rem'}}>{data.notes.infra}</p>
      </>)}
    </div>
  );
}
