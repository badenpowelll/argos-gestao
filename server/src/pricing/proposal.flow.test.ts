import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {createTestEnv, H} from '../test/helpers.js';
import {proposalContentSchema, defaultContent, type ProposalContent} from './content.js';
import {fetchEcbRates} from './data.js';
import {validatePixPayload} from './pix.js';

let env: Awaited<ReturnType<typeof createTestEnv>>;
let admin: ReturnType<typeof request.agent>;
const post = (a: ReturnType<typeof request.agent>, url: string, body: unknown = {}) => a.post(url).set(H).send(body as object);
const put = (a: ReturnType<typeof request.agent>, url: string, body: unknown) => a.put(url).set(H).send(body as object);
const patch = (a: ReturnType<typeof request.agent>, url: string, body: unknown) => a.patch(url).set(H).send(body as object);
const binary = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); };
const pdfText = async (buf: Buffer) => (await pdfParse(buf)).text.replace(/[ \t]*\r?\n[ \t]*/g, ' ');

let catalog: Record<string, string> = {};
const cat = (name: string) => catalog[name] as string;

/** Conteúdo equivalente à proposta PDV ATEC (17/10/2026). */
function atecContent(): ProposalContent {
  const c = defaultContent({hourly_rate_cents: 4000, validity_days: 15, default_margin_pct: 20}, 'PDV ATEC — frente de caixa e gestão de loja');
  c.identification.commercial_owner = 'Danielle Sheila de Melo França';
  c.scope = {summary: 'Desenvolvimento, implantação e licença de uso do sistema PDV ATEC, hospedado e mantido pela Argos Soluções.', groups: [
    {title: 'Frente de caixa', items: ['Venda com pagamento misto e troco', 'Abertura, sangria e fechamento de caixa']},
    {title: 'Estoque e financeiro', items: ['Produtos, fotos e estoque mínimo', 'Contas a receber e despesas']},
    {title: 'Banco de dados e segurança', items: ['Banco Postgres na nuvem', 'Login com senha criptografada e perfis', 'Auditoria e backup']}]};
  c.schedule.deadline = '24 horas de implementação e desenvolvimento, mais 2 h de treinamento da equipe';
  c.schedule.domain = 'Domínio .com.br (3 anos) e e-mail profissional (4 anos) na Hostinger, pagos pela loja na entrada';
  c.calc.one_time_lines = [
    {id: 'l1', label: 'Implementação e desenvolvimento do sistema', category: 'desenvolvimento', hours: 24, discount: {type: 'pct', value: 50}},
    {id: 'l2', label: 'Registro do programa de computador no INPI', category: 'registro', amount_cents: 24000},
    {id: 'l3', label: 'Treinamento da equipe', category: 'treinamento', hours: 2}
  ];
  c.calc.one_time_catalog = [
    {catalog_item_id: cat('Lovable Pro'), category: 'ferramentas', mode: 'months', months: 1},
    {catalog_item_id: cat('Claude Pro'), category: 'ferramentas', mode: 'months', months: 1},
    {catalog_item_id: cat('Domínio .com.br (3 anos)'), category: 'dominio_email', mode: 'period', months: 1},
    {catalog_item_id: cat('E-mail Starter Business (4 anos)'), category: 'dominio_email', mode: 'period', months: 1}
  ];
  c.calc.recurring_catalog = [
    {catalog_item_id: cat('Lovable Pro'), category: 'ferramentas', mode: 'months', months: 1},
    {catalog_item_id: cat('Lovable Cloud'), category: 'infraestrutura', mode: 'months', months: 1},
    {catalog_item_id: cat('Claude Pro'), category: 'suporte', mode: 'months', months: 1}
  ];
  c.calc.license = {mode: 'monthly_fixed', value: 9987};
  c.calc.pricing = {method: 'margin', margin_pct: 20, markup_pct: null, manual_price_cents: null};
  c.calc.recurring_pricing = {method: 'markup', margin_pct: null, markup_pct: 0, manual_price_cents: null};
  c.payment.options = [
    {id: 'opt-1', type: 'entrada_mensalidades', label: 'Opção 1: entrada à vista (Pix ou transferência na assinatura)', include_first_monthly: true},
    {id: 'opt-2', type: 'cartao', label: 'Opção 2: primeiro ano no cartão de crédito em 10x', base: 'primeiro_ano', installments: 10, fee_pct: 10.57, fee_passed: true, include_first_monthly: true}
  ];
  c.out_of_scope = ['Novas funcionalidades, emissão de nota fiscal (NFC-e) e envio automático pelo WhatsApp (API oficial) são orçados e aprovados por escrito antes da execução.'];
  c.conditions = ['Dados e LGPD: a loja é controladora dos dados e a Argos é operadora (Lei 13.709/2018).', 'Reajuste: a cada 12 meses da implantação, a mensalidade é corrigida pelo IPCA acumulado (IBGE).'];
  return proposalContentSchema.parse(c);
}

beforeAll(async () => {
  env = await createTestEnv();
  admin = request.agent(env.app);
  await post(admin, '/api/auth/setup', {name: 'Admin Teste', email: 'admin@teste.com', password: 'SenhaForte123'});
  const items = (await admin.get('/api/pricing/catalog')).body as {id: string; name: string}[];
  catalog = Object.fromEntries(items.map((i) => [i.name, i.id]));
  await post(admin, '/api/pricing/fx', {currency: 'USD', rate: 5.5, as_of: '2026-10-17', source: 'referência da proposta PDV ATEC'});
});
afterAll(async () => { await env?.cleanup(); });

describe('catálogo, câmbio e tributos', () => {
  it('o catálogo inicial traz os itens pedidos; só o que foi verificado tem preço', async () => {
    const items = (await admin.get('/api/pricing/catalog')).body as {name: string; price_cents: number | null; price_verified: boolean; currency: string}[];
    const by = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(by['Hetzner CX33']).toMatchObject({price_cents: 849, currency: 'EUR', price_verified: true});
    for (const n of ['ChatGPT', 'Railway', 'Hetzner — backups automáticos', 'Hetzner — IPv4 primário', 'Hetzner — Storage Box BX11', 'Cloudflare Pages', 'Cloudflare Edge / Workers', 'Cloudflare Turnstile']) {
      expect(by[n]?.price_cents).toBeNull();
      expect(by[n]?.price_verified).toBe(false);
    }
  });
  it('não permite marcar como verificado sem preço', async () => {
    expect((await patch(admin, `/api/pricing/catalog/${cat('ChatGPT')}`, {price_verified: true})).status).toBe(422);
  });
  it('tributo só vale depois de validado; alterar a alíquota revoga a validação', async () => {
    expect((await admin.get('/api/pricing/tax')).body.current).toBeNull();
    const t = await post(admin, '/api/pricing/tax', {name: 'Configuração de teste', regime: 'Teste', initial_rate_pct: 0, recurring_rate_pct: 0, valid_from: '2026-01-01'});
    expect(t.status).toBe(201);
    expect((await admin.get('/api/pricing/tax')).body.current).toBeNull(); // criada ≠ validada
    expect((await post(admin, `/api/pricing/tax/${t.body.id}/validate`, {validated_by_name: 'Contador Teste', validation_ref: 'Parecer 1/2026'})).status).toBe(422); // sem confirm
    expect((await post(admin, `/api/pricing/tax/${t.body.id}/validate`, {validated_by_name: 'Contador Teste', validation_ref: 'Parecer 1/2026', confirm: true})).status).toBe(200);
    expect((await admin.get('/api/pricing/tax')).body.current?.id).toBe(t.body.id);
    await patch(admin, `/api/pricing/tax/${t.body.id}`, {initial_rate_pct: 6});
    expect((await admin.get('/api/pricing/tax')).body.current).toBeNull(); // revogada
    await patch(admin, `/api/pricing/tax/${t.body.id}`, {initial_rate_pct: 0});
    await post(admin, `/api/pricing/tax/${t.body.id}/validate`, {validated_by_name: 'Contador Teste', validation_ref: 'Parecer 2/2026', confirm: true});
    expect((await admin.get('/api/pricing/tax')).body.current?.initial_rate_pct).toBe(0);
  });
  it('cotação: manual registrada com fonte; consulta oficial (BCE) tratada com cliente HTTP simulado', async () => {
    const fx = (await admin.get('/api/pricing/fx')).body.latest as {currency: string; rate: number}[];
    expect(fx.find((x) => x.currency === 'USD')?.rate).toBe(5.5);
    const fake = (async (url: string) => ({ok: true, status: 200, json: async () => ({date: '2026-10-16', rates: {BRL: url.includes('base=EUR') ? 6.4 : 5.4}})})) as unknown as typeof fetch;
    const r = await fetchEcbRates(fake);
    expect(r).toEqual([expect.objectContaining({currency: 'EUR', rate: 6.4, as_of: '2026-10-16'}), expect.objectContaining({currency: 'USD', rate: 5.4})]);
    await expect(fetchEcbRates((async () => ({ok: false, status: 503})) as unknown as typeof fetch)).rejects.toThrow(/indisponível/);
  });
  it('link de avaliação do Google: só endereços oficiais do Google; nunca inventado', async () => {
    expect((await patch(admin, '/api/pricing/profile', {google_review_url: 'https://exemplo.com/avalie'})).status).toBe(422);
    expect((await admin.get('/api/pricing/profile')).body.google_review_url).toBeNull();
  });
});

describe('simulador reproduz a proposta PDV ATEC', () => {
  it('R$ 1.081,44 → projeto R$ 1.351,80; mensalidade R$ 148,00; entrada R$ 1.499,80; cartão 10 × R$ 349,75', async () => {
    const r = await post(admin, '/api/pricing/simulate', {content: atecContent()});
    expect(r.status).toBe(200);
    const c = r.body;
    expect(c.result.one_time.cost_cents).toBe(108144);
    expect(c.result.one_time.price_final_cents).toBe(135180);
    expect(c.result.one_time.margin_pct).toBe(20);
    expect(c.result.recurring.price_final_cents).toBe(14800);
    expect(c.totals.entry_cents).toBe(149980);
    expect(c.payments[1].total_cents).toBe(349748);
    expect(c.result.blocking_open).toEqual([]);
    expect(c.fx_used[0]).toMatchObject({currency: 'USD', rate: 5.5});
  });
  it('sem tributação validada o simulador bloqueia; sem ack de prejuízo também', async () => {
    await patch(admin, `/api/pricing/tax/${(await admin.get('/api/pricing/tax')).body.configs[0].id}`, {active: false});
    const r = await post(admin, '/api/pricing/simulate', {content: atecContent()});
    expect(r.body.result.blocking_open).toContain('tax_unconfigured');
    await patch(admin, `/api/pricing/tax/${(await admin.get('/api/pricing/tax')).body.configs[0].id}`, {active: true});
    expect((await post(admin, '/api/pricing/simulate', {content: atecContent()})).body.result.blocking_open).toEqual([]);
  });
});

describe('proposta: rascunho → PDF → emissão → versões → aprovação → contrato → cobranças', () => {
  let pid = '';
  it('cria a proposta para um cliente novo (dados do cliente) e já vem com valor/hora R$ 35 e 15 dias', async () => {
    const r = await post(admin, '/api/proposals', {client: {name: 'ATECH RN', document: null, address: 'Av. Ayrton Senna, 2020, Nova Parnamirim, Parnamirim/RN'}, project_name: 'PDV ATEC', commercial_owner: 'Danielle'});
    expect(r.status).toBe(201);
    pid = r.body.id;
    expect(r.body.number).toMatch(/^PROP-\d{4}-0001$/);
    const g = (await admin.get(`/api/proposals/${pid}`)).body;
    expect(g.version.content.calc.hourly_rate_cents).toBe(3500);
    expect(g.version.content.identification.validity_days).toBe(15);
    expect(g.computed.result.one_time.cost_by_category.desenvolvimento).toBe(84000); // 24 h × R$ 35,00 = R$ 840,00
  });
  it('salva o rascunho e registra no histórico quem alterou os valores (antes/depois)', async () => {
    const r = await put(admin, `/api/proposals/${pid}/draft`, {content: atecContent(), change_note: 'Valores da proposta PDV ATEC'});
    expect(r.status).toBe(200);
    expect(r.body.computed.totals.one_time_final_cents).toBe(135180);
    const h = (await admin.get(`/api/proposals/${pid}`)).body.history as {action: string; user_name: string; detail: {before: {one_time_cents: number}; after: {one_time_cents: number}}}[];
    const upd = h.find((x) => x.action === 'proposal.update')!;
    expect(upd.user_name).toBe('Admin Teste');
    expect(upd.detail.before.one_time_cents).toBe(105000); // 24 h × R$ 35 = R$ 840 de custo → R$ 1.050,00 com margem de 20% (valor anterior preservado)
    expect(upd.detail.after.one_time_cents).toBe(135180);
  });
  it('pré-visualização em PDF de rascunho (marcada como rascunho)', async () => {
    const r = await admin.get(`/api/proposals/${pid}/pdf`).buffer(true).parse(binary);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    const t = await pdfText(r.body as Buffer);
    expect(t).toContain('RASCUNHO');
    expect(t).toContain('PROPOSTA COMERCIAL');
  });
  it('operador não emite; emissão exige confirmação', async () => {
    await post(admin, '/api/users', {name: 'Operador', email: 'op@teste.com', role: 'operador', password: 'SenhaOperador1'});
    const op = request.agent(env.app);
    await post(op, '/api/auth/login', {email: 'op@teste.com', password: 'SenhaOperador1'});
    expect((await post(op, `/api/proposals/${pid}/issue`, {confirm: true})).status).toBe(403);
    expect((await post(admin, `/api/proposals/${pid}/issue`, {})).status).toBe(422);
  });
  it('emite: PDF oficial com seções, valores, dados bancários e Pix válido; margem/tributos ficam ocultos', async () => {
    const r = await post(admin, `/api/proposals/${pid}/issue`, {confirm: true});
    expect(r.status).toBe(200);
    expect(r.body.google_qr).toBe(false); // sem link configurado, nada de QR do Google
    const pdf = await admin.get(`/api/proposals/${pid}/pdf`).buffer(true).parse(binary);
    const t = await pdfText(pdf.body as Buffer);
    for (const s of ['IDENTIFICAÇÃO DA PROPOSTA', 'OBJETO E ESCOPO', 'PRAZO E INFRAESTRUTURA', 'INVESTIMENTO E FORMA DE PAGAMENTO', 'FORA DO ESCOPO', 'DADOS PARA PAGAMENTO', 'CONDIÇÕES', 'ASSINATURAS',
      'VALOR DO PROJETO', 'R$ 1.351,80', 'TOTAL DA ENTRADA', 'R$ 1.499,80', 'R$ 3.497,48', 'R$ 148,00', '65.305.027/0001-38', 'Itaú Unibanco (341)', '7087 / 98943-5', '65305027000138',
      '16596a82-a0ae-4de7-98ab-9e487c7e74f9', 'página 1 de', 'ATECH RN']) expect(t, s).toContain(s);
    expect(t).not.toContain('SUBTOTAL DE CUSTOS'); // visão interna
    expect(t).not.toContain('Margem de lucro');
    expect(t).not.toContain('CUSTO DE INFRAESTRUTURA');
    expect(t).not.toContain('Avalie nossa empresa'); // link do Google não configurado
    const snap = (await env.db.query("select snapshots->>'pix_payload' as p from proposal_versions where proposal_id = $1 and version = 1", [pid])).rows[0].p as string;
    expect(t).toContain(snap); // o código copia-e-cola impresso é o mesmo validado na emissão
    const v = validatePixPayload(snap);
    expect(v.valid).toBe(true);
    expect(v.fields.amount).toBe('1499.80'); // valor da opção 1
  });
  it('versão emitida é congelada: nova cotação/custo NÃO altera a proposta; edição direta é recusada', async () => {
    await post(admin, '/api/pricing/fx', {currency: 'USD', rate: 9.9, as_of: '2026-10-18', source: 'teste de alteração de câmbio'});
    await patch(admin, `/api/pricing/catalog/${cat('Claude Pro')}`, {price_cents: 99900});
    const g = (await admin.get(`/api/proposals/${pid}`)).body;
    expect(g.version.status).toBe('emitida');
    expect(g.computed.totals.one_time_final_cents).toBe(135180);
    expect(g.computed.totals.monthly_final_cents).toBe(14800);
    expect((await put(admin, `/api/proposals/${pid}/draft`, {content: atecContent()})).status).toBe(409);
    await expect(env.db.query("update proposal_versions set content = '{}'::jsonb where status = 'emitida'")).rejects.toThrow(/imutável/);
    await expect(env.db.query("delete from proposal_versions where status = 'emitida'")).rejects.toThrow(/não pode ser excluída/);
    // restaura para os testes seguintes
    await patch(admin, `/api/pricing/catalog/${cat('Claude Pro')}`, {price_cents: 2000});
    await post(admin, '/api/pricing/fx', {currency: 'USD', rate: 5.5, as_of: '2026-10-19', source: 'restauração do teste'});
  });
  it('nova versão exige justificativa, preserva a anterior e volta a rascunho', async () => {
    expect((await post(admin, `/api/proposals/${pid}/new-version`, {change_note: ''})).status).toBe(422);
    const r = await post(admin, `/api/proposals/${pid}/new-version`, {change_note: 'Cliente pediu desconto'});
    expect(r.body.version).toBe(2);
    const g = (await admin.get(`/api/proposals/${pid}`)).body;
    expect(g.proposal.status).toBe('rascunho');
    expect(g.versions.map((v: {version: number; status: string}) => `${v.version}:${v.status}`)).toEqual(['2:rascunho', '1:emitida']);
    const old = (await admin.get(`/api/proposals/${pid}?version=1`)).body;
    expect(old.computed.totals.one_time_final_cents).toBe(135180);
  });
  it('desconto abaixo do custo bloqueia a emissão até confirmação explícita', async () => {
    const c = atecContent();
    c.calc.discount = {type: 'amount', value: 100000}; // preço final R$ 351,80 < custo R$ 1.081,44
    await put(admin, `/api/proposals/${pid}/draft`, {content: c, change_note: 'desconto agressivo'});
    const blocked = await post(admin, `/api/proposals/${pid}/issue`, {confirm: true});
    expect(blocked.status).toBe(422);
    expect(blocked.body.details.blocking.map((a: {code: string}) => a.code)).toContain('below_cost');
    c.calc.acks.below_cost = true;
    await put(admin, `/api/proposals/${pid}/draft`, {content: c, change_note: 'confirmado abaixo do custo'});
    const ok = await post(admin, `/api/proposals/${pid}/issue`, {confirm: true});
    expect(ok.status).toBe(200);
    expect((await admin.get(`/api/proposals/${pid}`)).body.computed.result.one_time.price_final_cents).toBe(35180);
  });
});

describe('visibilidade controlada e QR do Google', () => {
  let pid = '';
  it('só mostra margem, rateios e infraestrutura com autorização expressa', async () => {
    await patch(admin, '/api/pricing/profile', {google_review_url: 'https://g.page/r/CwExemploDeTeste/review'});
    pid = (await post(admin, '/api/proposals', {client: {name: 'Cliente Visibilidade'}, project_name: 'Teste visibilidade'})).body.id;
    const c = atecContent();
    c.visibility = {...c.visibility, show_margin: true, show_infra_table: true, show_support_table: true, show_monthly_breakdown: true, show_tools_allocation: true, internal_disclosure_authorized: false};
    await put(admin, `/api/proposals/${pid}/draft`, {content: c});
    let t = await pdfText((await admin.get(`/api/proposals/${pid}/pdf`).buffer(true).parse(binary)).body as Buffer);
    expect(t).not.toContain('SUBTOTAL DE CUSTOS');
    expect(t).not.toContain('CUSTO DE INFRAESTRUTURA');
    expect(t).toContain('Avalie nossa empresa no Google'); // link oficial configurado
    c.visibility.internal_disclosure_authorized = true;
    await put(admin, `/api/proposals/${pid}/draft`, {content: c});
    t = await pdfText((await admin.get(`/api/proposals/${pid}/pdf`).buffer(true).parse(binary)).body as Buffer);
    for (const s of ['SUBTOTAL DE CUSTOS', 'R$ 1.081,44', 'Margem de lucro', 'R$ 270,36', 'CUSTO DE INFRAESTRUTURA', 'CUSTO DE MANUTENÇÃO / SUPORTE', 'Lovable Pro']) expect(t, s).toContain(s);
  });
});

describe('envio ao cliente por WhatsApp', () => {
  let pid = '';
  let clientId = '';
  let url = '';
  it('só proposta emitida pode ser compartilhada (rascunho é recusado)', async () => {
    clientId = (await post(admin, '/api/clients', {kind: 'empresa_privada', name: 'Cliente WhatsApp', whatsapp: '(84) 99999-1111', responsible_name: 'Maria'})).body.id;
    pid = (await post(admin, '/api/proposals', {client_id: clientId, project_name: 'PDV Envio'})).body.id;
    await put(admin, `/api/proposals/${pid}/draft`, {content: atecContent()});
    expect((await post(admin, `/api/proposals/${pid}/share`, {confirm: true})).status).toBe(409);
    expect((await admin.get(`/api/proposals/${pid}/whatsapp`)).status).toBe(409);
    expect((await post(admin, `/api/proposals/${pid}/issue`, {confirm: true})).status).toBe(200);
  });
  it('gera link secreto: serve o PDF sem login, conta visualizações, guarda só o hash e pode ser revogado', async () => {
    expect((await post(admin, `/api/proposals/${pid}/share`, {})).status).toBe(422); // exige confirmação
    const s = await post(admin, `/api/proposals/${pid}/share`, {confirm: true});
    expect(s.status).toBe(201);
    url = s.body.url;
    expect(url).toMatch(/\/p\/[A-Za-z0-9_-]{40,}$/);
    const token = url.split('/p/')[1] as string;
    const pub = await request(env.app).get(`/p/${token}`).buffer(true).parse(binary); // sem cookie de sessão
    expect(pub.status).toBe(200);
    expect(pub.headers['content-type']).toBe('application/pdf');
    expect(pub.headers['x-robots-tag']).toContain('noindex');
    expect((pub.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await env.db.query('select count(*)::int as n from proposal_shares where token_hash = $1', [token])).rows[0].n).toBe(0); // token em claro não é guardado
    expect((await admin.get(`/api/proposals/${pid}/shares`)).body[0].views).toBe(1);
    expect((await request(env.app).get('/p/token-que-nao-existe-123456789')).status).toBe(404);
    const shareId = (await admin.get(`/api/proposals/${pid}/shares`)).body[0].id;
    expect((await post(admin, `/api/proposals/${pid}/shares/${shareId}/revoke`)).status).toBe(200);
    expect((await request(env.app).get(`/p/${token}`)).status).toBe(404); // revogado
  });
  it('link expirado deixa de funcionar', async () => {
    const s = await post(admin, `/api/proposals/${pid}/share`, {confirm: true});
    url = s.body.url;
    await env.db.query("update proposal_shares set expires_at = now() - interval '1 minute' where revoked_at is null");
    expect((await request(env.app).get(`/p/${url.split('/p/')[1]}`)).status).toBe(404);
  });
  it('monta a mensagem para o WhatsApp com número do cliente, valores, validade, link e contato da Argos', async () => {
    const s = await post(admin, `/api/proposals/${pid}/share`, {confirm: true});
    url = s.body.url;
    const w = (await admin.get(`/api/proposals/${pid}/whatsapp?share_url=${encodeURIComponent(url)}`)).body;
    expect(w.phone).toBe('5584999991111'); // do cadastro do cliente
    expect(w.message).toContain('Olá');
    expect(w.message).toContain('Investimento inicial: R$ 1.351,80');
    expect(w.message).toContain('Mensalidade: R$ 148,00');
    expect(w.message).toContain('Validade: até');
    expect(w.message).toContain(url);
    expect(w.message).toContain('(84) 99859-0183');
    expect(w.link).toMatch(/^https:\/\/wa\.me\/5584999991111\?text=/);
    const other = (await admin.get(`/api/proposals/${pid}/whatsapp?phone=${encodeURIComponent('(84) 98888-7777')}`)).body;
    expect(other.phone).toBe('5584988887777'); // número digitado prevalece
    expect((await admin.get(`/api/proposals/${pid}/whatsapp?share_url=${encodeURIComponent('https://evil.example/qualquer')}`)).status).toBe(422);
  });
  it('registrar o envio marca a proposta como enviada e grava no histórico de contatos do cliente', async () => {
    expect((await post(admin, `/api/proposals/${pid}/sent`, {message: 'Proposta enviada'})).status).toBe(422);
    const r = await post(admin, `/api/proposals/${pid}/sent`, {message: 'Proposta enviada por WhatsApp', confirm: true});
    expect(r.body.status).toBe('enviada');
    expect((await admin.get(`/api/clients/${clientId}`)).body.contacts.some((c: {channel: string; message: string}) => c.channel === 'whatsapp' && /Proposta enviada/.test(c.message))).toBe(true);
    expect((await admin.get(`/api/proposals/${pid}`)).body.proposal.status).toBe('enviada');
  });
});

describe('aprovação → contrato → cobranças no PDV', () => {
  let pid = '';
  it('aprova uma proposta emitida: preserva a versão, cria cliente, sistema e contrato em rascunho (sem cobranças)', async () => {
    pid = (await post(admin, '/api/proposals', {client: {name: 'Mercado Aprovado Ltda'}, project_name: 'PDV Mercado'})).body.id;
    await put(admin, `/api/proposals/${pid}/draft`, {content: atecContent()});
    const early = await post(admin, `/api/proposals/${pid}/approve`, {confirm: true, option_id: 'opt-1', signed_at: '2026-10-20', entry_due_date: '2026-10-25', monthly_first_due_date: '2026-11-10', create_client: true});
    expect(early.status).toBe(409); // ainda não emitida
    expect((await post(admin, `/api/proposals/${pid}/issue`, {confirm: true})).status).toBe(200);
    expect((await post(admin, `/api/proposals/${pid}/approve`, {confirm: true, option_id: 'opt-1', signed_at: '2026-10-20', entry_due_date: '2026-10-25', monthly_first_due_date: '2026-11-10'})).status).toBe(422); // sem cliente cadastrado
    const r = await post(admin, `/api/proposals/${pid}/approve`, {confirm: true, option_id: 'opt-1', signed_at: '2026-10-20', entry_due_date: '2026-10-25', monthly_first_due_date: '2026-11-10', due_day: 10, create_client: true});
    expect(r.status).toBe(201);
    const c = (await admin.get(`/api/contracts/${r.body.contract_id}`)).body;
    expect(c.contract.status).toBe('rascunho');
    expect(c.contract.kind).toBe('contrato');
    expect(c.contract.system_id).toBeTruthy();
    expect(c.items.map((i: {billing_type: string; unit_amount_cents: number}) => [i.billing_type, i.unit_amount_cents])).toEqual([['unico', 135180], ['recorrente', 14800]]);
    expect((await env.db.query('select count(*)::int as n from charges where contract_id = $1', [r.body.contract_id])).rows[0].n).toBe(0);
    const p = (await admin.get(`/api/proposals/${pid}`)).body.proposal;
    expect(p).toMatchObject({status: 'aprovada', approved_version: 1, contract_id: r.body.contract_id});
    expect((await post(admin, `/api/proposals/${pid}/approve`, {confirm: true, option_id: 'opt-1', signed_at: '2026-10-20', entry_due_date: '2026-10-25', monthly_first_due_date: '2026-11-10'})).status).toBe(409);
    expect((await post(admin, `/api/proposals/${pid}/new-version`, {change_note: 'tentativa'})).status).toBe(409); // aprovada é preservada
    (globalThis as {contractId?: string}).contractId = r.body.contract_id;
  });
  it('ao ativar o contrato, as cobranças nascem no financeiro (R$ 1.351,80 + mensalidades de R$ 148,00)', async () => {
    const id = (globalThis as {contractId?: string}).contractId as string;
    const a = await post(admin, `/api/contracts/${id}/activate`, {confirm: true});
    expect(a.status).toBe(200);
    const ch = (await admin.get(`/api/charges?contract_id=${id}`)).body as {description: string; total_cents: number}[];
    expect(ch.find((c) => c.description.startsWith('Implantação'))?.total_cents).toBe(135180);
    expect(ch.filter((c) => c.description.startsWith('Mensalidade')).every((c) => c.total_cents === 14800)).toBe(true);
    const list = (await admin.get('/api/proposals')).body as {id: string; display_status: string}[];
    expect(list.find((p) => p.id === pid)?.display_status).toBe('aprovada');
  });
});

