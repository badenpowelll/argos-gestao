import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {gerar} from '../demo/gerar-contratos-demo.js';
import {extractContract} from './contract.js';
import {extractText} from './text.js';

/** Os 15 contratos fictícios devem ser reconhecidos com TODOS os pontos corretos (valores, cobrança, vencimento, vigência…). */
describe('reconhecimento dos 15 contratos fictícios (PDF)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'argos-demo-'));
  const gab = await gerar(dir);

  it('gera 15 PDFs', () => {
    expect(gab).toHaveLength(15);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.pdf'))).toHaveLength(15);
  });

  for (const g of gab) {
    it(`${g.file}`, async () => {
      const {text, pages} = await extractText(fs.readFileSync(path.join(dir, g.file)), 'pdf');
      const e = extractContract(text, pages);
      const v = (k: string) => e.fields.find((f) => f.key === k)?.value;
      expect(e.document_kind).toBe(g.kind);
      expect(v('client_document')).toBe(g.document);
      expect(String(v('client_name'))).toBe(g.name);
      expect(v('due_day')).toBe(g.due_day);
      expect(v('term_months')).toBe(g.term_months);
      expect(v('adjustment_index')).toBe(g.adjustment_index);
      expect(v('fine_percent')).toBe(g.fine);
      expect(v('interest_monthly_percent')).toBe(g.interest);
      expect(v('signed_at')).toBe(g.signed_at);
      expect(v('start_date')).toBe(g.start_date);
      expect(v('commitment_number')).toBe(g.empenho);
      expect(v('administrative_process')).toBe(g.process);
      expect(String(v('object'))).toMatch(/^O presente|tem por objeto|\w/);
      expect(v('payment_terms')).toBeTruthy();
      expect(v('discounts')).toBeTruthy();
      const got = e.items.map((i) => `${i.kind}|${i.billing_type}|${i.amount_cents}|${i.quantity}`).sort();
      const want = g.items.map((i) => `${i.kind}|${i.billing_type}|${i.amount_cents}|${i.quantity}`).sort();
      expect(got).toEqual(want);
      expect(e.items.every((i) => i.status === 'ok' && i.source.length > 5)).toBe(true);
    });
  }
});

