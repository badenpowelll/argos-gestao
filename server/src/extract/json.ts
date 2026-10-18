/**
 * Importação ESTRUTURADA (JSON exportado do Claude): é o caminho mais confiável — nenhum dado é "adivinhado".
 * Formato documentado em docs/IMPORTACAO_JSON.md (schema "argos-proposta/1").
 */
import {z} from 'zod';
import {isValidDocument, onlyDigits} from '../lib/documents.js';
import {isValidIsoDate} from '../lib/dates.js';
import type {Extraction, ExtractedField, ExtractedItem} from './contract.js';

const money = z.number().min(0).max(1_000_000_000);
const iso = z.string().refine(isValidIsoDate, 'Data inválida (use AAAA-MM-DD)');
const opt = <T extends z.ZodTypeAny>(s: T) => s.nullish();

export const proposalJsonSchema = z.object({
  schema: z.literal('argos-proposta/1'),
  tipo: z.enum(['proposta', 'contrato', 'aditivo']).default('proposta'),
  cliente: z.object({
    nome: z.string().trim().min(2).max(200),
    documento: opt(z.string().max(20)),
    tipo: opt(z.enum(['pessoa_fisica', 'empresa_privada', 'orgao_publico'])),
    email: opt(z.string().max(200)), telefone: opt(z.string().max(30)), whatsapp: opt(z.string().max(30)),
    endereco: opt(z.string().max(300)), responsavel: opt(z.string().max(150))
  }),
  projeto: z.object({
    nome: opt(z.string().max(200)), objeto: opt(z.string().max(4000)), escopo: opt(z.array(z.string().max(300)).max(80)),
    prazo: opt(z.string().max(300)), horas: opt(z.number().min(0).max(100000)), hospedagem: opt(z.string().max(500)), banco_de_dados: opt(z.string().max(500)), dominio_email: opt(z.string().max(500))
  }).default({}),
  itens: z.array(z.object({
    tipo: z.enum(['implementacao', 'desenvolvimento', 'licenca', 'mensalidade', 'hospedagem', 'dominio', 'treinamento', 'suporte', 'outro']),
    descricao: z.string().trim().min(2).max(300),
    cobranca: z.enum(['unico', 'recorrente', 'parcelado', 'por_usuario', 'sob_demanda']),
    valor: money, quantidade: z.number().positive().max(100000).default(1), parcelas: opt(z.number().int().min(1).max(120)),
    periodicidade_meses: z.number().int().min(1).max(36).default(1), vencimento: opt(iso), desconto: money.default(0)
  })).max(60).default([]),
  condicoes: z.object({
    emissao: opt(iso), validade_dias: opt(z.number().int().min(1).max(365)), assinatura: opt(iso), inicio: opt(iso), fim: opt(iso), vigencia_meses: opt(z.number().int().min(1).max(240)),
    dia_vencimento: opt(z.number().int().min(1).max(31)), reajuste_indice: opt(z.string().max(60)), multa_percentual: opt(z.number().min(0).max(100)), juros_mensais_percentual: opt(z.number().min(0).max(100)),
    forma_pagamento: opt(z.string().max(2000)), custos_pagos_pelo_cliente: opt(z.array(z.string().max(400)).max(20)), descontos: opt(z.array(z.string().max(400)).max(20))
  }).default({}),
  setor_publico: opt(z.object({processo: opt(z.string().max(100)), empenho: opt(z.string().max(100))}))
});
export type ProposalJson = z.infer<typeof proposalJsonSchema>;

export function extractFromJson(raw: unknown): Extraction {
  const parsed = proposalJsonSchema.safeParse(raw);
  if (!parsed.success) {
    const msgs = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`);
    return {document_kind: 'indefinido', fields: [], items: [], pages: 1, text_length: 0, issues: [{level: 'erro', message: `JSON fora do formato "argos-proposta/1": ${msgs.join(' | ')}`}]};
  }
  const j = parsed.data;
  const issues: Extraction['issues'] = [];
  const fields: ExtractedField[] = [];
  const add = (key: string, label: string, value: ExtractedField['value']) => {
    const has = value !== null && value !== undefined && value !== '';
    fields.push({key, label, value: has ? value : null, confidence: has ? 0.95 : 0, status: has ? 'ok' : 'ausente', source: has ? 'JSON enviado (campo informado pelo autor)' : null, page: null});
  };
  const doc = j.cliente.documento ? onlyDigits(j.cliente.documento) : null;
  if (doc && !isValidDocument(doc)) issues.push({level: 'aviso', message: 'CPF/CNPJ do JSON não passa na validação dos dígitos verificadores. Confira.'});
  add('client_name', 'Nome / razão social', j.cliente.nome);
  add('client_document', 'CPF/CNPJ do cliente', doc);
  add('client_kind', 'Tipo de cliente', j.cliente.tipo ?? null);
  add('client_email', 'E-mail', j.cliente.email ?? null);
  add('client_phone', 'Telefone', j.cliente.telefone ?? null);
  add('client_whatsapp', 'WhatsApp', j.cliente.whatsapp ?? null);
  add('client_address', 'Endereço do cliente', j.cliente.endereco ?? null);
  add('client_responsible', 'Responsável', j.cliente.responsavel ?? null);
  add('project_name', 'Nome do sistema/projeto', j.projeto.nome ?? null);
  add('object', 'Objeto', j.projeto.objeto ?? null);
  add('scope', 'Escopo (módulos e funcionalidades)', j.projeto.escopo?.length ? j.projeto.escopo.join(' • ') : null);
  add('deadline', 'Prazo de implantação', j.projeto.prazo ?? null);
  add('hours', 'Horas previstas', j.projeto.horas ?? null);
  add('hosting', 'Hospedagem e banco de dados', [j.projeto.hospedagem, j.projeto.banco_de_dados].filter(Boolean).join(' · ') || null);
  add('domain_email', 'Domínio e e-mail', j.projeto.dominio_email ?? null);
  const c = j.condicoes;
  add('issued_at', 'Data de emissão', c.emissao ?? null);
  add('validity_days', 'Validade da proposta (dias)', c.validade_dias ?? null);
  add('signed_at', 'Data de assinatura', c.assinatura ?? null);
  add('start_date', 'Início da vigência', c.inicio ?? null);
  add('end_date', 'Fim da vigência', c.fim ?? null);
  add('term_months', 'Vigência (meses)', c.vigencia_meses ?? null);
  add('due_day', 'Dia de vencimento', c.dia_vencimento ?? null);
  add('adjustment_index', 'Índice de reajuste', c.reajuste_indice ?? null);
  add('fine_percent', 'Multa por atraso (%)', c.multa_percentual ?? null);
  add('interest_monthly_percent', 'Juros mensais (%)', c.juros_mensais_percentual ?? null);
  add('payment_terms', 'Condições de pagamento', c.forma_pagamento ?? null);
  add('client_paid_costs', 'Custos pagos diretamente pelo cliente (não cobrados pela Argos)', c.custos_pagos_pelo_cliente?.length ? c.custos_pagos_pelo_cliente.join(' | ') : null);
  add('discounts', 'Descontos mencionados', c.descontos?.length ? c.descontos.join(' | ') : null);
  add('commitment_number', 'Empenho', j.setor_publico?.empenho ?? null);
  add('administrative_process', 'Processo administrativo', j.setor_publico?.processo ?? null);
  fields.push({key: 'is_public_flow', label: 'Fluxo de setor público', value: j.cliente.tipo === 'orgao_publico' || !!j.setor_publico?.empenho || !!j.setor_publico?.processo ? true : null, confidence: 0.95, status: 'ok', source: 'JSON enviado', page: null});

  const items: ExtractedItem[] = j.itens.map((i) => ({
    kind: i.tipo, description: i.descricao, billing_type: i.cobranca, amount_cents: Math.round(i.valor * 100), quantity: i.quantidade, installments: i.parcelas ?? null,
    interval_months: i.periodicidade_meses, confidence: 0.95, status: 'ok' as const, source: `JSON enviado: ${i.descricao}${i.vencimento ? ` (1º vencimento ${i.vencimento})` : ''}`, page: null, due_date: i.vencimento ?? null
  }));
  if (!items.length) issues.push({level: 'aviso', message: 'O JSON não traz itens de cobrança. Adicione-os na conferência.'});
  if (j.tipo === 'proposta') issues.push({level: 'info', message: 'Documento identificado como PROPOSTA: ele não gera cobranças até ser aprovado e convertido em contrato assinado.'});
  return {document_kind: j.tipo, fields, items, issues, text_length: JSON.stringify(raw).length, pages: 1};
}

/** Datas de vencimento por item (o JSON as informa; a extração em texto, não). */
export function dueDatesFromJson(raw: unknown): (string | null)[] {
  const p = proposalJsonSchema.safeParse(raw);
  return p.success ? p.data.itens.map((i) => i.vencimento ?? null) : [];
}
