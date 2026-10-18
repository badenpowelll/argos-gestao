import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type {ProposalContent} from './content.js';
import type {ComputedProposal} from './compute.js';
import type {CostCategory} from './engine.js';
import type {PaymentResult} from './payment.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const LOGO = path.resolve(here, '..', '..', 'assets', 'argos-logo.png');
const NAVY = '#000F37';
const ORANGE = '#FF5D00';
const GRAY = '#D1D2D2';
const TINT_NAVY = '#DDE2EC';
const TINT_ORANGE = '#FFE7D6';
const MUTED = '#48566F';

export interface ProposalDocData {
  number: string;
  draft: boolean;
  project_name: string;
  commercial_owner: string | null;
  issued_at: string | null; // yyyy-mm-dd
  valid_until: string | null;
  version: number;
  client: {name: string; document: string | null; address: string | null};
  company: {
    legal_name: string; trade_name: string; cnpj: string | null; address: string | null; phone: string | null; email: string | null; site: string | null;
    bank_name: string | null; bank_agency: string | null; bank_account: string | null; pix_key_cnpj: string | null; pix_key_random: string | null;
    google_review_url: string | null; responsible_name: string | null; responsible_role: string | null; city: string;
  };
  content: ProposalContent;
  computed: ComputedProposal;
  pix_payload: string | null;
}

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}).replace(/ /g, ' ').replace('-R$', '- R$');
const date = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const clean = (s: string) => s.replace(/−/g, '-').replace(/≥/g, '>=').replace(/→/g, '->').replace(/[•]/g, '•').replace(/ /g, ' ');
const cnpjFmt = (d: string | null) => {
  const s = (d ?? '').replace(/\D/g, '');
  return s.length === 14 ? s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : s.length === 11 ? s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (d ?? '—');
};

export function effectiveVisibility(v: ProposalContent['visibility']) {
  const a = v.internal_disclosure_authorized;
  return {
    one_time_breakdown: v.show_one_time_breakdown,
    monthly_breakdown: v.show_monthly_breakdown && a,
    infra_table: v.show_infra_table && a,
    support_table: v.show_support_table && a,
    margin: v.show_margin && a,
    taxes: v.show_taxes && a,
    tools_allocation: v.show_tools_allocation && a
  };
}

const GROUPS: {label: string; cats: CostCategory[]}[] = [
  {label: 'Desenvolvimento do sistema', cats: ['desenvolvimento']},
  {label: 'Testes', cats: ['testes']},
  {label: 'Publicação', cats: ['publicacao']},
  {label: 'Implantação e implementação', cats: ['implementacao']},
  {label: 'Treinamento da equipe', cats: ['treinamento']},
  {label: 'Ferramentas e infraestrutura', cats: ['ferramentas', 'infraestrutura', 'backup', 'monitoramento']},
  {label: 'Domínio e e-mail', cats: ['dominio_email']},
  {label: 'Registros e demais serviços', cats: ['registro', 'outros', 'suporte', 'manutencao']}
];

/** Distribui `total` proporcionalmente (maior resto) para que a tabela do cliente some exatamente o preço. */
export function allocateToPrice(values: number[], total: number): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v * total) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => ({i, frac: x - Math.floor(x)})).sort((a, b) => b.frac - a.frac);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[(order[k] as {i: number}).i]! += 1;
  return out;
}

export function clientOneTimeRows(d: ProposalDocData): {label: string; amount: number; emphasis?: 'subtotal' | 'total'}[] {
  const res = d.computed.result.one_time;
  const vis = effectiveVisibility(d.content.visibility);
  const rows: {label: string; amount: number; emphasis?: 'subtotal' | 'total'}[] = [];
  if (vis.margin) {
    // modo "custos" (autorizado): linhas de custo, subtotal, margem — como na proposta PDV ATEC
    for (const l of res.lines) {
      rows.push({label: `${l.label}${l.hours ? ` (${l.hours} h × ${brl(l.rate_cents ?? d.content.calc.hourly_rate_cents)})` : ''}`, amount: l.gross_cents});
      if (l.discount_cents > 0) rows.push({label: `Desconto em "${l.label}"`, amount: -l.discount_cents});
    }
    rows.push({label: 'SUBTOTAL DE CUSTOS', amount: res.cost_cents, emphasis: 'subtotal'});
    const marginCents = res.price_suggested_cents - res.license_cents - res.cost_cents;
    rows.push({label: `Margem de lucro${res.margin_pct !== null ? ` (${String(res.margin_pct).replace('.', ',')}% do valor do projeto)` : ''}`, amount: marginCents});
  } else if (vis.one_time_breakdown) {
    const priceBase = res.price_before_discount_cents - res.license_cents;
    const grouped = GROUPS.map((g) => ({label: g.label, v: g.cats.reduce((s, c) => s + (res.cost_by_category[c] ?? 0), 0)})).filter((g) => g.v > 0);
    const alloc = allocateToPrice(grouped.map((g) => g.v), priceBase);
    grouped.forEach((g, i) => rows.push({label: g.label, amount: alloc[i] as number}));
  } else {
    rows.push({label: 'Desenvolvimento, implantação e serviços do projeto', amount: res.price_before_discount_cents - res.license_cents});
  }
  if (res.license_cents > 0) rows.push({label: 'Licença de uso do sistema', amount: res.license_cents});
  if (vis.taxes) rows.push({label: 'Tributos estimados (incluídos)', amount: res.taxes_cents});
  if (res.discount_cents > 0) rows.push({label: 'Desconto concedido', amount: -res.discount_cents});
  rows.push({label: 'VALOR DO PROJETO', amount: res.price_final_cents, emphasis: 'total'});
  return rows;
}

export async function renderProposalPdf(d: ProposalDocData): Promise<Buffer> {
  const doc = new PDFDocument({size: 'A4', margin: 40, bufferPages: true, info: {Title: `Proposta ${d.number} — ${d.project_name}`, Author: d.company.trade_name, Subject: 'Proposta comercial'}});
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const L = 40;
  const W = doc.page.width - 80;
  const BOTTOM = doc.page.height - 70;
  let y = 40;
  const vis = effectiveVisibility(d.content.visibility);

  const ensure = (h: number) => {
    if (y + h > BOTTOM) {
      doc.addPage();
      y = 48;
    }
  };
  const text = (s: string, x: number, yy: number, opts: PDFKit.Mixins.TextOptions & {font?: string; size?: number; color?: string} = {}) => {
    doc.font(opts.font ?? 'Helvetica').fontSize(opts.size ?? 9).fillColor(opts.color ?? NAVY);
    doc.text(clean(s), x, yy, {align: 'left', ...opts});
  };
  const heightOf = (s: string, w: number, size = 9, font = 'Helvetica') => {
    doc.font(font).fontSize(size);
    return doc.heightOfString(clean(s), {width: w});
  };

  const section = (title: string) => {
    ensure(40);
    y += 8;
    doc.rect(L, y, W, 18).fill(NAVY);
    text(title.toUpperCase(), L + 8, y + 5, {font: 'Helvetica-Bold', size: 9.5, color: '#FFFFFF', width: W - 16, lineBreak: false});
    doc.rect(L, y + 18, 60, 2).fill(ORANGE);
    y += 28;
  };

  const kv = (rows: [string, string][], labelW = 120) => {
    for (const [idx, [k, v]] of rows.entries()) {
      const h = Math.max(heightOf(v, W - labelW - 8), 12) + 4;
      ensure(h);
      doc.rect(L, y - 2, W, h).fill(idx % 2 ? '#FFFFFF' : '#F5F7FA');
      text(k, L + 6, y, {font: 'Helvetica-Bold', size: 8.5, color: MUTED, width: labelW - 6});
      text(v, L + labelW, y, {size: 9, width: W - labelW - 8});
      y += h;
    }
    y += 4;
  };

  const table = (rows: {label: string; amount: number | null; emphasis?: 'subtotal' | 'total' | 'info'}[], head?: [string, string]) => {
    const amtW = 100;
    if (head) {
      ensure(20);
      doc.rect(L, y, W, 15).fill(TINT_NAVY);
      text(head[0], L + 6, y + 4, {font: 'Helvetica-Bold', size: 8, width: W - amtW - 12, lineBreak: false});
      text(head[1], L + W - amtW - 6, y + 4, {font: 'Helvetica-Bold', size: 8, width: amtW, align: 'right', lineBreak: false});
      y += 15;
    }
    for (const r of rows) {
      const h = Math.max(heightOf(r.label, W - amtW - 16, 9, r.emphasis ? 'Helvetica-Bold' : 'Helvetica'), 11) + 8;
      ensure(h);
      const bg = r.emphasis === 'total' ? NAVY : r.emphasis === 'subtotal' ? TINT_ORANGE : null;
      if (bg) doc.rect(L, y, W, h).fill(bg);
      else doc.moveTo(L, y + h).lineTo(L + W, y + h).lineWidth(0.5).strokeColor(GRAY).stroke();
      const color = r.emphasis === 'total' ? '#FFFFFF' : NAVY;
      text(r.label, L + 6, y + 4, {font: r.emphasis ? 'Helvetica-Bold' : 'Helvetica', size: 9, color, width: W - amtW - 16});
      if (r.amount !== null) text(brl(r.amount), L + W - amtW - 6, y + 4, {font: r.emphasis ? 'Helvetica-Bold' : 'Helvetica', size: 9, color, width: amtW, align: 'right', lineBreak: false});
      y += h;
    }
    y += 6;
  };

  // ---------- cabeçalho
  if (fs.existsSync(LOGO)) doc.image(LOGO, L, y, {height: 58});
  text('PROPOSTA COMERCIAL', L + 90, y + 6, {font: 'Helvetica-Bold', size: 20, width: W - 90});
  text(d.project_name, L + 90, y + 32, {size: 10.5, color: MUTED, width: W - 90});
  text(`Nº ${d.number}${d.version > 1 ? ` · versão ${d.version}` : ''}`, L + 90, y + 46, {size: 8.5, color: MUTED, width: W - 90});
  if (d.draft) text('RASCUNHO — sem validade comercial', L + W - 200, y + 2, {font: 'Helvetica-Bold', size: 8, color: '#B02500', width: 200, align: 'right'});
  y += 68;
  doc.rect(L, y, W, 2).fill(ORANGE);
  y += 6;

  // ---------- 1 identificação
  section('Identificação da proposta');
  kv([
    ['Cliente', d.client.name],
    ['CPF/CNPJ', cnpjFmt(d.client.document)],
    ['Endereço', d.client.address ?? '—'],
    ['Projeto', d.project_name],
    ...(d.content.identification.test_url ? [['Link de teste', d.content.identification.test_url] as [string, string]] : []),
    ['Responsável comercial', d.commercial_owner ?? d.company.responsible_name ?? '—'],
    ['Data de emissão', d.draft ? 'a definir na emissão' : date(d.issued_at)],
    ['Validade', d.draft ? `${d.content.identification.validity_days} dias a contar da emissão` : `${d.content.identification.validity_days} dias (até ${date(d.valid_until)})`]
  ]);

  // ---------- 2 objeto e escopo
  section('Objeto e escopo');
  if (d.content.scope.summary.trim()) {
    const h = heightOf(d.content.scope.summary, W) + 6;
    ensure(h);
    text(d.content.scope.summary, L, y, {size: 9, width: W});
    y += h;
  }
  const groups = d.content.scope.groups.filter((g) => g.items.length);
  const cols = 3;
  const colW = (W - 16 * (cols - 1)) / cols;
  for (let i = 0; i < groups.length; i += cols) {
    const row = groups.slice(i, i + cols);
    const heights = row.map((g) => 14 + g.items.reduce((s, it) => s + heightOf(`• ${it}`, colW) + 2, 0));
    const rowH = Math.max(...heights);
    ensure(rowH);
    row.forEach((g, k) => {
      const x = L + k * (colW + 16);
      text(g.title, x, y, {font: 'Helvetica-Bold', size: 9.5, width: colW});
      let yy = y + 14;
      for (const it of g.items) {
        text(`• ${it}`, x, yy, {size: 8.5, width: colW});
        yy += heightOf(`• ${it}`, colW, 8.5) + 2;
      }
    });
    y += rowH + 8;
  }

  // ---------- 3 prazo e infraestrutura
  const sch = d.content.schedule;
  const schedRows: [string, string][] = [];
  if (sch.dev_hours_text) schedRows.push(['Horas previstas', sch.dev_hours_text]);
  if (sch.deadline) schedRows.push(['Prazo de implantação', sch.deadline]);
  if (sch.training) schedRows.push(['Treinamento', sch.training]);
  if (sch.hosting) schedRows.push(['Hospedagem', sch.hosting]);
  if (sch.database) schedRows.push(['Banco de dados', sch.database]);
  if (sch.domain) schedRows.push(['Domínio', sch.domain]);
  if (sch.email) schedRows.push(['E-mail', sch.email]);
  if (sch.responsibilities) schedRows.push(['Responsabilidades pelos custos', sch.responsibilities]);
  if (schedRows.length) {
    section('Prazo e infraestrutura');
    kv(schedRows, 140);
  }

  // ---------- 4 investimento e forma de pagamento
  section('Investimento e forma de pagamento');
  const rec = d.computed.result.recurring;
  if (rec.price_final_cents > 0) {
    if (vis.monthly_breakdown) {
      const rows = rec.lines.filter((l) => l.net_cents > 0).map((l) => ({label: l.label, amount: l.net_cents as number | null, emphasis: undefined as 'subtotal' | 'total' | undefined}));
      if (rec.license_cents > 0) rows.push({label: 'Licença de uso', amount: rec.license_cents, emphasis: undefined});
      rows.push({label: 'MENSALIDADE', amount: rec.price_final_cents, emphasis: 'total'});
      table(rows, ['Mensalidade — serviço', 'Valor por mês']);
    } else table([{label: 'MENSALIDADE (conforme escopo e condições)', amount: rec.price_final_cents, emphasis: 'total'}], ['Mensalidade', 'Valor por mês']);
  }
  if (d.computed.result.one_time.price_final_cents > 0) {
    table(clientOneTimeRows(d).map((r) => ({label: r.label, amount: r.amount, emphasis: r.emphasis})), ['Investimento inicial', 'Valor']);
  }
  const payRows = (p: PaymentResult) => p.rows.map((r) => ({label: r.label, amount: r.amount_cents, emphasis: r.emphasis}));
  d.computed.payments.forEach((p, i) => {
    ensure(24 + p.rows.reduce((s, r) => s + Math.max(heightOf(r.label, W - 132, 9, r.emphasis ? 'Helvetica-Bold' : 'Helvetica'), 11) + 8, 0)); // mantém a opção inteira na mesma página
    text(/^op[çc][aã]o\s*\d/i.test(p.title) ? p.title : `Opção ${i + 1}: ${p.title}`, L, y, {font: 'Helvetica-Bold', size: 9.5, width: W});
    y += 15;
    table(payRows(p));
  });

  // ---------- 5 custo de infraestrutura (somente com autorização)
  if (vis.infra_table) {
    section('Custo de infraestrutura');
    const rec = d.computed.catalog_resolved.recurring;
    // itens recorrentes (rateio mensal) + itens só da entrada (ex.: domínio), sem repetir o mesmo item
    const all = [...rec, ...d.computed.catalog_resolved.one_time.filter((o) => !rec.some((r) => r.item_id === o.item_id))].filter((x) => !x.excluded_reason);
    if (all.length) {
      table(all.map((x) => ({
        label: `${x.name}${vis.tools_allocation ? ` (${x.currency !== 'BRL' && x.fx ? `${x.currency} ${((x.price_cents ?? 0) / 100).toFixed(2)} × ${x.fx.rate} · ` : ''}rateio ${String(x.allocation_pct).replace('.', ',')}%)` : ''}`,
        amount: x.allocated_monthly_cents || x.allocated_period_cents
      })), ['Item', 'Valor']);
    } else text('Sem itens de catálogo selecionados.', L, y, {size: 9, color: MUTED}), (y += 14);
  }
  // ---------- 6 custo de manutenção / suporte (somente com autorização)
  if (vis.support_table) {
    section('Custo de manutenção / suporte');
    const sup = rec.lines.filter((l) => ['suporte', 'manutencao', 'monitoramento', 'backup'].includes(l.category));
    table([...sup.map((l) => ({label: `${l.label}${l.hours ? ` (${l.hours} h/mês)` : ''}`, amount: l.net_cents as number | null, emphasis: undefined as 'subtotal' | 'total' | undefined})),
      {label: 'MENSALIDADE COBRADA (inclui manutenção e suporte)', amount: rec.price_final_cents, emphasis: 'total'}], ['Sustentação', 'Valor por mês']);
  }

  // ---------- 7 fora do escopo
  if (d.content.out_of_scope.length) {
    section('Fora do escopo');
    for (const s of d.content.out_of_scope) {
      const h = heightOf(`• ${s}`, W) + 3;
      ensure(h);
      text(`• ${s}`, L, y, {size: 9, width: W});
      y += h;
    }
  }

  // ---------- 8 dados para pagamento (+ QR Pix + QR Google)
  section('Dados para pagamento');
  const c = d.company;
  const qrs: {label: string; buf: Buffer}[] = [];
  if (d.pix_payload) qrs.push({label: 'Pix — aponte a câmera do app do banco', buf: await QRCode.toBuffer(d.pix_payload, {errorCorrectionLevel: 'M', margin: 1, width: 300})});
  if (c.google_review_url && d.content.google_review.include) qrs.push({label: 'Avalie nossa empresa no Google', buf: await QRCode.toBuffer(c.google_review_url, {errorCorrectionLevel: 'M', margin: 1, width: 300})});
  const qrW = qrs.length ? 100 * qrs.length + 10 : 0;
  const kvRows: [string, string][] = [
    ['Favorecido', c.legal_name.replace(/[ÇÃÕÁÉÍÓÚ]/g, (m) => ({Ç: 'C', Ã: 'A', Õ: 'O', Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U'})[m] ?? m)],
    ['CNPJ', cnpjFmt(c.cnpj)],
    ['Banco', c.bank_name ?? '—'],
    ['Agência / Conta', `${c.bank_agency ?? '—'} / ${c.bank_account ?? '—'}`],
    ['Pix (CNPJ)', c.pix_key_cnpj ?? '—'],
    ['Pix (chave aleatória)', c.pix_key_random ?? '—']
  ];
  const leftW = W - qrW; // coluna esquerda: dados; direita: QR codes
  const rowH = kvRows.map(([, v]) => Math.max(heightOf(v, leftW - 124), 11) + 6);
  const blockH = Math.max(qrs.length ? 128 : 0, rowH.reduce((a, b) => a + b, 0) + 10);
  ensure(blockH + 6);
  const startY = y;
  kvRows.forEach(([k, v], i) => {
    doc.rect(L, y - 2, leftW, rowH[i] as number).fill(i % 2 ? '#FFFFFF' : '#F5F7FA');
    text(k, L + 6, y + 1, {font: 'Helvetica-Bold', size: 8.5, color: MUTED, width: 110, lineBreak: false});
    text(v, L + 120, y + 1, {size: 9, width: leftW - 124});
    y += rowH[i] as number;
  });
  qrs.forEach((q, i) => {
    const x = L + leftW + 10 + i * 100 - (qrs.length > 1 ? 0 : 0);
    doc.image(q.buf, x, startY - 2, {width: 92});
    text(q.label, x - 2, startY + 92, {size: 7, color: MUTED, width: 98, align: 'center'});
  });
  y = Math.max(y, startY + (qrs.length ? 124 : 0)) + 4;
  if (d.pix_payload) {
    const h = heightOf(`Pix copia e cola: ${d.pix_payload}`, W, 7) + 4;
    ensure(h);
    text(`Pix copia e cola: ${d.pix_payload}`, L, y, {size: 7, color: MUTED, width: W});
    y += h;
  }

  // ---------- 9 condições
  if (d.content.conditions.length) {
    section('Condições');
    d.content.conditions.forEach((cnd, i) => {
      const h = heightOf(`${i + 1}. ${cnd}`, W) + 4;
      ensure(h);
      text(`${i + 1}. ${cnd}`, L, y, {size: 9, width: W});
      y += h;
    });
  }

  // ---------- 10 assinaturas
  section('Assinaturas');
  ensure(110);
  text(`${c.city}, ${d.draft ? '____ de ______________ de ______' : longDate(d.issued_at)}.`, L, y, {size: 9.5, width: W});
  y += 52;
  const sigW = (W - 40) / 2;
  doc.moveTo(L, y).lineTo(L + sigW, y).lineWidth(0.8).strokeColor(NAVY).stroke();
  doc.moveTo(L + sigW + 40, y).lineTo(L + W, y).stroke();
  text((c.responsible_name ?? c.trade_name).toUpperCase(), L, y + 4, {font: 'Helvetica-Bold', size: 8.5, width: sigW});
  text(`${c.responsible_role ?? ''} · ${c.trade_name}`, L, y + 15, {size: 8, color: MUTED, width: sigW});
  text(d.client.name, L + sigW + 40, y + 4, {font: 'Helvetica-Bold', size: 8.5, width: sigW});
  text('Cliente (de acordo)', L + sigW + 40, y + 15, {size: 8, color: MUTED, width: sigW});

  // ---------- rodapé e numeração em todas as páginas
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const fy = doc.page.height - 52;
    doc.rect(L, fy - 4, W, 1).fill(ORANGE);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(NAVY).text(clean(`${c.trade_name.toUpperCase()} · Proposta comercial · ${d.project_name}`), L, fy, {width: W, align: 'left', lineBreak: false});
    doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(
      clean(`${c.legal_name} · CNPJ ${cnpjFmt(c.cnpj)}${c.address ? ` · ${c.address}` : ''}${c.phone ? ` · ${c.phone}` : ''}${c.email ? ` · ${c.email}` : ''} · página ${i + 1} de ${range.count}`),
      L, fy + 11, {width: W, align: 'left', height: 24});
  }
  doc.end();
  return done;
}

function longDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const names = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return `${d} de ${names[m - 1]} de ${y}`;
}
