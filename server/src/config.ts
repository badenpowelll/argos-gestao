export interface Config {
  databaseUrl: string;
  dbSsl: boolean;
  sessionSecret: string;
  port: number;
  production: boolean;
  appOrigin: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL não definida');
  const sessionSecret = env.SESSION_SECRET ?? '';
  if (sessionSecret.length < 32) throw new Error('SESSION_SECRET deve ter ao menos 32 caracteres');
  const internal = /\.railway\.internal(:|\/|$)/.test(databaseUrl);
  return {
    databaseUrl,
    dbSsl: env.DB_SSL ? env.DB_SSL === 'true' : !internal && !/localhost|127\.0\.0\.1/.test(databaseUrl),
    sessionSecret,
    port: Number(env.PORT ?? 3000),
    production: env.NODE_ENV === 'production',
    appOrigin: env.APP_ORIGIN || null
  };
}
