import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../app.js';
import {loadConfig} from '../config.js';
import {createPool, migrate, type Db} from '../db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.resolve(here, '../../../.env'));
} catch {
  /* variáveis podem vir do ambiente (CI) */
}

export const H = {'x-argos-client': 'web'};

/** Banco de teste ISOLADO: um schema descartável dentro do Postgres real (nunca toca nos dados reais). */
export async function createTestEnv() {
  const cfg = loadConfig({...process.env, NODE_ENV: 'test'});
  const schema = `t_${crypto.randomBytes(5).toString('hex')}`;
  const db: Db = createPool(cfg.databaseUrl, cfg.dbSsl, schema);
  await migrate(db, schema);
  const app = createApp(db, cfg);
  const cleanup = async () => {
    await db.end();
    const admin = createPool(cfg.databaseUrl, cfg.dbSsl);
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  };
  return {app, db, cfg, schema, cleanup};
}

/** Gera CNPJ válido (apenas para testes). */
export function makeCnpj(base12 = '112223330001'): string {
  const calc = (s: string, weights: number[]) => {
    const r = s.split('').reduce((a, d, i) => a + Number(d) * (weights[i] as number), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base12}${d1}${d2}`;
}
export function makeCpf(base9 = '123456789'): string {
  const calc = (s: string) => {
    const len = s.length;
    const sum = s.split('').reduce((a, d, i) => a + Number(d) * (len + 1 - i), 0);
    return ((sum * 10) % 11) % 10;
  };
  const d1 = calc(base9);
  return `${base9}${d1}${calc(base9 + d1)}`;
}
