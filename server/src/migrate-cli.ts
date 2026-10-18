import {loadConfig} from './config.js';
import {createPool, migrate} from './db.js';

const cfg = loadConfig();
const schema = process.env.DB_SCHEMA || undefined; // ambiente isolado (ex.: demo)
const db = createPool(cfg.databaseUrl, cfg.dbSsl, schema);
try {
  const applied = await migrate(db, schema);
  console.log(applied.length ? `Migrações aplicadas: ${applied.join(', ')}` : 'Banco já está atualizado.');
} finally {
  await db.end();
}
