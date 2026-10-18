import bcrypt from 'bcryptjs';
import {Router} from 'express';
import {z} from 'zod';
import {audit} from '../audit.js';
import {ADMIN, actorOf, requireRole} from '../auth.js';
import type {Db} from '../db.js';
import {HttpError, asyncHandler, parse} from '../http.js';

const role = z.enum(['admin', 'financeiro', 'operador', 'leitura']);
const password = z.string().min(10).max(128).refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Use letras e números');

export function userRoutes(db: Db) {
  const r = Router();
  r.use(requireRole(...ADMIN));

  r.get('/', asyncHandler(async (_req, res) => {
    const {rows} = await db.query('select id, name, email, role, active, created_at from users order by name');
    res.json(rows);
  }));

  r.post('/', asyncHandler(async (req, res) => {
    const b = parse(z.object({name: z.string().trim().min(2).max(120), email: z.string().trim().email(), role, password}), req.body);
    const {rows} = await db.query(
      'insert into users (name, email, password_hash, role) values ($1,$2,$3,$4) returning id, name, email, role, active',
      [b.name, b.email, await bcrypt.hash(b.password, 12), b.role]
    );
    await audit(db, actorOf(req), 'user.create', 'user', rows[0].id, {email: b.email, role: b.role});
    res.status(201).json(rows[0]);
  }));

  r.patch('/:id', asyncHandler(async (req, res) => {
    const a = actorOf(req);
    const b = parse(z.object({name: z.string().trim().min(2).max(120).optional(), role: role.optional(), active: z.boolean().optional(), password: password.optional()}), req.body);
    if (req.params.id === a.id && (b.active === false || (b.role && b.role !== 'admin'))) {
      throw new HttpError(409, 'Você não pode desativar nem rebaixar o próprio usuário');
    }
    const {rows} = await db.query(
      `update users set name = coalesce($2,name), role = coalesce($3,role), active = coalesce($4,active),
              password_hash = coalesce($5,password_hash), failed_logins = 0, locked_until = null
        where id = $1 returning id, name, email, role, active`,
      [req.params.id, b.name ?? null, b.role ?? null, b.active ?? null, b.password ? await bcrypt.hash(b.password, 12) : null]
    );
    if (!rows[0]) throw new HttpError(404, 'Usuário não encontrado');
    await audit(db, a, 'user.update', 'user', rows[0].id, {name: b.name, role: b.role, active: b.active, password_reset: !!b.password});
    res.json(rows[0]);
  }));
  return r;
}
