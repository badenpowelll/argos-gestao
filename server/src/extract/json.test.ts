import {describe, expect, it} from 'vitest'; import fs from 'node:fs'; import {extractFromJson} from './json.js';
describe('exemplo oficial de JSON do Claude', () => {
  it('é aceito sem avisos e reconhece 3 itens', () => {
    const e = extractFromJson(JSON.parse(fs.readFileSync(new URL('../../../demo-contratos/exemplo-proposta-claude.json', import.meta.url), 'utf8').replace(/^\uFEFF/, '')));
    expect(e.issues.filter((i) => i.level !== 'info')).toEqual([]);
    expect(e.items).toHaveLength(3);
    expect(e.fields.find((f) => f.key === 'client_document')?.value).toBe('99000137000103');
  });
});
