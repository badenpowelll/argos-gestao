/**
 * Análise automática de um sistema pelo link (para sugerir escopo, módulos, infraestrutura).
 *
 * Segurança (SSRF): só http/https nas portas padrão; todo IP resolvido é validado NO MOMENTO DA CONEXÃO
 * (bloqueia loopback, rede privada, link-local, metadados de nuvem); redirecionamentos são revalidados salto a salto;
 * limite de tamanho/tempo; sem cookies/credenciais.
 *
 * Honestidade: tudo é SUGESTÃO com evidência. Conteúdo atrás de login não é visível; banco de dados, horas e prazos
 * não são detectáveis pelo link e ficam para preenchimento manual.
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import {Agent, fetch as undiciFetch} from 'undici';

export interface FetchResult {status: number; url: string; headers: Record<string, string>; body: string; truncated: boolean}
export type Fetcher = (url: string) => Promise<FetchResult>;

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::') return true;
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1] as string);
    return /^f[cd]/.test(l) || /^fe[89ab]/.test(l) || l.startsWith('ff');
  }
  return true;
}

export class UnsafeUrlError extends Error {}

export function validateUrlShape(raw: string): URL {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new UnsafeUrlError('Endereço inválido'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new UnsafeUrlError('Use um link http:// ou https://');
  if (u.username || u.password) throw new UnsafeUrlError('O link não pode conter usuário/senha');
  if (u.port && u.port !== '80' && u.port !== '443') throw new UnsafeUrlError('Somente as portas padrão (80/443) são permitidas');
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // IPv6 literal vem entre colchetes
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local') || (net.isIP(h) && isPrivateIp(h))) throw new UnsafeUrlError('Endereço interno não é permitido');
  return u;
}

const guardedAgent = new Agent({
  connect: {
    lookup: ((hostname: string, opts: {all?: boolean}, cb: (err: Error | null, a?: unknown, f?: number) => void) => {
      dns.lookup(hostname, {all: true}).then((addrs) => {
        if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return cb(new UnsafeUrlError('O endereço resolve para uma rede interna'));
        if (opts.all) cb(null, addrs);
        else cb(null, addrs[0]!.address, addrs[0]!.family);
      }).catch((e: Error) => cb(e));
    }) as never
  }
});

export async function safeFetch(rawUrl: string, opts: {maxBytes?: number; timeoutMs?: number; maxRedirects?: number} = {}): Promise<FetchResult> {
  const maxBytes = opts.maxBytes ?? 1_500_000;
  let url = validateUrlShape(rawUrl);
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const res = await undiciFetch(url, {
      dispatcher: guardedAgent, redirect: 'manual', signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      headers: {'user-agent': 'ArgosGestaoBot/1.0 (+analise de escopo; sem credenciais)', accept: 'text/html,application/xhtml+xml,text/javascript,*/*;q=0.5'}
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    if (res.status >= 300 && res.status < 400 && headers.location) {
      url = validateUrlShape(new URL(headers.location, url).toString()); // revalida cada salto
      await res.body?.cancel();
      continue;
    }
    let size = 0;
    const chunks: Buffer[] = [];
    let truncated = false;
    if (res.body) {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > maxBytes) { truncated = true; await res.body.cancel(); break; }
        chunks.push(Buffer.from(chunk));
      }
    }
    return {status: res.status, url: url.toString(), headers, body: Buffer.concat(chunks).toString('utf8'), truncated};
  }
  throw new UnsafeUrlError('Redirecionamentos demais');
}

// ---------------------------------------------------------------- extração
const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const clean = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const uniq = (a: string[], max: number) => [...new Set(a.filter(Boolean))].slice(0, max);

export interface Parsed {
  title: string | null; description: string | null; lang: string | null; headings: string[]; nav: string[]; buttons: string[]; links: string[];
  fields: string[]; hasPassword: boolean; scripts: string[]; bodyTextLength: number; generator: string | null;
}

export function parseHtml(html: string): Parsed {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const m = (re: RegExp) => re.exec(html)?.[1];
  const meta = (name: string) => m(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i')) ?? m(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, 'i'));
  const all = (re: RegExp, g = 1) => [...noScript.matchAll(re)].map((x) => clean(x[g] as string));
  const navBlocks = [...noScript.matchAll(/<(?:nav|aside)[\s\S]*?<\/(?:nav|aside)>/gi)].map((x) => x[0]);
  const nav = navBlocks.flatMap((b) => [...b.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((x) => clean(x[1] as string)));
  const fields = [
    ...all(/<label\b[^>]*>([\s\S]*?)<\/label>/gi),
    ...[...noScript.matchAll(/<(?:input|textarea)\b[^>]*placeholder=["']([^"']+)["']/gi)].map((x) => decode(x[1] as string)),
    ...[...noScript.matchAll(/<(?:input|select|textarea)\b[^>]*aria-label=["']([^"']+)["']/gi)].map((x) => decode(x[1] as string))
  ];
  const bodyText = clean(noScript.replace(/<head[\s\S]*?<\/head>/i, ''));
  return {
    title: clean(m(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? '') || null,
    description: meta('description') ? decode(meta('description') as string).trim() || null : null,
    lang: m(/<html[^>]+lang=["']([^"']+)["']/i) ?? null,
    headings: uniq(all(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi), 25),
    nav: uniq(nav, 40),
    buttons: uniq(all(/<button\b[^>]*>([\s\S]*?)<\/button>/gi), 25),
    links: uniq(all(/<a\b[^>]*>([\s\S]*?)<\/a>/gi), 40),
    fields: uniq(fields, 30),
    hasPassword: /<input[^>]+type=["']password["']/i.test(noScript),
    scripts: [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((x) => x[1] as string),
    bodyTextLength: bodyText.length,
    generator: meta('generator') ?? null
  };
}

const ROUTE_IGNORE = /^\/(api|assets|static|public|favicon|manifest|robots|sitemap|_next|node_modules|src|dist|login|logout|auth|sw|service-worker|index|vite|webpack|polyfill|chunk|\d)/i;
const ROUTE_WORDS = /^[a-z][a-z0-9-]{2,30}$/;

/** Caminhos usados em chamadas de API (api.get("/x"), fetch("/x")): não são telas. */
export function apiPathsFromBundle(js: string): Set<string> {
  const out = new Set<string>();
  for (const m of js.matchAll(/(?:\.(?:get|post|patch|put|delete|del|upload|request)|fetch)\(\s*[`"'](\/[^`"'?$]+)/g)) out.add(m[1] as string);
  return out;
}

/** Itens de menu com rota e rótulo (ex.: {to:"/clientes",text:"Clientes"}): dá nomes reais, com acento, às telas. */
export function navLabelsFromBundle(js: string): {route: string; label: string}[] {
  const out = new Map<string, string>();
  const add = (route: string, label: string) => {
    if (!ROUTE_IGNORE.test(route) && label.length >= 2 && label.length <= 40 && /[A-Za-zÀ-ú]/.test(label)) out.set(route, label.trim());
  };
  const key = '(?:text|label|title|name)';
  const rte = '(?:to|href|path|route|url)';
  for (const m of js.matchAll(new RegExp(`${rte}:\\s*["'\`](/[a-z0-9\\-/:]*)["'\`]\\s*,\\s*(?:[a-zA-Z]+:\\s*[^,{}]{1,40},\\s*)?${key}:\\s*["'\`]([^"'\`]{2,40})["'\`]`, 'g'))) add(m[1] as string, m[2] as string);
  for (const m of js.matchAll(new RegExp(`${key}:\\s*["'\`]([^"'\`]{2,40})["'\`]\\s*,\\s*(?:[a-zA-Z]+:\\s*[^,{}]{1,40},\\s*)?${rte}:\\s*["'\`](/[a-z0-9\\-/:]*)["'\`]`, 'g'))) add(m[2] as string, m[1] as string);
  out.delete('/');
  return [...out.entries()].map(([route, label]) => ({route, label}));
}

export function routesFromBundle(js: string): string[] {
  const found = new Map<string, number>();
  const api = apiPathsFromBundle(js);
  for (const m of js.matchAll(/["'`](\/[a-z][a-z0-9-]{2,30}(?:\/[:a-z0-9-]{1,30}){0,2})["'`]/g)) {
    const p = m[1] as string;
    if (api.has(p)) continue;
    const first = p.split('/')[1] as string;
    if (ROUTE_IGNORE.test(p) || !ROUTE_WORDS.test(first) || /\.(js|css|png|svg|json|woff2?|ico|map)$/i.test(p)) continue;
    found.set(p, (found.get(p) ?? 0) + 1);
  }
  // rotas de topo que aparecem mais de uma vez costumam ser rotas reais (menu + definição)
  return [...found.entries()].filter(([p, n]) => n >= 2 || p.split('/').length === 2).sort((a, b) => b[1] - a[1]).map(([p]) => p).slice(0, 40);
}

const HOST_HINTS: [RegExp, string][] = [
  [/\.up\.railway\.app$|\.railway\.app$/, 'Railway'], [/\.vercel\.app$/, 'Vercel'], [/\.netlify\.app$/, 'Netlify'], [/\.lovable\.app$|\.lovableproject\.com$/, 'Lovable'],
  [/\.pages\.dev$/, 'Cloudflare Pages'], [/\.workers\.dev$/, 'Cloudflare Workers'], [/\.onrender\.com$/, 'Render'], [/\.fly\.dev$/, 'Fly.io'], [/\.herokuapp\.com$/, 'Heroku'],
  [/\.github\.io$/, 'GitHub Pages'], [/\.web\.app$|\.firebaseapp\.com$/, 'Firebase Hosting'], [/\.supabase\.co$/, 'Supabase']
];
const STACK_HINTS: [RegExp, string][] = [
  [/supabase\.co|createClient\(["'`]https:\/\/[a-z0-9]+\.supabase/i, 'Supabase (Postgres)'], [/lovable/i, 'Lovable'], [/firebase/i, 'Firebase'],
  [/react-dom|jsx-runtime|__REACT/i, 'React'], [/vue\.runtime|createApp\(/i, 'Vue'], [/_next\/static|__NEXT_DATA__/i, 'Next.js'], [/stripe\.com|js\.stripe/i, 'Stripe'],
  [/google-analytics|gtag\(/i, 'Google Analytics'], [/mapbox|leaflet|maps\.googleapis/i, 'Mapas'], [/whatsapp|wa\.me/i, 'Integração com WhatsApp'], [/mercadopago/i, 'Mercado Pago']
];

export interface SiteAnalysis {
  url: string; final_url: string; status: number; title: string | null; description: string | null; requires_login: boolean; spa: boolean;
  nav: string[]; headings: string[]; buttons: string[]; fields: string[]; routes: string[]; stack: string[];
  infra: {hosting: string | null; cdn: string | null; hostname: string; https: boolean; br_domain: boolean; server_header: string | null};
  limitations: string[];
  evidence: {source: string; text: string}[];
  suggestion: {summary: string; groups: {title: string; items: string[]}[]; schedule: {hosting: string | null; database: string | null; domain: string | null}};
}

const humanize = (route: string) => {
  const seg = route.split('/').filter(Boolean).filter((s) => !s.startsWith(':'));
  if (!seg.length) return '';
  const w = seg[seg.length - 1]!.replace(/-/g, ' ');
  return w.charAt(0).toUpperCase() + w.slice(1);
};

export async function analyzeSite(rawUrl: string, fetcher: Fetcher = (u) => safeFetch(u)): Promise<SiteAnalysis> {
  const start = validateUrlShape(rawUrl);
  const page = await fetcher(start.toString());
  const final = new URL(page.url);
  const limitations: string[] = [];
  const evidence: SiteAnalysis['evidence'] = [];
  if (page.status >= 400) limitations.push(`O endereço respondeu HTTP ${page.status}.`);
  if (page.truncated) limitations.push('A página era grande demais e foi lida só em parte.');
  const p = parseHtml(page.body);

  // SPA: pouco texto no HTML => lê até 2 pacotes JS do mesmo domínio para achar rotas e tecnologias
  const spa = p.bodyTextLength < 120 && p.scripts.length > 0;
  let routes: string[] = [];
  let navLabels: {route: string; label: string}[] = [];
  const stackText: string[] = [page.body];
  if (spa) {
    for (const src of p.scripts.filter((s) => /\.m?js(\?|$)/.test(s)).slice(0, 2)) {
      const u = new URL(src, final);
      if (u.hostname !== final.hostname) continue;
      try {
        const js = await fetcher(u.toString());
        if (js.status < 400) { routes.push(...routesFromBundle(js.body)); navLabels.push(...navLabelsFromBundle(js.body)); stackText.push(js.body); }
      } catch (e) { limitations.push(`Não foi possível ler o pacote ${u.pathname}: ${(e as Error).message}`); }
    }
    routes = uniq(routes, 40);
    navLabels = [...new Map(navLabels.map((l) => [l.route, l])).values()].slice(0, 40);
  }

  const requiresLogin = p.hasPassword || /login|entrar|sign.?in|acesso restrito/i.test(`${p.title ?? ''} ${p.headings.join(' ')}`);
  if (spa) limitations.push('O sistema é uma aplicação de página única: o conteúdo é montado no navegador. As telas foram deduzidas das rotas do código publicado.');
  if (requiresLogin || spa) limitations.push('Telas atrás de login não são visíveis pelo link. Para detalhar módulos e funcionalidades, complete manualmente ou envie a lista de telas.');
  limitations.push('Banco de dados, horas e prazo não são detectáveis pelo link: preencha manualmente.');

  // infraestrutura
  const h = page.headers;
  const hostHit = HOST_HINTS.find(([re]) => re.test(final.hostname))?.[1] ?? null;
  const headerHost = h['x-railway-edge'] || h['x-railway-request-id'] || /railway/i.test(h.server ?? '') ? 'Railway' : h['x-vercel-id'] ? 'Vercel' : h['x-nf-request-id'] ? 'Netlify' : h['fly-request-id'] ? 'Fly.io' : null;
  const cdn = h['cf-ray'] || /cloudflare/i.test(h.server ?? '') ? 'Cloudflare' : h['x-amz-cf-id'] ? 'Amazon CloudFront' : null;
  const hosting = hostHit ?? headerHost;
  if (hosting) evidence.push({source: 'infraestrutura', text: `${hosting} (domínio/cabeçalhos HTTP)`});
  if (cdn) evidence.push({source: 'infraestrutura', text: `CDN: ${cdn} (cabeçalhos HTTP)`});
  const stack = uniq([...(hostHit === 'Lovable' ? ['Lovable'] : []), ...STACK_HINTS.filter(([re]) => stackText.some((t) => re.test(t))).map(([, n]) => n)], 12);
  if (stack.length) evidence.push({source: 'tecnologias', text: stack.join(', ')});
  if (p.title) evidence.push({source: 'título da página', text: p.title});
  if (p.description) evidence.push({source: 'descrição (meta)', text: p.description});
  if (navLabels.length) evidence.push({source: 'itens de menu no código publicado', text: navLabels.map((l) => `${l.label} (${l.route})`).join(' · ')});
  if (routes.length) evidence.push({source: 'rotas no código publicado', text: routes.join(' · ')});
  if (p.nav.length) evidence.push({source: 'menu de navegação', text: p.nav.join(' · ')});

  // sugestão de escopo (sempre para revisão humana)
  const labeled = new Set(navLabels.map((l) => l.route));
  const routeLabels = uniq([...navLabels.map((l) => l.label), ...routes.filter((r) => !labeled.has(r)).map(humanize)], 30);
  const groups: {title: string; items: string[]}[] = [];
  const modules = uniq([...p.nav, ...routeLabels], 30);
  if (modules.length) groups.push({title: 'Telas e módulos identificados', items: modules});
  const features = uniq([...p.buttons, ...p.headings.filter((x) => x.length < 70)].filter((x) => x.length > 2), 20);
  if (features.length) groups.push({title: 'Funcionalidades observadas', items: features});
  if (p.fields.length) groups.push({title: 'Campos e formulários', items: p.fields.slice(0, 20)});
  const techs = stack.filter((s) => !/Analytics/.test(s));
  if (techs.length) groups.push({title: 'Tecnologias', items: techs});

  const br = /\.com\.br$/i.test(final.hostname) || /\.br$/i.test(final.hostname);
  const summaryParts = [p.title, p.description].filter(Boolean) as string[];
  return {
    url: start.toString(), final_url: final.toString(), status: page.status, title: p.title, description: p.description, requires_login: requiresLogin, spa,
    nav: p.nav, headings: p.headings, buttons: p.buttons, fields: p.fields, routes, stack,
    infra: {hosting, cdn, hostname: final.hostname, https: final.protocol === 'https:', br_domain: br, server_header: h.server ?? null},
    limitations, evidence,
    suggestion: {
      summary: summaryParts.length ? `Sistema ${summaryParts.join(' — ')}` : '',
      groups,
      schedule: {
        hosting: hosting ? `${hosting}${cdn ? ` com ${cdn}` : ''}` : cdn ? `Proteção/CDN ${cdn}` : null,
        database: stack.find((s) => /Supabase|Firebase/.test(s)) ?? null,
        domain: `${final.hostname}${br ? ' (domínio .br)' : ''}${final.protocol === 'https:' ? ', com HTTPS' : ''}`
      }
    }
  };
}
