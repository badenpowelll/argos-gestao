import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

// bigint (centavos) e numeric viram number; date permanece 'YYYY-MM-DD' (sem fuso).
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(1082, (v) => v);

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function createPool(url: string, ssl: boolean, schema?: string): Db {
  const pool = new pg.Pool({
    connectionString: url,
    ssl: ssl ? {rejectUnauthorized: false} : undefined,
    max: 10,
    idleTimeoutMillis: 30_000
  });
  if (schema) {
    if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('schema inválido');
    pool.on('connect', (client) => {
      void client.query(`set search_path to ${schema}, public`);
    });
  }
  pool.on('error', (err) => console.error('[pg] erro no pool ocioso', err.message));
  return pool;
}

/** Executa `fn` numa transação; rollback em qualquer erro. */
export async function withTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query('begin');
    const result = await fn(tx);
    await tx.query('commit');
    return result;
  } catch (err) {
    await tx.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    tx.release();
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));

export async function migrate(db: Db, schema?: string): Promise<string[]> {
  const dir = path.resolve(here, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  const tx = await db.connect();
  try {
    if (schema) await tx.query(`create schema if not exists ${schema}`);
    if (schema) await tx.query(`set search_path to ${schema}, public`);
    await tx.query('select pg_advisory_lock(727001)');
    await tx.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await tx.query<{name: string}>('select name from schema_migrations')).rows.map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      await tx.query('begin');
      try {
        await tx.query(fs.readFileSync(path.join(dir, file), 'utf8'));
        await tx.query('insert into schema_migrations (name) values ($1)', [file]);
        await tx.query('commit');
        applied.push(file);
      } catch (err) {
        await tx.query('rollback');
        throw new Error(`migração ${file} falhou: ${(err as Error).message}`);
      }
    }
  } finally {
    await tx.query('select pg_advisory_unlock(727001)').catch(() => undefined);
    tx.release();
  }
  return applied;
}
