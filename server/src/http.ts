import type {NextFunction, Request, RequestHandler, Response} from 'express';
import {ZodError, type ZodTypeAny, type z} from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(422, 'Dados inválidos', 'validation', result.error.flatten());
  }
  return result.data;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({error: err.message, code: err.code, details: err.details});
    return;
  }
  if (err instanceof ZodError) {
    res.status(422).json({error: 'Dados inválidos', code: 'validation', details: err.flatten()});
    return;
  }
  const pgErr = err as {code?: string; constraint?: string; message?: string};
  if (pgErr.code === '23505') {
    res.status(409).json({error: 'Registro duplicado', code: 'duplicate', details: {constraint: pgErr.constraint}});
    return;
  }
  if (pgErr.code === '23503') {
    res.status(409).json({error: 'Registro vinculado a outros dados', code: 'fk_violation'});
    return;
  }
  if (pgErr.code === '23514' || pgErr.code === '22P02' || pgErr.code === '22007') {
    res.status(422).json({error: 'Valor inválido', code: 'check_violation', details: {constraint: pgErr.constraint}});
    return;
  }
  console.error('[erro]', err);
  res.status(500).json({error: 'Erro interno do servidor'});
}
