import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import {authenticate} from './auth.js';
import type {Config} from './config.js';
import type {Db} from './db.js';
import {errorHandler, HttpError} from './http.js';
import {authRoutes} from './routes/auth.js';
import {chargeRoutes} from './routes/charges.js';
import {clientRoutes} from './routes/clients.js';
import {contractRoutes} from './routes/contracts.js';
import {dashboardRoutes} from './routes/dashboard.js';
import {documentRoutes} from './routes/documents.js';
import {importRoutes} from './routes/imports.js';
import {auditRoutes, companyRoutes, expenseRoutes} from './routes/misc.js';
import {reportRoutes} from './routes/reports.js';
import {systemRoutes} from './routes/systems.js';
import {userRoutes} from './routes/users.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp(db: Db, cfg: Config) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Railway termina o TLS no proxy
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"]
        }
      },
      hsts: cfg.production
    })
  );
  app.use(express.json({limit: '1mb'}));
  app.use(cookieParser());

  // Defesa extra contra CSRF (além de SameSite=Strict): escritas exigem cabeçalho próprio, que
  // navegadores não enviam em requisições cross-site sem preflight (e não há CORS habilitado).
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-argos-client') !== 'web') {
      return next(new HttpError(403, 'Requisição não autorizada'));
    }
    const origin = req.get('origin');
    if (origin && cfg.appOrigin && origin !== cfg.appOrigin) return next(new HttpError(403, 'Origem não permitida'));
    next();
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await db.query('select 1');
      res.json({ok: true});
    } catch {
      res.status(503).json({ok: false});
    }
  });

  app.use('/api/auth', authRoutes(db, cfg));

  const needsAuth = authenticate(db, cfg.sessionSecret);
  const companyWhatsapp = async () => (await db.query('select whatsapp from company')).rows[0]?.whatsapp ?? null;
  app.use('/api/users', needsAuth, userRoutes(db));
  app.use('/api/clients', needsAuth, clientRoutes(db));
  app.use('/api/systems', needsAuth, systemRoutes(db));
  app.use('/api/contracts', needsAuth, contractRoutes(db));
  app.use('/api/imports', needsAuth, importRoutes(db));
  app.use('/api/charges', needsAuth, chargeRoutes(db, companyWhatsapp));
  app.use('/api/documents', needsAuth, documentRoutes(db));
  app.use('/api/expenses', needsAuth, expenseRoutes(db));
  app.use('/api/company', needsAuth, companyRoutes(db));
  app.use('/api/audit', needsAuth, auditRoutes(db));
  app.use('/api/dashboard', needsAuth, dashboardRoutes(db));
  app.use('/api/reports', needsAuth, reportRoutes(db));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Rota não encontrada')));

  // Frontend estático (produção): web/dist copiado ou resolvido relativo ao servidor.
  const webDist = [path.resolve(here, '../../web/dist'), path.resolve(process.cwd(), 'web/dist')].find((p) => fs.existsSync(p));
  if (webDist) {
    app.use(express.static(webDist, {index: false, maxAge: '1h'}));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
