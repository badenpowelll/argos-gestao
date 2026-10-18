import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import {Router} from 'express';
import PDFDocument from 'pdfkit';
import type {Db} from '../db.js';
import {HttpError, asyncHandler} from '../http.js';
import {formatBRL} from '../lib/money.js';
import {formatDocument} from '../lib/documents.js';
import {toCsv} from '../lib/sql.js';
import {audit} from '../audit.js';
import {actorOf} from '../auth.js';
import {monthsBetween, resolvePeriod} from './dashboard.js';

type ColType = 'text' | 'money' | 'date' | 'int' | 'percent';
interface Report {
  title: string;
  columns: {key: string; label: string; type: ColType}[];
  rows: Record<string, unknown>[];
}

const paidDay = "(p.paid_at at time zone 'America/Sao_Paulo')::date";
const bal = '(c.amount_cents - c.discount_cents + c.interest_cents + c.fine_cents - c.paid_cents)';
const tot = '(c.amount_cents - c.discount_cents + c.interest_cents + c.fine_cents)';

export function reportRoutes(db: Db) {
  const builders: Record<string, (p: {from: string; to: string; today: string}) => Promise<Report>> = {
    recebimentos: async ({from, to}) => ({
      title: 'Relatório de recebimentos',
      columns: [
        {key: 'paid_on', label: 'Data', type: 'date'}, {key: 'client_name', label: 'Cliente', type: 'text'},
        {key: 'description', label: 'Cobrança', type: 'text'}, {key: 'method', label: 'Forma', type: 'text'},
        {key: 'amount_cents', label: 'Valor', type: 'money'}, {key: 'reference', label: 'Referência', type: 'text'},
        {key: 'operator_name', label: 'Operador', type: 'text'}, {key: 'status', label: 'Situação', type: 'text'}
      ],
      rows: (await db.query(
        `select ${paidDay} as paid_on, cl.name as client_name, c.description, p.method, p.amount_cents, p.reference, p.operator_name, p.status
           from payments p join charges c on c.id = p.charge_id join clients cl on cl.id = c.client_id
          where ${paidDay} between $1 and $2 order by p.paid_at`, [from, to])).rows
    }),
    inadimplencia: async ({today}) => ({
      title: 'Relatório de inadimplência',
      columns: [
        {key: 'client_name', label: 'Cliente', type: 'text'}, {key: 'contract_number', label: 'Contrato', type: 'text'},
        {key: 'description', label: 'Cobrança', type: 'text'}, {key: 'due_date', label: 'Vencimento', type: 'date'},
        {key: 'days_late', label: 'Dias em atraso', type: 'int'}, {key: 'balance_cents', label: 'Saldo', type: 'money'}
      ],
      rows: (await db.query(
        `select cl.name as client_name, ct.number as contract_number, c.description, c.due_date, ($1::date - c.due_date)::int as days_late, ${bal}::bigint as balance_cents
           from charges c join clients cl on cl.id = c.client_id left join contracts ct on ct.id = c.contract_id
          where c.status in ('pendente','parcial') and c.due_date < $1 order by c.due_date`, [today])).rows
    }),
    receita_por_sistema: async ({from, to}) => ({
      title: 'Receita por sistema',
      columns: [
        {key: 'system_name', label: 'Sistema', type: 'text'}, {key: 'client_name', label: 'Cliente', type: 'text'},
        {key: 'billed_cents', label: 'Cobrado no período', type: 'money'}, {key: 'received_cents', label: 'Recebido no período', type: 'money'}
      ],
      rows: (await db.query(
        `select coalesce(s.name,'(sem sistema)') as system_name, cl.name as client_name,
                coalesce((select sum(${tot}) from charges c where c.system_id is not distinct from s.id and c.client_id = cl.id and c.status <> 'cancelada' and c.due_date between $1 and $2),0)::bigint as billed_cents,
                coalesce((select sum(p.amount_cents) from payments p join charges c on c.id = p.charge_id where c.system_id is not distinct from s.id and c.client_id = cl.id and p.status='confirmado' and ${paidDay} between $1 and $2),0)::bigint as received_cents
           from clients cl left join systems s on s.client_id = cl.id
          where exists (select 1 from charges c where c.client_id = cl.id and c.system_id is not distinct from s.id)
          order by 1`, [from, to])).rows
    }),
    contratos: async () => ({
      title: 'Relatório de contratos',
      columns: [
        {key: 'number', label: 'Número', type: 'text'}, {key: 'client_name', label: 'Cliente', type: 'text'}, {key: 'kind', label: 'Tipo', type: 'text'},
        {key: 'status', label: 'Situação', type: 'text'}, {key: 'start_date', label: 'Início', type: 'date'}, {key: 'end_date', label: 'Fim', type: 'date'},
        {key: 'monthly_cents', label: 'Recorrência mensal', type: 'money'}
      ],
      rows: (await db.query(
        `select c.number, cl.name as client_name, c.kind, c.status, c.start_date, c.end_date,
                (select coalesce(round(sum((i.unit_amount_cents*i.quantity - i.discount_cents)/i.interval_months)),0)::bigint from contract_items i where i.contract_id = c.id and i.active and i.billing_type in ('recorrente','por_usuario')) as monthly_cents
           from contracts c join clients cl on cl.id = c.client_id order by c.created_at desc`)).rows
    }),
    clientes: async ({today}) => ({
      title: 'Relatório de clientes',
      columns: [
        {key: 'name', label: 'Cliente', type: 'text'}, {key: 'document', label: 'CPF/CNPJ', type: 'text'}, {key: 'kind', label: 'Tipo', type: 'text'},
        {key: 'status', label: 'Situação', type: 'text'}, {key: 'contracts', label: 'Contratos ativos', type: 'int'},
        {key: 'open_cents', label: 'Em aberto', type: 'money'}, {key: 'overdue_cents', label: 'Vencido', type: 'money'}
      ],
      rows: ((await db.query(
        `select cl.name, cl.document, cl.kind, cl.status,
                (select count(*)::int from contracts k where k.client_id = cl.id and k.status='ativo') as contracts,
                (select coalesce(sum(${bal}),0)::bigint from charges c where c.client_id = cl.id and c.status in ('pendente','parcial')) as open_cents,
                (select coalesce(sum(${bal}),0)::bigint from charges c where c.client_id = cl.id and c.status in ('pendente','parcial') and c.due_date < $1) as overdue_cents
           from clients cl order by lower(cl.name)`, [today])).rows as Record<string, unknown>[]).map((r) => ({...r, document: formatDocument(r.document as string)}))
    }),
    custos_infraestrutura: async () => ({
      title: 'Custos de infraestrutura',
      columns: [
        {key: 'name', label: 'Sistema', type: 'text'}, {key: 'client_name', label: 'Cliente', type: 'text'}, {key: 'infrastructure', label: 'Infraestrutura', type: 'text'},
        {key: 'domain', label: 'Domínio', type: 'text'}, {key: 'status', label: 'Situação', type: 'text'}, {key: 'operational_cost_cents', label: 'Custo mensal', type: 'money'}
      ],
      rows: (await db.query('select s.name, c.name as client_name, s.infrastructure, s.domain, s.status, s.operational_cost_cents from systems s join clients c on c.id = s.client_id order by lower(s.name)')).rows
    }),
    lucratividade: async ({from, to}) => {
      const months = monthsBetween(from, to);
      const rows = (await db.query(
        `select s.name as system_name, cl.name as client_name,
                coalesce((select sum(p.amount_cents) from payments p join charges c on c.id = p.charge_id where c.system_id = s.id and p.status='confirmado' and ${paidDay} between $1 and $2),0)::bigint as received_cents,
                coalesce((select sum(e.amount_cents) from expenses e where e.system_id = s.id and e.competence between $1 and $2),0)::bigint as expenses_cents,
                (case when s.status in ('em_producao','manutencao') then s.operational_cost_cents * $3 else 0 end)::bigint as infra_cents
           from systems s join clients cl on cl.id = s.client_id order by lower(s.name)`, [from, to, months])).rows as Record<string, number | string>[];
      return {
        title: 'Lucratividade por sistema',
        columns: [
          {key: 'system_name', label: 'Sistema', type: 'text'}, {key: 'client_name', label: 'Cliente', type: 'text'}, {key: 'received_cents', label: 'Recebido', type: 'money'},
          {key: 'expenses_cents', label: 'Despesas', type: 'money'}, {key: 'infra_cents', label: 'Infra (mensal × meses)', type: 'money'},
          {key: 'result_cents', label: 'Resultado', type: 'money'}, {key: 'margin', label: 'Margem %', type: 'percent'}
        ],
        rows: rows.map((r) => {
          const result = (r.received_cents as number) - (r.expenses_cents as number) - (r.infra_cents as number);
          return {...r, result_cents: result, margin: r.received_cents ? Math.round((result / (r.received_cents as number)) * 1000) / 10 : null};
        })
      };
    }
  };

  const r = Router();
  r.get('/:name', asyncHandler(async (req, res) => {
    const build = builders[req.params.name as string];
    if (!build) throw new HttpError(404, 'Relatório inexistente');
    const period = resolvePeriod(req.query);
    const rep = await build(period);
    const format = typeof req.query.format === 'string' ? req.query.format : 'json';
    const display = (type: ColType, v: unknown): string => {
      if (v === null || v === undefined) return '';
      if (type === 'money') return formatBRL(Number(v));
      if (type === 'date') return String(v).slice(0, 10).split('-').reverse().join('/');
      if (type === 'percent') return `${v}%`;
      return String(v);
    };
    if (format === 'csv') {
      await audit(db, actorOf(req), 'report.export', 'report', req.params.name as string, {format});
      const rows = rep.rows.map((row) => Object.fromEntries(rep.columns.map((c) => [c.key, c.type === 'money' ? (Number(row[c.key] ?? 0) / 100).toFixed(2).replace('.', ',') : c.type === 'date' ? display('date', row[c.key]) : row[c.key]])));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="argos-${req.params.name}.csv"`);
      res.send(toCsv(rep.columns, rows));
      return;
    }
    if (format === 'pdf') {
      await audit(db, actorOf(req), 'report.export', 'report', req.params.name as string, {format});
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="argos-${req.params.name}.pdf"`);
      renderPdf(res, rep, period, display, actorOf(req).name);
      return;
    }
    res.json({...rep, period: {from: period.from, to: period.to}});
  }));
  return r;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const LOGO = path.resolve(here, '..', '..', 'assets', 'argos-logo.png');

function renderPdf(
  out: NodeJS.WritableStream, rep: Report, period: {from: string; to: string}, display: (t: ColType, v: unknown) => string, user: string
) {
  const doc = new PDFDocument({size: 'A4', layout: 'landscape', margin: 36, info: {Title: rep.title, Author: 'Argos Soluções'}});
  doc.pipe(out);
  const NAVY = '#000F37';
  const W = doc.page.width - 72;
  if (fs.existsSync(LOGO)) doc.image(LOGO, 36, 28, {height: 46});
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(16).text(rep.title.toUpperCase(), 110, 34, {align: 'left'});
  doc.font('Helvetica').fontSize(9).fillColor('#48566f')
    .text(`Período: ${display('date', period.from)} a ${display('date', period.to)}  •  Emitido por ${user} em ${new Date().toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`, 110, 56, {align: 'left'});
  let y = 92;
  const colW = W / rep.columns.length;
  const header = () => {
    doc.rect(36, y, W, 20).fill(NAVY);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
    rep.columns.forEach((c, i) => doc.text(c.label, 40 + i * colW, y + 6, {width: colW - 8, lineBreak: false, ellipsis: true, align: 'left'}));
    y += 22;
  };
  header();
  doc.font('Helvetica').fontSize(8);
  const totals: Record<string, number> = {};
  rep.rows.forEach((row, idx) => {
    if (y > doc.page.height - 60) { doc.addPage(); y = 36; header(); doc.font('Helvetica').fontSize(8); }
    if (idx % 2 === 0) doc.rect(36, y - 2, W, 16).fill('#EEF1F6');
    doc.fillColor(NAVY);
    rep.columns.forEach((c, i) => {
      doc.text(display(c.type, row[c.key]), 40 + i * colW, y + 2, {width: colW - 8, lineBreak: false, ellipsis: true, align: 'left'});
      if (c.type === 'money') totals[c.key] = (totals[c.key] ?? 0) + Number(row[c.key] ?? 0);
    });
    y += 16;
  });
  if (!rep.rows.length) doc.fillColor('#48566f').text('Nenhum registro no período.', 40, y + 4);
  else if (Object.keys(totals).length) {
    y += 6;
    doc.font('Helvetica-Bold').fillColor(NAVY);
    rep.columns.forEach((c, i) => {
      if (i === 0) doc.text('TOTAL', 40, y, {width: colW - 8, lineBreak: false, align: 'left'});
      else if (c.key in totals) doc.text(formatBRL(totals[c.key] as number), 40 + i * colW, y, {width: colW - 8, lineBreak: false, align: 'left'});
    });
  }
  doc.end();
}
