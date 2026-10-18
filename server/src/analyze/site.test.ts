import {describe, expect, it} from 'vitest';
import {analyzeSite, apiPathsFromBundle, isPrivateIp, navLabelsFromBundle, parseHtml, routesFromBundle, safeFetch, validateUrlShape, type FetchResult, type Fetcher} from './site.js';

const page = (body: string, headers: Record<string, string> = {}, url = 'https://app.exemplo.com.br/'): FetchResult => ({status: 200, url, headers, body, truncated: false});

describe('proteção contra acesso a rede interna (SSRF)', () => {
  it('bloqueia IPs privados, loopback, link-local e metadados de nuvem', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.10', '172.16.5.5', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1']) expect(isPrivateIp(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '151.101.1.1', '2606:4700::1111']) expect(isPrivateIp(ip), ip).toBe(false);
  });
  it('recusa esquemas, portas, credenciais e hosts internos', () => {
    for (const u of ['file:///etc/passwd', 'ftp://x.com', 'http://localhost/', 'http://127.0.0.1/', 'http://app.local/', 'https://user:pass@x.com/', 'http://x.com:8080/', 'http://[::1]/', 'http://metadata.internal/', 'não é url'])
      expect(() => validateUrlShape(u), u).toThrow();
    expect(validateUrlShape('https://web-production-320061.up.railway.app/propostas/abc').hostname).toBe('web-production-320061.up.railway.app');
  });
  it('a conexão real é bloqueada quando o nome resolve para IP interno', async () => {
    await expect(safeFetch('http://localtest.me/')).rejects.toThrow(); // localtest.me resolve para 127.0.0.1 (ou falha sem rede): nunca conecta
  });
});

describe('extração de HTML', () => {
  const html = `<html lang="pt-BR"><head><title>Painel AH Crédito</title><meta name="description" content="Gestão de empréstimos com cobrança"></head>
    <body><nav><a href="/dash">Dashboard</a><a href="/emp">Empréstimos</a><a href="/cli">Clientes</a></nav>
    <h1>Resumo geral</h1><button>Novo empréstimo</button><label>Valor do empréstimo</label><input placeholder="CPF do cliente">
    <script>var x=1</script></body></html>`;
  it('lê título, descrição, menu, botões, campos e títulos', () => {
    const p = parseHtml(html);
    expect(p.title).toBe('Painel AH Crédito');
    expect(p.description).toBe('Gestão de empréstimos com cobrança');
    expect(p.nav).toEqual(['Dashboard', 'Empréstimos', 'Clientes']);
    expect(p.buttons).toEqual(['Novo empréstimo']);
    expect(p.fields).toEqual(['Valor do empréstimo', 'CPF do cliente']);
    expect(p.headings).toEqual(['Resumo geral']);
    expect(p.lang).toBe('pt-BR');
  });
  it('extrai rotas do pacote JS e ignora ruído (assets, api, arquivos)', () => {
    const js = `route("/clientes");link("/clientes");route("/contratos/:id");go("/contratos");fetch("/api/clients");img("/assets/logo.png");x("/favicon.ico");route("/contas-a-receber")`;
    const r = routesFromBundle(js);
    expect(r).toContain('/clientes');
    expect(r).toContain('/contas-a-receber');
    expect(r).not.toContain('/api/clients');
    expect(r.some((x) => x.includes('assets') || x.includes('favicon'))).toBe(false);
  });
});

describe('análise do sistema pelo link', () => {
  it('usa os rótulos reais do menu (com acento) e ignora rotas de chamadas de API', () => {
    const js = `const N=[{to:"/clientes",text:"Clientes",icon:"users"},{to:"/cobrancas",text:"Contas a receber",icon:"receipt"},{label:"Relatórios",path:"/relatorios"}];api.get("/clients");api.post("/pricing/templates",{});fetch("/api/x");x("/clients");x("/clientes");x("/clientes")`;
    expect(navLabelsFromBundle(js)).toEqual(expect.arrayContaining([{route: '/clientes', label: 'Clientes'}, {route: '/cobrancas', label: 'Contas a receber'}, {route: '/relatorios', label: 'Relatórios'}]));
    expect(apiPathsFromBundle(js).has('/clients')).toBe(true);
    const r = routesFromBundle(js);
    expect(r).toContain('/clientes');
    expect(r).not.toContain('/clients');
    expect(r).not.toContain('/pricing/templates');
  });
  it('SPA com login: deduz telas pelas rotas, detecta Railway e avisa limitações (sem inventar banco/horas)', async () => {
    const shell = `<!doctype html><html lang="pt-BR"><head><title>Argos Gestão 360°</title></head><body><div id="root"></div><script type="module" src="/assets/index-abc.js"></script></body></html>`;
    const bundle = `const r=["/clientes","/contratos","/cobrancas","/pdv","/relatorios"];nav("/clientes");nav("/contratos");nav("/cobrancas");nav("/pdv");nav("/relatorios");import "react-dom";`;
    const fetcher: Fetcher = async (u) => (u.endsWith('.js') ? page(bundle, {}, u) : page(shell, {'x-railway-edge': 'railway/us-west2'}, 'https://web-production-320061.up.railway.app/propostas/f4ec3db2-b40f-441c-a159-31b5f1548f1a'));
    const a = await analyzeSite('https://web-production-320061.up.railway.app/propostas/f4ec3db2-b40f-441c-a159-31b5f1548f1a', fetcher);
    expect(a.spa).toBe(true);
    expect(a.infra.hosting).toBe('Railway');
    expect(a.routes).toEqual(expect.arrayContaining(['/clientes', '/contratos', '/cobrancas', '/pdv', '/relatorios']));
    const modules = a.suggestion.groups.find((g) => g.title.startsWith('Telas'))!.items;
    expect(modules).toEqual(expect.arrayContaining(['Clientes', 'Contratos', 'Cobrancas', 'Pdv', 'Relatorios']));
    expect(a.stack).toContain('React');
    expect(a.suggestion.schedule.hosting).toBe('Railway');
    expect(a.suggestion.schedule.database).toBeNull(); // não detectável: manual
    expect(a.limitations.join(' ')).toMatch(/atrás de login/);
    expect(a.limitations.join(' ')).toMatch(/Banco de dados, horas e prazo/);
  });
  it('página pública: usa menu, botões, campos; detecta Cloudflare e domínio .com.br', async () => {
    const html = `<html><head><title>Loja Teste</title><meta name="description" content="Frente de caixa e estoque"></head><body><nav><a>Vendas</a><a>Estoque</a></nav><h1>Bem-vindo à Loja Teste, sistema completo</h1><p>${'texto '.repeat(60)}</p><button>Abrir caixa</button></body></html>`;
    const a = await analyzeSite('https://loja.exemplo.com.br/', async () => page(html, {'cf-ray': 'abc', server: 'cloudflare'}, 'https://loja.exemplo.com.br/'));
    expect(a.spa).toBe(false);
    expect(a.infra).toMatchObject({cdn: 'Cloudflare', br_domain: true, https: true});
    expect(a.suggestion.summary).toContain('Frente de caixa e estoque');
    expect(a.suggestion.groups[0]?.items).toEqual(['Vendas', 'Estoque']);
    expect(a.suggestion.schedule.domain).toContain('.br');
    expect(a.evidence.length).toBeGreaterThan(2); // toda sugestão traz evidência
  });
  it('detecta Supabase como banco quando há evidência no código', async () => {
    const shell = `<html><head><title>App</title></head><body><div id="root"></div><script src="/a.js"></script></body></html>`;
    const a = await analyzeSite('https://app.lovable.app/', async (u) => (u.endsWith('a.js') ? page(`createClient("https://abcdefghij.supabase.co","k");"/clientes";"/clientes"`, {}, u) : page(shell, {}, 'https://app.lovable.app/')));
    expect(a.stack).toEqual(expect.arrayContaining(['Supabase (Postgres)', 'Lovable']));
    expect(a.suggestion.schedule.database).toBe('Supabase (Postgres)');
    expect(a.infra.hosting).toBe('Lovable');
  });
  it('recusa URL interna sem sequer buscar', async () => {
    await expect(analyzeSite('http://169.254.169.254/latest/meta-data', async () => { throw new Error('não deveria buscar'); })).rejects.toThrow(/interno/);
  });
});
