import {describe, expect, it} from 'vitest';
import {addMonths, diffDays} from './dates.js';
import {isValidCnpj, isValidCpf, toWhatsappNumber} from './documents.js';
import {parseBRL, splitInstallments} from './money.js';
import {makeCnpj, makeCpf} from '../test/helpers.js';
import {planItemCharges, suggestLateFees, type ItemRow} from '../services/billing.js';

describe('documentos', () => {
  it('valida CNPJ e CPF pelos dígitos verificadores', () => {
    expect(isValidCnpj('65.305.027/0001-38')).toBe(true); // CNPJ da Argos (Brandbook)
    expect(isValidCnpj(makeCnpj())).toBe(true);
    expect(isValidCnpj('11.222.333/0001-99')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
    expect(isValidCpf(makeCpf())).toBe(true);
    expect(isValidCpf('111.111.111-11')).toBe(false);
  });
  it('normaliza o WhatsApp da Argos (84) 99859-0183', () => {
    expect(toWhatsappNumber('(84) 99859-0183')).toBe('5584998590183');
    expect(toWhatsappNumber('5584998590183')).toBe('5584998590183');
    expect(toWhatsappNumber('123')).toBeNull();
  });
});

describe('dinheiro e datas', () => {
  it('interpreta valores em reais sem erro de ponto flutuante', () => {
    expect(parseBRL('R$ 1.499,80')).toBe(149980);
    expect(parseBRL('R$ 148,00')).toBe(14800);
    expect(parseBRL('34,99')).toBe(3499);
    expect(parseBRL('R$ 400')).toBe(40000);
    expect(parseBRL('abc')).toBeNull();
  });
  it('divide parcelas sem perder centavos', () => {
    const p = splitInstallments(100000, 3);
    expect(p.reduce((a, b) => a + b, 0)).toBe(100000);
    expect(p).toEqual([33333, 33333, 33334]);
  });
  it('soma meses respeitando fim de mês', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2026-11-10', 3, 10)).toBe('2027-02-10');
    expect(diffDays('2026-10-18', '2026-10-10')).toBe(8);
  });
});

const item = (over: Partial<ItemRow>): ItemRow => ({
  id: 'i1', contract_id: 'c1', kind: 'mensalidade', description: 'Mensalidade', billing_type: 'recorrente',
  unit_amount_cents: 14800, quantity: 1, installments: null, interval_months: 1, first_due_date: '2026-11-10', discount_cents: 0, active: true, ...over
});
const ctx = {horizon: '2027-02-28', contractStart: null, contractEnd: null, dueDay: null};

describe('planejamento de cobranças', () => {
  it('mensalidade gera uma cobrança por mês até o horizonte, com chave única por competência', () => {
    const p = planItemCharges(item({}), ctx);
    expect(p.map((c) => c.due_date)).toEqual(['2026-11-10', '2026-12-10', '2027-01-10', '2027-02-10']);
    expect(new Set(p.map((c) => c.dedupe_key)).size).toBe(4);
    expect(p.every((c) => c.amount_cents === 14800)).toBe(true);
  });
  it('respeita o fim da vigência', () => {
    expect(planItemCharges(item({}), {...ctx, contractEnd: '2026-12-31'})).toHaveLength(2);
  });
  it('por usuário: R$ 34,99 × 4 usuários = R$ 139,96 (Betices / GeoPonto IA)', () => {
    const p = planItemCharges(item({billing_type: 'por_usuario', unit_amount_cents: 3499, quantity: 4}), ctx);
    expect(p[0]?.amount_cents).toBe(13996);
  });
  it('parcelado: soma das parcelas = total líquido', () => {
    const p = planItemCharges(item({billing_type: 'parcelado', unit_amount_cents: 1499800 / 10 * 10, installments: 7, discount_cents: 100}), ctx);
    expect(p).toHaveLength(7);
    expect(p.reduce((s, c) => s + c.amount_cents, 0)).toBe(1499800 - 100);
  });
  it('valor único: um vencimento; sob demanda não gera nada; sem vencimento é erro', () => {
    expect(planItemCharges(item({billing_type: 'unico', unit_amount_cents: 40000}), ctx)).toHaveLength(1);
    expect(planItemCharges(item({billing_type: 'sob_demanda'}), ctx)).toHaveLength(0);
    expect(() => planItemCharges(item({first_due_date: null}), ctx)).toThrow(/vencimento/);
  });
});

describe('multa e juros', () => {
  it('só sugere encargos após o vencimento', () => {
    const c = {amount_cents: 10000, discount_cents: 0, due_date: '2026-10-10', status: 'pendente'};
    expect(suggestLateFees(c, {fine_percent: 2, interest_monthly_percent: 1}, '2026-10-10').fine_cents).toBe(0);
    const late = suggestLateFees(c, {fine_percent: 2, interest_monthly_percent: 1}, '2026-11-09');
    expect(late).toEqual({days_late: 30, fine_cents: 200, interest_cents: 100});
  });
});
