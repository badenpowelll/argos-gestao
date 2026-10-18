import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {createTestEnv, H, makeCnpj} from './test/helpers.js';
import {today, addMonths} from './lib/dates.js';

let env: Awaited<ReturnType<typeof createTestEnv>>;
let admin: ReturnType<typeof request.agent>;
const cnpj = makeCnpj('445556660001');
const fmt = cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');

const CONTRATO = `CONTRATO DE LICENÇA DE USO
CONTRATANTE: PADARIA TESTE LTDA, pessoa jurídica inscrita no CNPJ ${fmt}.
CONTRATADA: ARGOS TERCEIRIZAÇÃO DE MÃO DE OBRA, CONSULTORIA E SOLUÇÕES LTDA, CNPJ 65.305.027/0001-38.
CLÁUSULA 1ª – DO OBJETO
O presente contrato tem por objeto a licença de uso do sistema PDV para a CONTRATANTE.
CLÁUSULA 2ª – DO VALOR
Pela implantação será pago o valor de entrada de R$ 1.499,80. A mensalidade será de R$ 148,00 por mês.
O pagamento da mensalidade será realizado todo dia 10 de cada mês. Multa de 2% e juros de 1% ao mês.
Data de assinatura: 15/10/2026.`;

const firstDue = addMonths(today(), 1).slice(0, 8) + '10';

beforeAll(async () => {
  env = await createTestEnv();
  admin = request.agent(env.app);
});
afterAll(async () => {
  await env?.cleanup();
});

const post = (a: ReturnType<typeof request.agent>, url: string, body: unknown) => a.post(url).set(H).send(body as object);
let contractId = '';
let clientId = '';

describe('autenticação e permissões', () => {
  it('bloqueia acesso sem login', async () => {
    expect((await request(env.app).get('/api/clients')).status).toBe(401);
  });
  it('configuração inicial cria o primeiro admin uma única vez', async () => {
    expect((await request(env.app).get('/api/auth/status')).body.needs_setup).toBe(true);
    const r = await post(admin, '/api/auth/setup', {name: 'Admin Teste', email: 'admin@teste.com', password: 'SenhaForte123'});
    expect(r.status).toBe(201);
    expect((await post(request.agent(env.app), '/api/auth/setup', {name: 'Outro', email: 'x@teste.com', password: 'SenhaForte123'})).status).toBe(409);
  });
  it('rejeita escrita sem o cabeçalho anti-CSRF', async () => {
    expect((await admin.post('/api/clients').send({})).status).toBe(403);
  });
  it('bloqueia a conta após tentativas inválidas', async () => {
    for (let i = 0; i < 5; i++) await post(request.agent(env.app), '/api/auth/login', {email: 'admin@teste.com', password: 'errada-errada1'});
    const r = await post(request.agent(env.app), '/api/auth/login', {email: 'admin@teste.com', password: 'SenhaForte123'});
    expect(r.status).toBe(429);
    await env.db.query("update users set failed_logins = 0, locked_until = null");
  });
});

describe('importar contrato → confirmar → cadastrar', () => {
  let importId = '';
  it('envia o contrato, extrai e NÃO grava nada antes da confirmação', async () => {
    const r = await admin.post('/api/imports').set(H).attach('file', Buffer.from(CONTRATO, 'utf8'), 'contrato-padaria.txt');
    expect(r.status).toBe(201);
    importId = r.body.import.id;
    expect(r.body.extraction.fields.find((f: {key: string}) => f.key === 'client_document').value).toBe(cnpj);
    expect((await admin.get('/api/clients')).body).toHaveLength(0);
    expect((await admin.get('/api/contracts')).body).toHaveLength(0);
    const docs = await env.db.query('select count(*)::int as n from documents where kind = $1', ['contrato_original']);
    expect(docs.rows[0].n).toBe(1); // original preservado
  });
  it('exige a confirmação humana explícita', async () => {
    const r = await post(admin, `/api/imports/${importId}/confirm`, {reviewed: false});
    expect(r.status).toBe(422);
  });
  it('confirma: cria cliente, sistema, contrato (rascunho) e itens', async () => {
    const r = await post(admin, `/api/imports/${importId}/confirm`, {
      reviewed: true,
      client: {kind: 'empresa_privada', name: 'PADARIA TESTE LTDA', document: fmt, whatsapp: '(84) 99999-1111'},
      system: {name: 'PDV Padaria', status: 'em_producao', operational_cost_cents: 2500},
      contract: {kind: 'contrato', object: 'Licença de uso do PDV', signed_at: '2026-10-15', due_day: 10, fine_percent: 2, interest_monthly_percent: 1},
      items: [
        {kind: 'implementacao', description: 'Entrada / implantação', billing_type: 'unico', unit_amount_cents: 149980, first_due_date: firstDue},
        {kind: 'mensalidade', description: 'Mensalidade PDV', billing_type: 'recorrente', unit_amount_cents: 14800, first_due_date: firstDue}
      ]
    });
    expect(r.status).toBe(201);
    contractId = r.body.contract.id;
    clientId = r.body.client_id;
    expect(r.body.contract.status).toBe('rascunho');
    expect((await env.db.query('select count(*)::int as n from charges')).rows[0].n).toBe(0); // sem cobranças antes da ativação
  });
  it('não permite confirmar duas vezes a mesma importação', async () => {
    const r = await post(admin, `/api/imports/${importId}/confirm`, {reviewed: true, client_id: clientId, contract: {kind: 'contrato'}, items: [{kind: 'outro', description: 'x1', billing_type: 'unico', unit_amount_cents: 1}]});
    expect(r.status).toBe(409);
  });
  it('rejeita CNPJ inválido no cadastro', async () => {
    const r = await post(admin, '/api/clients', {kind: 'empresa_privada', name: 'Inválida', document: '11.222.333/0001-99'});
    expect(r.status).toBe(422);
  });
  it('documento duplicado é recusado', async () => {
    const r = await post(admin, '/api/clients', {kind: 'empresa_privada', name: 'Duplicada', document: cnpj});
    expect(r.status).toBe(409);
  });
});

describe('proposta não gera cobrança', () => {
  it('bloqueia ativação e geração para propostas', async () => {
    const p = await post(admin, '/api/contracts', {
      contract: {client_id: clientId, kind: 'proposta'},
      items: [{kind: 'implementacao', description: 'Implantação', billing_type: 'unico', unit_amount_cents: 48000, first_due_date: firstDue}]
    });
    expect(p.status).toBe(201);
    expect((await post(admin, `/api/contracts/${p.body.id}/activate`, {confirm: true})).status).toBe(409);
    expect((await post(admin, `/api/contracts/${p.body.id}/generate-charges`, {})).status).toBe(409);
  });
});

describe('ativação e geração de cobranças', () => {
  it('exige confirmação explícita', async () => {
    expect((await post(admin, `/api/contracts/${contractId}/activate`, {})).status).toBe(422);
  });
  it('ativa e gera cobranças; reexecutar não duplica', async () => {
    const r = await post(admin, `/api/contracts/${contractId}/activate`, {confirm: true});
    expect(r.status).toBe(200);
    expect(r.body.created).toBeGreaterThanOrEqual(12);
    const again = await post(admin, `/api/contracts/${contractId}/generate-charges`, {});
    expect(again.body.created).toBe(0);
    const n = (await env.db.query('select count(*)::int as n, count(distinct dedupe_key)::int as d from charges')).rows[0];
    expect(n.n).toBe(n.d);
  });
  it('gera duas ativações concorrentes sem duplicar cobranças', async () => {
    const before = (await env.db.query('select count(*)::int as n from charges')).rows[0].n;
    await Promise.all([post(admin, `/api/contracts/${contractId}/generate-charges`, {horizon_months: 18}), post(admin, `/api/contracts/${contractId}/generate-charges`, {horizon_months: 18})]);
    const after = (await env.db.query('select count(*)::int as n, count(distinct dedupe_key)::int as d from charges')).rows[0];
    expect(after.n).toBe(after.d);
    expect(after.n).toBeGreaterThan(before);
  });
});

describe('PDV: receber e dar baixa', () => {
  let impl: {id: string; total_cents: number};
  let monthly: {id: string};
  it('lista cobranças com status derivado', async () => {
    const r = await admin.get(`/api/charges?client_id=${clientId}`);
    impl = r.body.find((c: {description: string}) => c.description.startsWith('Entrada'));
    monthly = r.body.find((c: {description: string}) => c.description === 'Mensalidade PDV');
    expect(impl.total_cents).toBe(149980);
    expect((await admin.get('/api/charges?view=futuras')).body.length).toBeGreaterThan(0);
  });
  it('exige confirmação e recusa valor acima do saldo', async () => {
    expect((await post(admin, `/api/charges/${impl.id}/receive`, {idempotency_key: 'k-no-confirm-1', lines: [{method: 'pix', amount_cents: 100}]})).status).toBe(422);
    const r = await post(admin, `/api/charges/${impl.id}/receive`, {idempotency_key: 'k-over-0001', confirm: true, lines: [{method: 'pix', amount_cents: 149981}]});
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('overpayment');
  });
  it('pagamento parcial com Pix; depois quitação com dinheiro (múltiplas formas)', async () => {
    const p1 = await post(admin, `/api/charges/${impl.id}/receive`, {idempotency_key: 'k-partial-001', confirm: true, lines: [{method: 'pix', amount_cents: 100000, reference: 'E2E-ABC123'}]});
    expect(p1.status).toBe(201);
    expect(p1.body.charge.status).toBe('parcial');
    const p2 = await post(admin, `/api/charges/${impl.id}/receive`, {idempotency_key: 'k-final-0001', confirm: true, lines: [{method: 'dinheiro', amount_cents: 29980}, {method: 'transferencia', amount_cents: 20000, reference: 'TED 99'}]});
    expect(p2.body.charge.status).toBe('paga');
    expect(p2.body.charge.paid_cents).toBe(149980);
  });
  it('reenvio com a mesma chave NÃO duplica o recebimento', async () => {
    const again = await post(admin, `/api/charges/${impl.id}/receive`, {idempotency_key: 'k-final-0001', confirm: true, lines: [{method: 'dinheiro', amount_cents: 29980}, {method: 'transferencia', amount_cents: 20000}]});
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect((await env.db.query('select count(*)::int as n from payments where charge_id = $1', [impl.id])).rows[0].n).toBe(3);
  });
  it('cobrança quitada não aceita novo recebimento', async () => {
    const r = await post(admin, `/api/charges/${impl.id}/receive`, {idempotency_key: 'k-after-paid1', confirm: true, lines: [{method: 'pix', amount_cents: 100}]});
    expect(r.status).toBe(409);
  });
  it('duas baixas simultâneas do saldo total: só uma é aceita', async () => {
    const rs = await Promise.all(['k-race-aaaaa', 'k-race-bbbbb'].map((k) => post(admin, `/api/charges/${monthly.id}/receive`, {idempotency_key: k, confirm: true, lines: [{method: 'pix', amount_cents: 14800}]})));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await env.db.query('select paid_cents, status from charges where id = $1', [monthly.id])).rows[0]).toMatchObject({paid_cents: 14800, status: 'paga'});
  });
  it('o dashboard reflete o recebido, a recorrência e o pendente', async () => {
    const d = (await admin.get('/api/dashboard')).body;
    expect(d.received_cents).toBe(149980 + 14800);
    expect(d.implementation_received_cents).toBe(149980);
    expect(d.mrr_cents).toBe(14800);
    expect(d.arr_cents).toBe(14800 * 12);
    expect(d.pending_cents).toBeGreaterThan(0);
    expect(d.counts.contracts_active).toBe(1);
    expect(d.infra_cost_cents).toBe(2500);
  });
  it('estorno exige motivo, preserva o pagamento e reabre o saldo', async () => {
    const pays = (await admin.get(`/api/charges/${impl.id}`)).body.payments;
    const pix = pays.find((p: {method: string}) => p.method === 'pix');
    expect((await post(admin, `/api/charges/payments/${pix.id}/reverse`, {reason: 'x', confirm: true})).status).toBe(422);
    const r = await post(admin, `/api/charges/payments/${pix.id}/reverse`, {reason: 'Pix devolvido ao cliente', confirm: true});
    expect(r.status).toBe(200);
    expect(r.body.charge.status).toBe('parcial');
    expect(r.body.charge.paid_cents).toBe(49980);
    expect((await post(admin, `/api/charges/payments/${pix.id}/reverse`, {reason: 'Pix devolvido ao cliente', confirm: true})).status).toBe(409);
    const row = (await env.db.query('select status, reversal_reason from payments where id = $1', [pix.id])).rows[0];
    expect(row).toMatchObject({status: 'estornado', reversal_reason: 'Pix devolvido ao cliente'});
  });
  it('banco impede apagar ou reescrever pagamentos e o log de auditoria', async () => {
    await expect(env.db.query('delete from payments')).rejects.toThrow(/não podem ser excluídos/);
    await expect(env.db.query('update payments set amount_cents = 1')).rejects.toThrow(/imutáveis|estornado/);
    await expect(env.db.query('delete from audit_log')).rejects.toThrow(/imutável/);
  });
  it('a auditoria registra baixa e estorno com operador', async () => {
    const a = await env.db.query("select action, user_name from audit_log where action in ('payment.receive','payment.reverse')");
    expect(a.rows.length).toBeGreaterThanOrEqual(4);
    expect(a.rows.every((x) => x.user_name === 'Admin Teste')).toBe(true);
  });
});

describe('perfis de acesso', () => {
  let operador: ReturnType<typeof request.agent>;
  it('operador recebe, mas não aplica desconto, não estorna e não ativa contratos', async () => {
    await post(admin, '/api/users', {name: 'Operador', email: 'op@teste.com', role: 'operador', password: 'SenhaOperador1'});
    operador = request.agent(env.app);
    expect((await post(operador, '/api/auth/login', {email: 'op@teste.com', password: 'SenhaOperador1'})).status).toBe(200);
    const open = (await operador.get(`/api/charges?client_id=${clientId}&view=abertas`)).body[0];
    const disc = await post(operador, `/api/charges/${open.id}/receive`, {idempotency_key: 'k-op-disc-01', confirm: true, adjustments: {discount_cents: 100}, lines: [{method: 'pix', amount_cents: 100}]});
    expect(disc.status).toBe(403);
    const ok = await post(operador, `/api/charges/${open.id}/receive`, {idempotency_key: 'k-op-ok-0001', confirm: true, lines: [{method: 'pix', amount_cents: 100}]});
    expect(ok.status).toBe(201);
    expect((await post(operador, `/api/charges/payments/${ok.body.payment_ids[0]}/reverse`, {reason: 'teste de permissão', confirm: true})).status).toBe(403);
    expect((await post(operador, `/api/contracts/${contractId}/activate`, {confirm: true})).status).toBe(403);
    expect((await operador.get('/api/users')).status).toBe(403);
  });
  it('perfil leitura não escreve', async () => {
    await post(admin, '/api/users', {name: 'Leitor', email: 'leitor@teste.com', role: 'leitura', password: 'SenhaLeitor12'});
    const leitor = request.agent(env.app);
    await post(leitor, '/api/auth/login', {email: 'leitor@teste.com', password: 'SenhaLeitor12'});
    expect((await leitor.get('/api/dashboard')).status).toBe(200);
    expect((await post(leitor, '/api/clients', {kind: 'pessoa_fisica', name: 'Fulano'})).status).toBe(403);
  });
});

describe('cobrança por WhatsApp e relatórios', () => {
  it('gera mensagem e link com o número do cliente e assinatura da Argos', async () => {
    const open = (await admin.get(`/api/charges?client_id=${clientId}&view=abertas`)).body[0];
    const w = (await admin.get(`/api/charges/${open.id}/whatsapp`)).body;
    expect(w.phone).toBe('5584999991111');
    expect(w.link).toContain('https://wa.me/5584999991111?text=');
    expect(w.message).toContain('(84) 99859-0183');
    expect(w.provider.automatic).toBe(false);
    const log = await post(admin, `/api/charges/${open.id}/contacts`, {channel: 'whatsapp', message: w.message});
    expect(log.status).toBe(201);
    expect((await admin.get(`/api/clients/${clientId}`)).body.contacts).toHaveLength(1);
  });
  it('exporta recebimentos em CSV e PDF', async () => {
    const csv = await admin.get('/api/reports/recebimentos?format=csv');
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('Cliente;');
    expect(csv.text).toContain('PADARIA TESTE LTDA');
    const pdf = await admin.get('/api/reports/lucratividade?format=pdf').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });
  it('rejeita upload com tipo inválido', async () => {
    const r = await admin.post('/api/imports').set(H).attach('file', Buffer.from([0, 1, 2, 3, 0, 0]), 'virus.exe');
    expect(r.status).toBe(415);
  });
});
