import {describe, expect, it} from 'vitest';
import {makeCnpj} from '../test/helpers.js';
import {extractContract} from './contract.js';

const cnpj = makeCnpj();
const fmt = cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');

// Texto SINTÉTICO (apenas teste): modelado na modalidade "entrada + mensalidade".
const CONTRATO = `CONTRATO DE LICENÇA E PRESTAÇÃO DE SERVIÇOS
CONTRATANTE: EMPRESA EXEMPLO DE TESTE LTDA, pessoa jurídica inscrita no CNPJ ${fmt}.
CONTRATADA: ARGOS TERCEIRIZAÇÃO DE MÃO DE OBRA, CONSULTORIA E SOLUÇÕES LTDA, CNPJ 65.305.027/0001-38.

CLÁUSULA 1ª – DO OBJETO
O presente contrato tem por objeto a licença de uso do sistema PDV para gestão de vendas da CONTRATANTE.

CLÁUSULA 2ª – DO VALOR
Pela implantação do sistema será pago o valor de entrada de R$ 1.499,80 (um mil quatrocentos e noventa e nove reais e oitenta centavos).
A mensalidade de licença e suporte será de R$ 148,00 por mês.
Fica concedido desconto de 10% na primeira mensalidade.

CLÁUSULA 3ª – DO PAGAMENTO
O pagamento da mensalidade será realizado todo dia 10 de cada mês. Em caso de atraso incidirá multa de 2% e juros de 1% ao mês.

CLÁUSULA 4ª – DA VIGÊNCIA
O contrato terá vigência de 12 (doze) meses. A mensalidade será reajustada anualmente pelo IPCA.

Natal/RN, 15/10/2026. Data de assinatura: 15/10/2026.`;

describe('extração de contratos', () => {
  const ex = extractContract(CONTRATO);
  const get = (k: string) => ex.fields.find((f) => f.key === k)!;

  it('identifica o cliente (e ignora o CNPJ da própria Argos)', () => {
    expect(get('client_document').value).toBe(cnpj);
    expect(get('client_document').status).toBe('ok');
    expect(String(get('client_name').value)).toMatch(/EMPRESA EXEMPLO/);
  });

  it('extrai valores com origem e confiança (< 1)', () => {
    const entrada = ex.items.find((i) => i.amount_cents === 149980);
    const mensal = ex.items.find((i) => i.amount_cents === 14800);
    expect(entrada).toBeTruthy();
    expect(mensal?.billing_type).toBe('recorrente');
    for (const it of ex.items) {
      expect(it.source.length).toBeGreaterThan(5);
      expect(it.confidence).toBeLessThanOrEqual(0.9);
    }
  });

  it('extrai prazos e condições', () => {
    expect(get('due_day').value).toBe(10);
    expect(get('term_months').value).toBe(12);
    expect(get('adjustment_index').value).toBe('IPCA');
    expect(get('fine_percent').value).toBe(2);
    expect(get('interest_monthly_percent').value).toBe(1);
    expect(get('signed_at').value).toBe('2026-10-15');
    expect(String(get('discounts').value)).toMatch(/10%/);
  });

  it('não inventa: campos ausentes ficam nulos e sinalizados', () => {
    expect(get('commitment_number').value).toBeNull();
    expect(get('commitment_number').status).toBe('ausente');
    expect(get('start_date').status).toBe('ausente');
  });

  it('sinaliza divergência quando há valores diferentes para o mesmo item', () => {
    const e = extractContract(`${CONTRATO}\nA mensalidade de licença será de R$ 199,00 mensais.`);
    expect(e.items.filter((i) => i.status === 'divergente').length).toBeGreaterThan(0);
    expect(e.issues.some((i) => /valores diferentes/.test(i.message))).toBe(true);
  });

  it('texto sem dados: erro explícito e nada presumido', () => {
    const e = extractContract('Documento qualquer sem informações comerciais relevantes para o sistema.');
    expect(e.items).toHaveLength(0);
    expect(e.issues.some((i) => i.level === 'erro')).toBe(true);
    expect(e.fields.find((f) => f.key === 'client_document')?.value).toBeNull();
  });

  it('proposta é identificada e avisa que não gera cobrança', () => {
    const e = extractContract('PROPOSTA COMERCIAL\nValidade da proposta: 15 dias.\nImplantação: R$ 480,00 pagamento único.');
    expect(e.document_kind).toBe('proposta');
    expect(e.issues.some((i) => /não gera cobranças/.test(i.message))).toBe(true);
  });
});
