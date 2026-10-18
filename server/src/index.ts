import {createApp} from './app.js';
import {loadConfig} from './config.js';
import {createPool, migrate, withTx} from './db.js';
import {generateCharges} from './services/billing.js';

const cfg = loadConfig();
const db = createPool(cfg.databaseUrl, cfg.dbSsl);
const applied = await migrate(db);
if (applied.length) console.log(`[db] migrações aplicadas: ${applied.join(', ')}`);

const app = createApp(db, cfg);
const server = app.listen(cfg.port, () => console.log(`[argos-gestao] ouvindo na porta ${cfg.port}`));

// Geração diária de mensalidades dos contratos ativos (idempotente; lock evita execução dupla entre instâncias).
async function nightlyRecurrence() {
  const lock = await db.connect();
  try {
    const got = (await lock.query('select pg_try_advisory_lock(727002) as ok')).rows[0].ok;
    if (!got) return;
    const {rows} = await db.query("select id from contracts where status = 'ativo' and kind <> 'proposta'");
    let created = 0;
    for (const c of rows) {
      try {
        const r = await withTx(db, (tx) => generateCharges(tx, c.id, {id: '00000000-0000-0000-0000-000000000000', name: 'Sistema (recorrência)', role: 'admin'} as never, {horizonMonths: 3}));
        created += r.created;
      } catch (err) {
        console.error(`[recorrência] contrato ${c.id}:`, (err as Error).message);
      }
    }
    if (created) console.log(`[recorrência] ${created} cobrança(s) gerada(s)`);
    await lock.query('select pg_advisory_unlock(727002)');
  } finally {
    lock.release();
  }
}
const timer = setInterval(() => void nightlyRecurrence().catch((e) => console.error('[recorrência]', e)), 6 * 3600_000);
timer.unref();

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    clearInterval(timer);
    server.close(() => void db.end().then(() => process.exit(0)));
  });
}
