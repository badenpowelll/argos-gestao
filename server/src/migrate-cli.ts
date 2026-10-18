import {loadConfig} from './config.js';
import {createPool, migrate} from './db.js';

const cfg = loadConfig();
const db = createPool(cfg.databaseUrl, cfg.dbSsl);
try {
  const applied = await migrate(db);
  console.log(applied.length ? `Migrações aplicadas: ${applied.join(', ')}` : 'Banco já está atualizado.');
} finally {
  await db.end();
}
