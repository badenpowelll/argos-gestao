/**
 * Gera 15 contratos FICTÍCIOS em PDF (e o gabarito) para demonstrar/testar a importação.
 * Todos os dados são inventados; CPF/CNPJ têm dígitos verificadores válidos mas não pertencem a ninguém de propósito (bases 99…).
 * Uso:  npx tsx src/demo/gerar-contratos-demo.ts [pasta-de-saida]
 */
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import {completeCnpj, completeCpf} from '../lib/documents.js';

type Cob = 'unico' | 'recorrente' | 'parcelado' | 'por_usuario' | 'sob_demanda';
interface Item {kind: string; cob: Cob; cents: number; qty?: number; parcelas?: number; anual?: boolean}
interface Spec {
  name: string; pf?: boolean; publico?: boolean; resp: string; email: string; fone: string; endereco: string; objeto: string; items: Item[];
  dueDay: number; meses: number; inicio: string; assinatura: string; indice: string; multa: number; juros: number; desconto: string; pagamento: string;
  processo?: string; empenho?: string; cidade: string; kindLabel?: string;
}

const brl = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
const br = (iso: string) => iso.split('-').reverse().join('/');

const SPECS: Spec[] = [
  {name: 'Padaria Pão Dourado Ltda', resp: 'Carlos Eduardo Lima', email: 'contato@paodourado.example.com', fone: '(84) 98811-2001', endereco: 'Rua das Palmeiras, 120, Lagoa Nova, Natal/RN, CEP 59075-000', cidade: 'Natal/RN',
    objeto: 'a licença de uso, a implantação e o suporte do sistema PDV Pão Dourado, para frente de caixa e controle de estoque',
    items: [{kind: 'implementacao', cob: 'unico', cents: 135180}, {kind: 'mensalidade', cob: 'recorrente', cents: 14800}, {kind: 'treinamento', cob: 'unico', cents: 8000}],
    dueDay: 10, meses: 12, inicio: '2026-05-10', assinatura: '2026-05-05', indice: 'IPCA', multa: 2, juros: 1, desconto: 'Fica concedido desconto de 10% sobre a primeira mensalidade', pagamento: 'Entrada à vista por Pix e mensalidades até o dia 10'},
  {name: 'João Carlos Medeiros', pf: true, resp: 'João Carlos Medeiros', email: 'joao.medeiros@example.com', fone: '(84) 98822-3002', endereco: 'Rua Seridó, 45, Centro, Parnamirim/RN, CEP 59140-100', cidade: 'Parnamirim/RN',
    objeto: 'o desenvolvimento do sistema Controle de Empréstimos Medeiros, com painel, clientes, calendário e robôs de cobrança',
    items: [{kind: 'desenvolvimento', cob: 'unico', cents: 40000}, {kind: 'suporte', cob: 'sob_demanda', cents: 5000}],
    dueDay: 5, meses: 12, inicio: '2026-07-05', assinatura: '2026-07-01', indice: 'IPCA', multa: 2, juros: 1, desconto: 'Fica concedido desconto de 100% na instalação e implementação', pagamento: 'Valor único por Pix e suporte por hora técnica sob demanda'},
  {name: 'Prefeitura Municipal de Serra Azul', publico: true, resp: 'Maria Helena Duarte, Secretária de Administração', email: 'compras@serraazul.example.gov.br', fone: '(84) 3200-4003', endereco: 'Praça da Matriz, 1, Centro, Serra Azul/RN, CEP 59500-000', cidade: 'Serra Azul/RN',
    objeto: 'a implantação e a licença de uso do sistema de Gestão de Protocolos e Processos para a Secretaria de Administração',
    items: [{kind: 'implementacao', cob: 'unico', cents: 1200000}, {kind: 'licenca', cob: 'recorrente', cents: 250000}, {kind: 'hospedagem', cob: 'recorrente', cents: 35000}, {kind: 'treinamento', cob: 'unico', cents: 150000}],
    dueDay: 30, meses: 12, inicio: '2026-05-01', assinatura: '2026-04-28', indice: 'IPCA', multa: 2, juros: 1, desconto: 'Fica concedido desconto de 5% sobre a implantação', pagamento: 'Pagamento mediante ordem bancária após liquidação da nota fiscal', processo: '1234/2026-SEAD', empenho: '2026NE000321'},
  {name: 'Câmara Municipal de Vale Verde', publico: true, resp: 'Roberto Alves, Presidente', email: 'administrativo@camaravaleverde.example.gov.br', fone: '(84) 3300-5004', endereco: 'Avenida Legislativa, 500, Centro, Vale Verde/RN, CEP 59600-000', cidade: 'Vale Verde/RN',
    objeto: 'o desenvolvimento e a manutenção do Portal da Transparência Legislativa',
    items: [{kind: 'desenvolvimento', cob: 'parcelado', cents: 900000, parcelas: 6}, {kind: 'hospedagem', cob: 'recorrente', cents: 20000}, {kind: 'dominio', cob: 'recorrente', cents: 4000, anual: true}],
    dueDay: 15, meses: 12, inicio: '2026-06-15', assinatura: '2026-06-10', indice: 'IPCA', multa: 2, juros: 1, desconto: 'Não há desconto aplicável', pagamento: 'Pagamento por ordem bancária em até 30 dias após o atesto', processo: '0456/2026-CMVV', empenho: '2026NE000128'},
  {name: 'Fundo Municipal de Saúde de Pedra Bonita', publico: true, resp: 'Dr. Paulo Ribeiro, Secretário de Saúde', email: 'fms@pedrabonita.example.gov.br', fone: '(84) 3400-6005', endereco: 'Rua da Saúde, 80, Centro, Pedra Bonita/RN, CEP 59700-000', cidade: 'Pedra Bonita/RN',
    objeto: 'a implantação e a licença de uso do Painel de Indicadores de Saúde',
    items: [{kind: 'implementacao', cob: 'unico', cents: 800000}, {kind: 'licenca', cob: 'recorrente', cents: 150000}, {kind: 'treinamento', cob: 'unico', cents: 120000}, {kind: 'suporte', cob: 'recorrente', cents: 50000}],
    dueDay: 20, meses: 24, inicio: '2026-03-01', assinatura: '2026-02-24', indice: 'IPCA', multa: 2, juros: 1, desconto: 'Fica concedido desconto de 3% sobre o treinamento', pagamento: 'Pagamento mensal após liquidação e emissão da nota fiscal', processo: '7890/2026-FMS', empenho: '2026NE000777'},
  {name: 'GeoPonto Serviços Ltda', resp: 'Fernanda Costa', email: 'financeiro@geoponto.example.com', fone: '(84) 98833-7006', endereco: 'Avenida Prudente de Morais, 900, Tirol, Natal/RN, CEP 59020-400', cidade: 'Natal/RN',
    objeto: 'o licenciamento do sistema de controle de ponto GeoPonto, com cobrança por usuário',
    items: [{kind: 'licenca', cob: 'por_usuario', cents: 3499, qty: 4}, {kind: 'implementacao', cob: 'unico', cents: 49900}],
    dueDay: 10, meses: 12, inicio: '2026-08-10', assinatura: '2026-08-03', indice: 'IPCA', multa: 2, juros: 1, desconto: 'Fica concedido desconto de 10% na implantação', pagamento: 'Mensalidade por usuário via boleto'},
  {name: 'Clínica Vida Plena Ltda', resp: 'Dra. Juliana Prado', email: 'clinica@vidaplena.example.com', fone: '(84) 98844-8007', endereco: 'Rua dos Girassóis, 300, Candelária, Natal/RN, CEP 59064-000', cidade: 'Natal/RN',
    objeto: 'o desenvolvimento do sistema de Agenda e Prontuário Eletrônico Vida Plena',
    items: [{kind: 'desenvolvimento', cob: 'parcelado', cents: 500000, parcelas: 5}, {kind: 'mensalidade', cob: 'recorrente', cents: 19900}, {kind: 'treinamento', cob: 'unico', cents: 40000}, {kind: 'hospedagem', cob: 'recorrente', cents: 9900}],
    dueDay: 20, meses: 12, inicio: '2026-06-20', assinatura: '2026-06-12', indice: 'IPCA', multa: 2, juros: 1, desconto: 'Fica concedido desconto de 5% no pagamento antecipado', pagamento: 'Desenvolvimento em parcelas via Pix; mensalidades via boleto'},
  {name: 'Maria das Graças Oliveira', pf: true, resp: 'Maria das Graças Oliveira', email: 'maria.gracas@example.com', fone: '(84) 98855-9008', endereco: 'Rua do Sol, 77, Ponta Negra, Natal/RN, CEP 59090-000', cidade: 'Natal/RN',
    objeto: 'o desenvolvimento do site institucional e a hospedagem do ateliê Graça Criativa',
    items: [{kind: 'desenvolvimento', cob: 'unico', cents: 180000}, {kind: 'dominio', cob: 'recorrente', cents: 6500, anual: true}, {kind: 'hospedagem', cob: 'recorrente', cents: 3000}],
    dueDay: 1, meses: 12, inicio: '2026-08-01', assinatura: '2026-07-25', indice: 'IPCA', multa: 2, juros: 1, desconto: 'Não há desconto aplicável', pagamento: 'Pagamento por Pix até o dia 1 de cada mês'},
  {name: 'Auto Peças Horizonte Ltda', resp: 'Ricardo Menezes', email: 'ricardo@autopecashorizonte.example.com', fone: '(84) 98866-1009', endereco: 'Avenida Bernardo Vieira, 2500, Lagoa Nova, Natal/RN, CEP 59056-450', cidade: 'Natal/RN',
    objeto: 'a implantação e a licença de uso do sistema de Controle de Estoque e Vendas',
    items: [{kind: 'implementacao', cob: 'parcelado', cents: 360000, parcelas: 6}, {kind: 'licenca', cob: 'recorrente', cents: 24900}, {kind: 'suporte', cob: 'recorrente', cents: 8000}],
    dueDay: 25, meses: 12, inicio: '2026-05-25', assinatura: '2026-05-18', indice: 'IGP-M', multa: 2, juros: 1, desconto: 'Fica concedido desconto de 8% na licença', pagamento: 'Implantação parcelada em 6 vezes e licença mensal'},
  {name: 'Transportadora Rota Norte Ltda', resp: 'Antônio Barreto', email: 'ti@rotanorte.example.com', fone: '(84) 98877-2010', endereco: 'Rodovia BR-101, km 12, Distrito Industrial, Extremoz/RN, CEP 59575-000', cidade: 'Extremoz/RN',
    objeto: 'o licenciamento do sistema de rastreamento de frota Rota Norte',
    items: [{kind: 'licenca', cob: 'por_usuario', cents: 4900, qty: 12}, {kind: 'implementacao', cob: 'unico', cents: 250000}],
    dueDay: 10, meses: 12, inicio: '2026-03-10', assinatura: '2026-03-02', indice: 'IPCA', multa: 2, juros: 1, desconto: 'Não há desconto aplicável', pagamento: 'Licença por usuário via boleto bancário'},
  {name: 'Associação Comunitária Beira Mar', resp: 'Lúcia Fernandes', email: 'associacao@beiramar.example.org', fone: '(84) 98888-3011', endereco: 'Rua da Praia, 15, Redinha, Natal/RN, CEP 59122-000', cidade: 'Natal/RN',
    objeto: 'o desenvolvimento do sistema de cadastro de associados e mensalidades',
    items: [{kind: 'desenvolvimento', cob: 'unico', cents: 120000}, {kind: 'mensalidade', cob: 'recorrente', cents: 9900}],
    dueDay: 15, meses: 8, inicio: '2026-02-15', assinatura: '2026-02-10', indice: 'IPCA', multa: 2, juros: 1, desconto: 'Fica concedido desconto de 10% no desenvolvimento', pagamento: 'Pix até o dia 15'},
  {name: 'Restaurante Sabor da Terra Ltda', resp: 'Patrícia Gomes', email: 'contato@sabordaterra.example.com', fone: '(84) 98899-4012', endereco: 'Avenida Roberto Freire, 1800, Capim Macio, Natal/RN, CEP 59082-000', cidade: 'Natal/RN',
    objeto: 'o desenvolvimento do cardápio digital com pedidos por QR Code',
    items: [{kind: 'implementacao', cob: 'unico', cents: 90000}, {kind: 'mensalidade', cob: 'recorrente', cents: 12900}],
    dueDay: 12, meses: 12, inicio: '2026-11-12', assinatura: '2026-10-17', indice: 'IPCA', multa: 2, juros: 1, desconto: 'Fica concedido desconto de 10% sobre a primeira mensalidade', pagamento: 'Entrada por Pix e mensalidades até o dia 12'},
  {name: 'Escola Novo Saber Ltda', resp: 'Cláudia Ramos', email: 'diretoria@novosaber.example.com', fone: '(84) 98800-5013', endereco: 'Rua da Educação, 400, Neópolis, Natal/RN, CEP 59086-000', cidade: 'Natal/RN',
    objeto: 'o desenvolvimento do Portal do Aluno, com notas, frequência e comunicados',
    items: [{kind: 'desenvolvimento', cob: 'unico', cents: 300000}, {kind: 'licenca', cob: 'recorrente', cents: 29900}, {kind: 'treinamento', cob: 'unico', cents: 60000}, {kind: 'suporte', cob: 'sob_demanda', cents: 6000}],
    dueDay: 5, meses: 24, inicio: '2026-11-05', assinatura: '2026-10-16', indice: 'IPCA', multa: 2, juros: 1, desconto: 'Fica concedido desconto de 5% no treinamento', pagamento: 'Pagamento via boleto bancário'},
  {name: 'Hotel Pousada Brisa do Mar Ltda', resp: 'Eduardo Salles', email: 'reservas@brisadomar.example.com', fone: '(84) 98811-6014', endereco: 'Avenida Litorânea, 700, Pipa, Tibau do Sul/RN, CEP 59178-000', cidade: 'Tibau do Sul/RN', kindLabel: 'PROPOSTA',
    objeto: 'o desenvolvimento do sistema de reservas e channel manager da pousada',
    items: [{kind: 'desenvolvimento', cob: 'unico', cents: 450000}, {kind: 'mensalidade', cob: 'recorrente', cents: 34900}, {kind: 'hospedagem', cob: 'recorrente', cents: 12000}],
    dueDay: 10, meses: 12, inicio: '2026-12-10', assinatura: '2026-10-15', indice: 'IPCA', multa: 2, juros: 1, desconto: 'Fica concedido desconto de 7% para pagamento à vista', pagamento: 'A definir entre as partes na aprovação'},
  {name: 'Padaria Pão Dourado Ltda', resp: 'Carlos Eduardo Lima', email: 'contato@paodourado.example.com', fone: '(84) 98811-2001', endereco: 'Rua das Palmeiras, 120, Lagoa Nova, Natal/RN, CEP 59075-000', cidade: 'Natal/RN', kindLabel: 'TERMO ADITIVO',
    objeto: 'a inclusão do módulo de controle de validade e etiquetas ao sistema PDV Pão Dourado',
    items: [{kind: 'desenvolvimento', cob: 'unico', cents: 60000}, {kind: 'mensalidade', cob: 'recorrente', cents: 4990}],
    dueDay: 10, meses: 8, inicio: '2026-09-15', assinatura: '2026-09-08', indice: 'IPCA', multa: 2, juros: 1, desconto: 'Não há desconto aplicável', pagamento: 'Pagamento junto às demais mensalidades'}
];

function sentence(i: Item, s: Spec): string {
  const v = brl(i.cents);
  switch (`${i.kind}:${i.cob}`) {
    case 'implementacao:unico': return `Pela implantação do sistema será pago o valor de ${v}.`;
    case 'implementacao:parcelado': return `A implantação do sistema será paga em ${i.parcelas} parcelas mensais, no valor total de ${v}.`;
    case 'desenvolvimento:unico': return `Pelo desenvolvimento do sistema será pago o valor de ${v}.`;
    case 'desenvolvimento:parcelado': return `O desenvolvimento do sistema será pago em ${i.parcelas} parcelas mensais, no valor total de ${v}.`;
    case 'licenca:recorrente': return `A licença de uso do sistema será de ${v} por mês.`;
    case 'licenca:por_usuario': return `A licença de uso será de ${v} por usuário, para ${i.qty} usuários.`;
    case 'mensalidade:recorrente': return `A mensalidade será de ${v} por mês.`;
    case 'hospedagem:recorrente': return `A hospedagem e o banco de dados serão cobrados no valor de ${v} por mês.`;
    case 'dominio:recorrente': return `O registro de domínio será cobrado no valor de ${v} por ano.`;
    case 'treinamento:unico': return `O treinamento da equipe será cobrado no valor de ${v}.`;
    case 'suporte:recorrente': return `O suporte e a manutenção serão cobrados no valor de ${v} mensais.`;
    case 'suporte:sob_demanda': return `O suporte técnico sob demanda será cobrado por hora, no valor de ${v} por hora.`;
    default: throw new Error(`item não previsto ${i.kind}:${i.cob} em ${s.name}`);
  }
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export interface Gabarito {file: string; kind: 'contrato' | 'proposta' | 'aditivo'; name: string; document: string; items: {kind: string; billing_type: Cob; amount_cents: number; quantity: number}[]; due_day: number; term_months: number; start_date: string; signed_at: string; adjustment_index: string; fine: number; interest: number; process: string | null; empenho: string | null}

export async function gerar(outDir: string): Promise<Gabarito[]> {
  fs.mkdirSync(outDir, {recursive: true});
  const gab: Gabarito[] = [];
  for (const [idx, s] of SPECS.entries()) {
    const n = idx + 1;
    const document = s.pf ? completeCpf(String(100000000 + n * 7919).slice(0, 9)) : completeCnpj(`${String(99000000 + n * 137)}0001`);
    const fmt = s.pf ? document.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : document.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    const kind = s.kindLabel === 'PROPOSTA' ? 'proposta' : s.kindLabel === 'TERMO ADITIVO' ? 'aditivo' : 'contrato';
    const titulo = kind === 'proposta' ? 'PROPOSTA COMERCIAL' : kind === 'aditivo' ? `TERMO ADITIVO Nº ${n}/2026 AO CONTRATO DE PRESTAÇÃO DE SERVIÇOS` : `CONTRATO ${s.publico ? 'ADMINISTRATIVO ' : ''}DE PRESTAÇÃO DE SERVIÇOS E LICENÇA DE USO DE SOFTWARE Nº ${n}/2026`;
    const file = `${String(n).padStart(2, '0')}-${slug(s.name)}${kind === 'aditivo' ? '-aditivo' : ''}.pdf`;
    const natureza = s.pf ? 'pessoa física' : s.publico ? 'pessoa jurídica de direito público' : 'pessoa jurídica de direito privado';
    const lines: [string, string][] = [
      ['t', titulo],
      ['n', 'DOCUMENTO FICTÍCIO PARA DEMONSTRAÇÃO DO SISTEMA ARGOS GESTÃO 360° — dados inventados.'],
      ['p', `CONTRATANTE: ${s.name}, ${natureza}, inscrito(a) no ${s.pf ? 'CPF' : 'CNPJ'} ${fmt}, com ${s.pf ? 'residência' : 'sede'} em ${s.endereco}, representado(a) por ${s.resp}, e-mail ${s.email}, WhatsApp ${s.fone}.`],
      ['p', 'CONTRATADA: ARGOS TERCEIRIZAÇÃO DE MÃO DE OBRA, CONSULTORIA E SOLUÇÕES LTDA, CNPJ 65.305.027/0001-38, com sede em Natal/RN.'],
      ['h', 'CLÁUSULA 1ª – DO OBJETO'],
      ['p', `O presente ${kind === 'proposta' ? 'documento' : 'contrato'} tem por objeto ${s.objeto}.`],
      ['h', 'CLÁUSULA 2ª – DOS VALORES'],
      ...s.items.map((i) => ['p', sentence(i, s)] as [string, string]),
      ['p', `${s.desconto}.`],
      ['h', 'CLÁUSULA 3ª – DO PAGAMENTO'],
      ['p', `Forma de pagamento: ${s.pagamento.toLowerCase().replace(/^./, (c) => c.toUpperCase())}.`],
      ['p', `O vencimento das parcelas e mensalidades ocorrerá todo dia ${s.dueDay} de cada mês. Em caso de atraso incidirá multa de ${String(s.multa).replace('.', ',')}% e juros de ${String(s.juros).replace('.', ',')}% ao mês.`],
      ['h', 'CLÁUSULA 4ª – DA VIGÊNCIA E DO REAJUSTE'],
      ['p', `O contrato terá vigência de ${s.meses} (${s.meses === 12 ? 'doze' : s.meses === 24 ? 'vinte e quatro' : s.meses === 8 ? 'oito' : String(s.meses)}) meses, com início em ${br(s.inicio)}. As mensalidades serão reajustadas anualmente pelo ${s.indice}.`],
      ...(s.publico ? ([['h', 'CLÁUSULA 5ª – DA DOTAÇÃO E DO PROCESSO'], ['p', `Processo administrativo nº ${s.processo}. Empenho nº ${s.empenho}.`]] as [string, string][]) : []),
      ['p', `${s.cidade}, ${br(s.assinatura)}. Data de assinatura: ${br(s.assinatura)}.`]
    ];
    const doc = new PDFDocument({size: 'A4', margin: 56, info: {Title: titulo, Author: 'Argos Soluções (demonstração)'}});
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((r) => doc.on('end', () => r()));
    for (const [t, text] of lines) {
      if (t === 't') doc.font('Helvetica-Bold').fontSize(13).fillColor('#000F37').text(text, {align: 'left'}).moveDown(0.8);
      else if (t === 'n') doc.font('Helvetica-Oblique').fontSize(8).fillColor('#B02500').text(text, {align: 'left'}).moveDown(0.8);
      else if (t === 'h') doc.moveDown(0.4).font('Helvetica-Bold').fontSize(10.5).fillColor('#000F37').text(text, {align: 'left'}).moveDown(0.2);
      else doc.font('Helvetica').fontSize(10).fillColor('#111').text(text, {align: 'left'}).moveDown(0.5);
    }
    doc.end();
    await done;
    fs.writeFileSync(path.join(outDir, file), Buffer.concat(chunks));
    gab.push({
      file, kind, name: s.name, document,
      items: s.items.map((i) => ({kind: i.kind, billing_type: i.cob, amount_cents: i.cents, quantity: i.qty ?? 1})),
      due_day: s.dueDay, term_months: s.meses, start_date: s.inicio, signed_at: s.assinatura, adjustment_index: s.indice, fine: s.multa, interest: s.juros, process: s.processo ?? null, empenho: s.empenho ?? null
    });
  }
  fs.writeFileSync(path.join(outDir, '_gabarito.json'), JSON.stringify(gab, null, 2));
  return gab;
}

if (process.argv[1] && /gerar-contratos-demo/.test(process.argv[1])) {
  const out = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '..', '..', '..', 'demo-contratos'));
  const g = await gerar(out);
  console.log(`${g.length} contratos fictícios gerados em ${out}`);
}

