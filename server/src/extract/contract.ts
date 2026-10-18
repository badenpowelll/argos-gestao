/**
 * Extração de dados comerciais de contratos/propostas por regras (sem inventar valores).
 *
 * Princípios:
 *  - cada campo traz o trecho de origem, a página (quando conhecida) e uma confiança 0–0,9 (nunca 1: é heurística);
 *  - campo não encontrado => status "ausente" e valor nulo (jamais um valor presumido);
 *  - valores conflitantes => "divergente", com alternativas;
 *  - NADA é gravado a partir daqui: o resultado só alimenta a tela de revisão humana.
 */
import {isValidCnpj, isValidCpf, onlyDigits} from '../lib/documents.js';
import {isValidIsoDate} from '../lib/dates.js';
import {parseBRL} from '../lib/money.js';

export type FieldStatus = 'ok' | 'baixa_confianca' | 'divergente' | 'ausente';

export interface ExtractedField {
  key: string;
  label: string;
  value: string | number | boolean | null;
  confidence: number;
  status: FieldStatus;
  source: string | null;
  page: number | null;
  alternatives?: (string | number)[];
}

export interface ExtractedItem {
  kind: string;
  description: string;
  billing_type: 'unico' | 'recorrente' | 'parcelado' | 'por_usuario' | 'sob_demanda';
  amount_cents: number;
  quantity: number;
  installments: number | null;
  interval_months: number;
  confidence: number;
  status: FieldStatus;
  source: string;
  page: number | null;
}

export interface Extraction {
  document_kind: 'proposta' | 'contrato' | 'aditivo' | 'indefinido';
  fields: ExtractedField[];
  items: ExtractedItem[];
  issues: {level: 'erro' | 'aviso' | 'info'; message: string}[];
  text_length: number;
  pages: number;
}

const ARGOS_CNPJ = '65305027000138';
const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7,
  agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12
};
const MONEY = /R\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|R\$\s*\d+(?:,\d{1,2})?/g;

const KEYWORDS: {kind: string; re: RegExp}[] = [
  {kind: 'implementacao', re: /implanta[cç][aã]o|implementa[cç][aã]o/i},
  {kind: 'desenvolvimento', re: /desenvolvimento/i},
  {kind: 'licenca', re: /licen[cç]a/i},
  {kind: 'hospedagem', re: /hospedagem|hosting/i},
  {kind: 'dominio', re: /dom[ií]nio/i},
  {kind: 'treinamento', re: /treinamento|capacita[cç][aã]o/i},
  {kind: 'suporte', re: /suporte|manuten[cç][aã]o/i},
  {kind: 'mensalidade', re: /mensalidade|assinatura/i},
  {kind: 'outro', re: /\bentrada\b/i}
];

const clip = (s: string, n = 260) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function pageOf(pages: string[], snippet: string): number | null {
  if (pages.length < 2) return pages.length === 1 ? 1 : null;
  const needle = clean(snippet).slice(0, 40);
  const idx = pages.findIndex((p) => clean(p).includes(needle));
  return idx >= 0 ? idx + 1 : null;
}

function field(
  pages: string[],
  key: string,
  label: string,
  value: ExtractedField['value'],
  confidence: number,
  source: string | null,
  extra: Partial<ExtractedField> = {}
): ExtractedField {
  if (value === null || value === undefined || value === '') {
    return {key, label, value: null, confidence: 0, status: 'ausente', source: null, page: null};
  }
  return {
    key,
    label,
    value,
    confidence: Math.min(confidence, 0.9),
    status: confidence < 0.5 ? 'baixa_confianca' : 'ok',
    source: source ? clip(clean(source)) : null,
    page: source ? pageOf(pages, source) : null,
    ...extra
  };
}

export function parsePtDate(s: string): string | null {
  const num = s.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/);
  if (num) {
    const iso = `${num[3]}-${String(num[2]).padStart(2, '0')}-${String(num[1]).padStart(2, '0')}`;
    return isValidIsoDate(iso) ? iso : null;
  }
  const ext = s.match(/(\d{1,2})\s+de\s+([A-Za-zçÇãÃ]+)\s+de\s+(\d{4})/i);
  if (ext) {
    const m = MONTHS[(ext[2] as string).toLowerCase()];
    if (!m) return null;
    const iso = `${ext[3]}-${String(m).padStart(2, '0')}-${String(ext[1]).padStart(2, '0')}`;
    return isValidIsoDate(iso) ? iso : null;
  }
  return null;
}

function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.;])\s+(?=[A-ZÀ-Ú0-9])/))
    .map(clean)
    .filter((s) => s.length > 3);
}

function billingOf(s: string): Pick<ExtractedItem, 'billing_type' | 'installments' | 'interval_months'> & {typed: boolean} {
  const parcel = s.match(/(\d{1,3})\s*(?:\(\w[^)]*\)\s*)?(?:parcelas|presta[cç][oõ]es|x\b)/i) ?? s.match(/parcelad[oa]\s+em\s+(\d{1,3})/i);
  if (parcel) return {billing_type: 'parcelado', installments: Number(parcel[1]), interval_months: 1, typed: true};
  if (/por\s+usu[aá]rio/i.test(s)) return {billing_type: 'por_usuario', installments: null, interval_months: 1, typed: true};
  if (/sob\s+demanda|por\s+hora|hora\s+t[eé]cnica/i.test(s)) return {billing_type: 'sob_demanda', installments: null, interval_months: 1, typed: true};
  if (/anual|por\s+ano|anuidade/i.test(s)) return {billing_type: 'recorrente', installments: null, interval_months: 12, typed: true};
  if (/mensal|por\s+m[eê]s|mensalidade|mensalmente/i.test(s)) return {billing_type: 'recorrente', installments: null, interval_months: 1, typed: true};
  return {billing_type: 'unico', installments: null, interval_months: 1, typed: false};
}

export function extractContract(text: string, pages: string[] = [text]): Extraction {
  const issues: Extraction['issues'] = [];
  const fields: ExtractedField[] = [];
  const full = text.replace(/\r/g, '');
  const sents = sentences(full);
  const f = (k: string, l: string, v: ExtractedField['value'], c: number, s: string | null, e?: Partial<ExtractedField>) =>
    fields.push(field(pages, k, l, v, c, s, e));

  // ---- tipo do documento
  let docKind: Extraction['document_kind'] = 'indefinido';
  if (/termo\s+aditivo/i.test(full)) docKind = 'aditivo';
  else if (/CONTRATANTE/.test(full) && /CONTRATAD[AO]/.test(full)) docKind = 'contrato';
  else if (/proposta/i.test(full)) docKind = 'proposta';
  if (docKind === 'indefinido') issues.push({level: 'aviso', message: 'Não foi possível identificar se o documento é proposta, contrato ou aditivo. Classifique manualmente.'});
  if (docKind === 'proposta') issues.push({level: 'info', message: 'Documento identificado como PROPOSTA: ele não gera cobranças até ser aprovado e convertido em contrato assinado.'});

  // ---- CPF/CNPJ do cliente
  const docRe = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
  const docs = new Map<string, {raw: string; idx: number}>();
  for (const m of full.matchAll(docRe)) {
    const d = onlyDigits(m[0]);
    const valid = d.length === 14 ? isValidCnpj(d) : d.length === 11 ? isValidCpf(d) : false;
    if (valid && d !== ARGOS_CNPJ && !docs.has(d)) docs.set(d, {raw: m[0], idx: m.index ?? 0});
  }
  const docList = [...docs.entries()];
  const firstDoc = docList[0];
  if (firstDoc) {
    const ctx = full.slice(Math.max(0, firstDoc[1].idx - 160), firstDoc[1].idx + 60);
    f('client_document', 'CPF/CNPJ do cliente', firstDoc[0], docList.length > 1 ? 0.45 : 0.8, ctx, {
      alternatives: docList.slice(1).map(([d]) => d),
      ...(docList.length > 1 ? {status: 'divergente' as const} : {})
    });
    if (docList.length > 1) issues.push({level: 'aviso', message: `Foram encontrados ${docList.length} CPF/CNPJ válidos (além do da Argos). Confirme qual é o do cliente.`});

    // nome: texto imediatamente antes do documento
    const before = full.slice(Math.max(0, firstDoc[1].idx - 220), firstDoc[1].idx);
    const nm =
      before.match(/(?:CONTRATANTE|Cliente|Contratante)\s*[:\-–]\s*([^\n,;]{3,120})/i) ??
      before.match(/([A-ZÀ-Ú][A-Za-zÀ-ú0-9&.\- ']{3,100}?)\s*,?\s*(?:pessoa\s+jur[ií]dica|pessoa\s+f[ií]sica|inscrit[ao]|CNPJ|CPF)[^\n]*$/i);
    const nameVal = nm ? clean(nm[1] as string).replace(/[,\s]+$/, '') : null;
    f('client_name', 'Nome / razão social', nameVal, /CONTRATANTE|Cliente/i.test(nm?.[0] ?? '') ? 0.7 : 0.4, nm?.[0] ?? null);
  } else {
    f('client_document', 'CPF/CNPJ do cliente', null, 0, null);
    const nm = full.match(/(?:CONTRATANTE|Cliente)\s*[:\-–]\s*([^\n,;]{3,120})/i);
    f('client_name', 'Nome / razão social', nm ? clean(nm[1] as string) : null, 0.55, nm?.[0] ?? null);
    issues.push({level: 'aviso', message: 'CPF/CNPJ do cliente não encontrado (ou inválido pelos dígitos verificadores).'});
  }

  // ---- objeto
  const obj =
    full.match(/(?:cl[aá]usula\s+\w+\s*[–\-.:]?\s*)?(?:do\s+)?objeto\s*[.:\-–]?\s*\n?\s*([\s\S]{20,500}?)(?:\n\s*\n|cl[aá]usula\s+\w+)/i) ??
    full.match(/tem\s+por\s+objeto\s+([^.]{15,400})/i);
  f('object', 'Objeto', obj ? clean(obj[1] as string) : null, 0.6, obj ? (obj[1] as string) : null);

  // ---- itens financeiros
  const found: ExtractedItem[] = [];
  const discounts: string[] = [];
  for (const s of sents) {
    const amounts = [...s.matchAll(MONEY)];
    if (!amounts.length) continue;
    if (/desconto/i.test(s)) {
      discounts.push(s);
      continue;
    }
    for (const kw of KEYWORDS) {
      const km = s.match(kw.re);
      if (!km) continue;
      const kwIdx = km.index ?? 0;
      const after = amounts.find((a) => (a.index ?? 0) >= kwIdx) ?? amounts[0];
      const cents = parseBRL((after as RegExpMatchArray)[0]);
      if (cents === null || cents <= 0) continue;
      const b = billingOf(s);
      const near = Math.abs((after?.index ?? 0) - kwIdx) <= 70;
      let conf = 0.5 + (near ? 0.15 : 0) + (b.typed ? 0.15 : 0);
      if (kw.kind === 'outro') conf = 0.4;
      if (kw.kind === 'mensalidade' && b.billing_type === 'unico') b.billing_type = 'recorrente';
      const qtyM = s.match(/(\d{1,4})\s*(?:\(\w[^)]*\)\s*)?usu[aá]rios?/i);
      found.push({
        kind: kw.kind,
        description: kw.kind === 'outro' ? 'Entrada' : kw.kind[0]?.toUpperCase() + kw.kind.slice(1),
        billing_type: b.billing_type,
        amount_cents: cents,
        quantity: b.billing_type === 'por_usuario' && qtyM ? Number(qtyM[1]) : 1,
        installments: b.installments,
        interval_months: b.interval_months,
        confidence: Math.min(conf, 0.9),
        status: conf < 0.5 ? 'baixa_confianca' : 'ok',
        source: clip(s),
        page: pageOf(pages, s)
      });
      break; // uma classificação por sentença
    }
  }
  // remove duplicatas idênticas e sinaliza divergência (mesmo tipo, valores diferentes)
  const items: ExtractedItem[] = [];
  for (const it of found) {
    if (!items.some((x) => x.kind === it.kind && x.amount_cents === it.amount_cents && x.billing_type === it.billing_type)) items.push(it);
  }
  for (const it of items) {
    const rivals = items.filter((x) => x !== it && x.kind === it.kind && x.billing_type === it.billing_type && x.amount_cents !== it.amount_cents);
    if (rivals.length) {
      it.status = 'divergente';
      it.confidence = Math.min(it.confidence, 0.45);
    }
  }
  if (items.some((i) => i.status === 'divergente')) {
    issues.push({level: 'aviso', message: 'Há valores diferentes para o mesmo tipo de item. Confira cada linha com o documento original.'});
  }
  if (!items.length) issues.push({level: 'erro', message: 'Nenhum valor monetário associado a um serviço foi identificado. Cadastre os itens manualmente na revisão.'});
  if (discounts.length) f('discounts', 'Descontos mencionados', discounts.join(' | '), 0.5, discounts[0] ?? null);
  else f('discounts', 'Descontos mencionados', null, 0, null);

  // ---- datas e prazos
  const signRe = /(?:assinatura|firmad[oa]|celebrad[oa]|data)\s*[:\-–]?[^.\n]{0,40}?((?:\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{4})|(?:\d{1,2}\s+de\s+[A-Za-zçã]+\s+de\s+\d{4}))/i;
  const sign = full.match(signRe);
  f('signed_at', 'Data de assinatura', sign ? parsePtDate(sign[1] as string) : null, 0.55, sign?.[0] ?? null);

  const start = full.match(/(?:in[ií]cio|vig[eê]ncia\s+(?:a\s+partir|iniciar[aá])|a\s+partir\s+de)[^.\n]{0,40}?((?:\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{4})|(?:\d{1,2}\s+de\s+[A-Za-zçã]+\s+de\s+\d{4}))/i);
  f('start_date', 'Início da vigência', start ? parsePtDate(start[1] as string) : null, 0.55, start?.[0] ?? null);

  const term = full.match(/(?:vig[eê]ncia|prazo)[^.\n]{0,80}?(\d{1,3})\s*(?:\([^)]*\)\s*)?(meses|m[eê]s|anos?)/i);
  if (term) {
    const n = Number(term[1]) * (/ano/i.test(term[2] as string) ? 12 : 1);
    f('term_months', 'Vigência (meses)', n, 0.65, term[0]);
  } else f('term_months', 'Vigência (meses)', null, 0, null);

  const due = full.match(/(?:vencimento|vencer[aá]|pagamento)[^.\n]{0,70}?dia\s+(\d{1,2})\b/i) ?? full.match(/todo\s+dia\s+(\d{1,2})\b/i);
  const dueDay = due ? Number(due[1]) : null;
  f('due_day', 'Dia de vencimento', dueDay && dueDay >= 1 && dueDay <= 31 ? dueDay : null, 0.6, due?.[0] ?? null);

  const adj = full.match(/reajust\w*[^.\n]{0,140}?(IPCA|IGP-?M|INPC|IPC-?A|IPC|[IÍ]ndice\s+[\wÀ-ú ]{3,30})/i);
  f('adjustment_index', 'Índice de reajuste', adj ? clean(adj[1] as string).toUpperCase() : null, 0.65, adj?.[0] ?? null);

  const fine = full.match(/multa[^.\n]{0,60}?(\d{1,2}(?:,\d{1,3})?)\s*%/i);
  f('fine_percent', 'Multa por atraso (%)', fine ? parseFloat((fine[1] as string).replace(',', '.')) : null, 0.65, fine?.[0] ?? null);
  const interest = full.match(/juros[^.\n]{0,80}?(\d{1,2}(?:,\d{1,3})?)\s*%/i);
  f('interest_monthly_percent', 'Juros mensais (%)', interest ? parseFloat((interest[1] as string).replace(',', '.')) : null, 0.55, interest?.[0] ?? null);

  const pay = sents.find((s) => /forma\s+de\s+pagamento|condi[cç][oõ]es\s+de\s+pagamento|pagamento\s+(?:ser[aá]|dar-se-[aá]|ocorrer[aá])/i.test(s));
  f('payment_terms', 'Condições de pagamento', pay ?? null, 0.55, pay ?? null);

  // ---- setor público (opcional)
  const emp = full.match(/empenho\s*(?:n[ºo°.]*)?\s*:?\s*([\w./-]{3,30})/i);
  const proc = full.match(/processo\s+(?:administrativo\s+)?(?:n[ºo°.]*)?\s*:?\s*(\d[\d./-]{3,30})/i);
  f('commitment_number', 'Empenho', emp ? emp[1] ?? null : null, 0.5, emp?.[0] ?? null);
  f('administrative_process', 'Processo administrativo', proc ? proc[1] ?? null : null, 0.5, proc?.[0] ?? null);
  const isPublic = /prefeitura|munic[ií]pio|secretaria|c[aâ]mara\s+municipal|fundo\s+municipal|governo\s+do\s+estado|autarquia|empenho|lei\s+(?:n[ºo°.]*\s*)?14\.133/i.test(full);
  f('is_public_flow', 'Fluxo de setor público', isPublic ? true : null, 0.5, isPublic ? (full.match(/prefeitura|munic[ií]pio|secretaria|empenho|14\.133/i)?.[0] ?? null) : null);

  for (const k of ['client_document', 'client_name', 'signed_at', 'due_day'] as const) {
    const fld = fields.find((x) => x.key === k);
    if (fld?.status === 'ausente' && k !== 'client_document') issues.push({level: 'aviso', message: `Campo ausente no documento: ${fld.label}.`});
  }

  return {document_kind: docKind, fields, items, issues, text_length: full.length, pages: pages.length};
}
