import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {Router} from 'express';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import {audit} from '../audit.js';
import {COOKIE, actorOf, authenticate, cookieOptions, signSession} from '../auth.js';
import type {Config} from '../config.js';
import type {Db} from '../db.js';
import {HttpError, asyncHandler, parse} from '../http.js';

const passwordSchema = z
  .string()
  .min(10, 'Mínimo de 10 caracteres')
  .max(128)
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Use letras e números');

export function authRoutes(db: Db, cfg: Config) {
  const r = Router();
  const limiter = rateLimit({windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false});
  const needsAuth = authenticate(db, cfg.sessionSecret);

  const userCount = async () => Number((await db.query('select count(*)::int as n from users')).rows[0].n);

  r.get('/status', asyncHandler(async (_req, res) => {
    res.json({needs_setup: (await userCount()) === 0, setup_code_required: !!cfg.setupCode});
  }));

  // Primeiro acesso: só funciona enquanto não existir nenhum usuário.
  r.post('/setup', limiter, asyncHandler(async (req, res) => {
    const body = parse(z.object({name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(200), password: passwordSchema, setup_code: z.string().max(200).optional()}), req.body);
    if (cfg.setupCode) {
      const a = Buffer.from(body.setup_code ?? '');
      const b = Buffer.from(cfg.setupCode);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(403, 'Código de primeiro acesso incorreto', 'bad_setup_code');
    }
    const hash = await bcrypt.hash(body.password, 12);
    const created = await db.query(
      `insert into users (name, email, password_hash, role)
       select $1,$2,$3,'admin' where not exists (select 1 from users) returning id, name, email, role`,
      [body.name, body.email, hash]
    );
    const user = created.rows[0];
    if (!user) throw new HttpError(409, 'O sistema já foi configurado', 'already_setup');
    await audit(db, {id: user.id, name: user.name, ip: req.ip}, 'user.setup', 'user', user.id);
    res.cookie(COOKIE, signSession(cfg.sessionSecret, user.id), cookieOptions(cfg.production));
    res.status(201).json({user});
  }));

  r.post('/login', limiter, asyncHandler(async (req, res) => {
    const body = parse(z.object({email: z.string().trim().email(), password: z.string().min(1).max(128)}), req.body);
    const {rows} = await db.query('select * from users where lower(email) = lower($1)', [body.email]);
    const u = rows[0];
    const fail = () => new HttpError(401, 'E-mail ou senha incorretos');
    if (!u || !u.active) {
      await bcrypt.compare(body.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali'); // tempo constante
      throw fail();
    }
    if (u.locked_until && new Date(u.locked_until) > new Date()) {
      throw new HttpError(429, 'Conta temporariamente bloqueada por tentativas inválidas. Tente em alguns minutos.');
    }
    if (!(await bcrypt.compare(body.password, u.password_hash))) {
      await db.query(
        `update users set failed_logins = failed_logins + 1,
                locked_until = case when failed_logins + 1 >= 5 then now() + interval '15 minutes' else locked_until end
          where id = $1`,
        [u.id]
      );
      await audit(db, {id: u.id, name: u.name, ip: req.ip}, 'auth.login_failed', 'user', u.id);
      throw fail();
    }
    await db.query('update users set failed_logins = 0, locked_until = null where id = $1', [u.id]);
    await audit(db, {id: u.id, name: u.name, ip: req.ip}, 'auth.login', 'user', u.id);
    res.cookie(COOKIE, signSession(cfg.sessionSecret, u.id), cookieOptions(cfg.production));
    res.json({user: {id: u.id, name: u.name, email: u.email, role: u.role}});
  }));

  r.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE, {path: '/'});
    res.json({ok: true});
  });

  r.get('/me', needsAuth, asyncHandler(async (req, res) => {
    const a = actorOf(req);
    const {rows} = await db.query('select id, name, email, role from users where id = $1', [a.id]);
    res.json({user: rows[0]});
  }));

  r.post('/password', needsAuth, asyncHandler(async (req, res) => {
    const a = actorOf(req);
    const body = parse(z.object({current: z.string().min(1), next: passwordSchema}), req.body);
    const {rows} = await db.query('select password_hash from users where id = $1', [a.id]);
    if (!(await bcrypt.compare(body.current, rows[0].password_hash))) throw new HttpError(403, 'Senha atual incorreta');
    await db.query('update users set password_hash = $2 where id = $1', [a.id, await bcrypt.hash(body.next, 12)]);
    await audit(db, a, 'user.password_change', 'user', a.id);
    res.json({ok: true});
  }));

  return r;
}
