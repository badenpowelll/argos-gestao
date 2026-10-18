import {describe, expect, it} from 'vitest';
import {dateBR, formatDocument, fromCents, toCents} from './format';

describe('format', () => {
  it('converte reais <-> centavos sem ponto flutuante', () => {
    expect(toCents('1.499,80')).toBe(149980);
    expect(toCents('R$ 34,99')).toBe(3499);
    expect(toCents('148')).toBe(14800);
    expect(toCents('1,2,3')).toBeNull();
    expect(fromCents(13996)).toBe('139,96');
  });
  it('formata datas e documentos', () => {
    expect(dateBR('2026-10-18')).toBe('18/10/2026');
    expect(formatDocument('65305027000138')).toBe('65.305.027/0001-38');
  });
});
