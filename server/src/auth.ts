import type {NextFunction, Request, Response} from 'express';
import jwt from 'jsonwebtoken';
import type {Db} from './db.js';
import type {Actor, Role} from './audit.js';
import {HttpError} from './http.js';

export const COOKIE = 'argos_session';
const SESSION_HOURS = 8;

declare module 'express-serve-static-core' {
  interface Request {
    actor?: Actor;
  }
}

export function signSession(secret: string, userId: string): string {
  return jwt.sign({sub: userId}, secret, {expiresIn: `${SESSION_HOURS}h`, algorithm: 'HS256'});
}

export function cookieOptions(production: boolean) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: production,
    maxAge: SESSION_HOURS * 3600 * 1000,
    path: '/'
  };
}

export function authenticate(db: Db, secret: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[COOKIE] as string | undefined;
      if (!token) throw new HttpError(401, 'Não autenticado');
      let sub: string;
      try {
        sub = (jwt.verify(token, secret, {algorithms: ['HS256']}) as {sub: string}).sub;
      } catch {
        throw new HttpError(401, 'Sessão inválida ou expirada');
      }
      const {rows} = await db.query<{id: string; name: string; role: Role; active: boolean}>(
        'select id, name, role, active from users where id = $1',
        [sub]
      );
      const user = rows[0];
      if (!user?.active) throw new HttpError(401, 'Usuário inativo');
      req.actor = {id: user.id, name: user.name, role: user.role, ip: req.ip};
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const WRITERS: Role[] = ['admin', 'financeiro', 'operador'];
export const FINANCE: Role[] = ['admin', 'financeiro'];
export const ADMIN: Role[] = ['admin'];

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.actor) return next(new HttpError(401, 'Não autenticado'));
    if (!roles.includes(req.actor.role)) return next(new HttpError(403, 'Seu perfil não permite esta operação'));
    next();
  };
}

export function actorOf(req: Request): Actor {
  if (!req.actor) throw new HttpError(401, 'Não autenticado');
  return req.actor;
}
