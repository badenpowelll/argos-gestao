import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {gerar} from './demo/gerar-contratos-demo.js';
import {completeCnpj} from './lib/documents.js';
import {createTestEnv, H} from './test/helpers.js';

let env: Awaited<ReturnType<typeof createTestEnv>>;
let admin: ReturnType<typeof request.agent>;
const post = (url: string, body: unknown = {}) => admin.post(url).set(H).send(body as object);
const cnpj = completeCnpj('990000010001');
const cnpjFmt = cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');

const proposalJson = (over: Record<string, unknown> = {}) => ({
  schema: 'argos-proposta/1', tipo: 'proposta',
  cliente: {nome: 'Loja Maré Alta Ltda', documento: cnpjFmt, tipo: 'empresa_privada', email: null, whatsapp: '(84) 99999-1111', endereco: 'Av. Exemplo, 100, Natal/RN', responsavel: 'Ana Souza'},
  projeto: {nome: 'PDV Maré Alta', objeto: 'Desenvolvimento e licença de uso do PDV', escopo: ['Frente de caixa', 'Estoque'], prazo: '24 h de desenvolvimento', horas: 24, hospedagem: 'Lovable Cloud', banco_de_dados: 'Postgres', dominio_email: 'Domínio .com.br pago pelo cliente'},
  itens: [
    {tipo: 'implementacao', descricao: 'Implantação e desenvolvimento', cobranca: 'unico', valor: 1351.8},
    {tipo: 'mensalidade', descricao: 'Mensalidade', cobranca: 'recorrente', valor: 148}
  ],
  condicoes: {emissao: '2026-10-17', validade_dias: 15, dia_vencimento: 10, reajuste_indice: 'IPCA', forma_pagamento: 'Entrada por Pix e mensalidades', custos_pagos_pelo_cliente: ['Hospedagem Railway', 'Domínio'], descontos: ['Desconto de 50% na implementação']},
  ...over
});

const upload = (name: string, data: Buffer | string) => admin.post('/api/imports').set(H).attach('file', Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'), name);

beforeAll(async () => {
  env = await createTestEnv();
  admin = request.agent(env.app);
  await post('/api/auth/setup', {name: 'Admin Teste', email: 'admin@teste.com', password: 'SenhaForte123'});
});
afterAll(async () => { await env?.cleanup(); });

const confirmBody = (extra: Record<string, unknown> = {}, clientExtra: Record<string, unknown> = {}) => ({
  reviewed: true,
  client: {kind: 'empresa_privada', name: 'Loja Maré Alta Ltda', document: cnpjFmt, whatsapp: '(84) 99999-1111', street: 'Av. Exemplo, 100, Natal/RN', responsible_name: 'Ana Souza', status: 'ativo', ...clientExtra},
  system: {name: 'PDV Maré Alta', description: 'PDV', status: 'em_desenvolvimento', operational_cost_cents: 0},
  contract: {kind: 'proposta', object: 'Desenvolvimento e licença de uso do PDV', signed_at: null, start_date: null, end_date: null, due_day: 10, adjustment_index: 'IPCA', payment_terms: 'Entrada por Pix', fine_percent: 0, interest_monthly_percent: 0, is_public_flow: false, administrative_process: null, commitment_number: null, notes: 'ESCOPO: Frente de caixa • Estoque'},
  items: [
    {kind: 'implementacao', description: 'Implantação e desenvolvimento', billing_type: 'unico', unit_amount_cents: 135180, quantity: 1, installments: null, interval_months: 1, first_due_date: null, discount_cents: 0},
    {kind: 'mensalidade', description: 'Mensalidade', billing_type: 'recorrente', unit_amount_cents: 14800, quantity: 1, installments: null, interval_months: 1, first_due_date: null, discount_cents: 0}
  ],
  ...extra
});

describe('importar proposta (JSON do Claude)', () => {
  let importId = '';
  it('reconhece todos os campos informados, sem inventar nada', async () => {
    const r = await upload('proposta.json', JSON.stringify(proposalJson()));
    expect(r.status).toBe(201);
    importId = r.body.import.id;
    const e = r.body.extraction;
    const v = (k: string) => e.fields.find((f: {key: string}) => f.key === k);
    expect(e.document_kind).toBe('proposta');
    expect(v('client_name').value).toBe('Loja Maré Alta Ltda');
    expect(v('client_document').value).toBe(cnpj);
    expect(v('client_email').status).toBe('ausente'); // não informado → fica em branco
    expect(v('client_paid_costs').value).toContain('Hospedagem Railway');
    expect(e.items.map((i: {kind: string; amount_cents: number}) => `${i.kind}:${i.amount_cents}`)).toEqual(['implementacao:135180', 'mensalidade:14800']);
    expect((await admin.get('/api/clients')).body).toHaveLength(0); // nada gravado antes da confirmação
  });
  it('JSON fora do formato gera erro claro e não cadastra', async () => {
    const r = await upload('ruim.json', JSON.stringify({schema: 'outro', cliente: {}}));
    expect(r.status).toBe(201);
    expect(r.body.extraction.issues[0].level).toBe('erro');
    expect(r.body.extraction.issues[0].message).toMatch(/argos-proposta\/1/);
  });
  it('confirma: cria o cliente e registra a PROPOSTA sem gerar cobranças', async () => {
    const r = await post(`/api/imports/${importId}/confirm`, confirmBody());
    expect(r.status).toBe(201);
    expect(r.body.created_client).toBe(true);
    const c = (await admin.get(`/api/contracts/${r.body.contract.id}`)).body;
    expect(c.contract.kind).toBe('proposta');
    expect(c.contract.notes).toContain('ESCOPO');
    expect((await env.db.query('select count(*)::int as n from charges')).rows[0].n).toBe(0);
    (globalThis as {cid?: string}).cid = r.body.contract.id;
  });
  it('mesmo CNPJ em novo documento: reconhece o cliente existente e só completa campos em branco', async () => {
    const r = await upload('proposta2.json', JSON.stringify(proposalJson({cliente: {nome: 'LOJA MARÉ ALTA (nome diferente)', documento: cnpj, tipo: 'empresa_privada', email: 'financeiro@maréalta.example.com', whatsapp: '(84) 90000-0000', endereco: null, responsavel: null}})));
    const body = confirmBody({}, {name: 'LOJA MARÉ ALTA (nome diferente)', email: 'financeiro@marealta.example.com', whatsapp: '(84) 90000-0000'});
    const c = await post(`/api/imports/${r.body.import.id}/confirm`, body);
    expect(c.status).toBe(201);
    expect(c.body.created_client).toBe(false);
    const cli = (await env.db.query('select name, email, whatsapp from clients')).rows;
    expect(cli).toHaveLength(1); // sem duplicidade
    expect(cli[0]).toMatchObject({name: 'Loja Maré Alta Ltda', whatsapp: '(84) 99999-1111'}); // nada sobrescrito
    expect(cli[0].email).toBe('financeiro@marealta.example.com'); // campo em branco foi completado
  });
  it('aprovar e gerar cobranças exige os vencimentos, converte em contrato e cria as cobranças', async () => {
    const id = (globalThis as {cid?: string}).cid as string;
    expect((await post(`/api/contracts/${id}/approve-and-activate`, {signed_at: '2026-10-20'})).status).toBe(422); // sem confirmação
    const miss = await post(`/api/contracts/${id}/approve-and-activate`, {confirm: true, signed_at: '2026-10-20'});
    expect(miss.status).toBe(422);
    expect(miss.body.code).toBe('missing_due_date');
    expect((await env.db.query('select kind, status from contracts where id = $1', [id])).rows[0]).toMatchObject({kind: 'proposta'}); // falha não deixa meio-termo
    const ok = await post(`/api/contracts/${id}/approve-and-activate`, {confirm: true, signed_at: '2026-10-20', entry_due_date: '2026-10-25', monthly_first_due_date: '2026-11-10', due_day: 10});
    expect(ok.status).toBe(200);
    expect(ok.body.created).toBeGreaterThanOrEqual(12);
    const c = (await admin.get(`/api/contracts/${id}`)).body.contract;
    expect(c).toMatchObject({kind: 'contrato', status: 'ativo'});
    expect(c.number).toMatch(/^CTR-/);
    const ch = (await admin.get(`/api/charges?contract_id=${id}`)).body as {description: string; total_cents: number; due_date: string}[];
    expect(ch.find((x) => x.description.startsWith('Implantação'))).toMatchObject({total_cents: 135180, due_date: '2026-10-25'});
    expect(ch.filter((x) => x.description === 'Mensalidade').every((x) => x.total_cents === 14800)).toBe(true);
    expect((await post(`/api/contracts/${id}/approve-and-activate`, {confirm: true, signed_at: '2026-10-20'})).status).toBe(409); // não repete
  });
});

describe('importar contrato em PDF (fictício) → conferir → cadastrar', () => {
  it('lê o PDF, reconhece cliente, CPF/CNPJ e valores e cadastra após a confirmação', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'argos-imp-'));
    const gab = await gerar(dir);
    const g = gab[2]!; // Prefeitura (órgão público, com processo e empenho)
    const r = await upload(g.file, fs.readFileSync(path.join(dir, g.file)));
    expect(r.status).toBe(201);
    const e = r.body.extraction;
    const v = (k: string) => e.fields.find((f: {key: string}) => f.key === k)?.value;
    expect(v('client_document')).toBe(g.document);
    expect(v('client_name')).toBe(g.name);
    expect(v('commitment_number')).toBe(g.empenho);
    expect(e.items).toHaveLength(g.items.length);
    const body = confirmBody({
      client: {kind: 'orgao_publico', name: g.name, document: g.document, status: 'ativo'},
      contract: {kind: 'contrato', object: 'Gestão de protocolos', signed_at: g.signed_at, start_date: g.start_date, end_date: null, due_day: g.due_day, adjustment_index: g.adjustment_index, payment_terms: 'OB após liquidação', fine_percent: g.fine, interest_monthly_percent: g.interest, is_public_flow: true, administrative_process: g.process, commitment_number: g.empenho, notes: null},
      items: e.items.map((i: {kind: string; description: string; billing_type: string; amount_cents: number; quantity: number; installments: number | null; interval_months: number}) => ({kind: i.kind, description: i.description, billing_type: i.billing_type, unit_amount_cents: i.amount_cents, quantity: i.quantity, installments: i.installments, interval_months: i.interval_months, first_due_date: '2026-11-30', discount_cents: 0}))
    });
    const c = await post(`/api/imports/${r.body.import.id}/confirm`, body);
    expect(c.status).toBe(201);
    const doc = await env.db.query("select count(*)::int as n from documents where kind = 'contrato_original' and sha256 is not null");
    expect(doc.rows[0].n).toBeGreaterThanOrEqual(3); // originais preservados
  });
});
