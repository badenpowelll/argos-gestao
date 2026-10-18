import {Router} from 'express';
import multer from 'multer';
import {audit} from '../audit.js';
import {actorOf} from '../auth.js';
import type {Db, Tx} from '../db.js';
import {HttpError, asyncHandler, parse} from '../http.js';
import {ALLOWED, MAX_UPLOAD, sha256, sniff} from '../extract/text.js';
import {uuid} from '../lib/sql.js';

export const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: MAX_UPLOAD, files: 1}});

/** Guarda o arquivo ORIGINAL em tabela privada (bytea) — acessível só por rota autenticada. */
export async function storeDocument(
  db: Db | Tx,
  file: {buffer: Buffer; originalname: string},
  meta: {kind: 'contrato_original' | 'comprovante' | 'anexo'; userId: string; clientId?: string | null; contractId?: string | null},
  allow: (keyof typeof ALLOWED)[] = ['pdf', 'docx', 'txt', 'json']
) {
  const type = sniff(file.buffer);
  if (!type || !allow.includes(type)) throw new HttpError(415, `Tipo de arquivo não permitido (aceitos: ${allow.join(', ')})`, 'bad_file_type');
  const filename = Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/[^\w.\-() ]+/g, '_').slice(0, 150) || 'arquivo';
  const {rows} = await db.query(
    `insert into documents (kind, filename, mime, size_bytes, sha256, content, client_id, contract_id, uploaded_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id, kind, filename, mime, size_bytes, sha256, created_at`,
    [meta.kind, filename, ALLOWED[type], file.buffer.length, sha256(file.buffer), file.buffer, meta.clientId ?? null, meta.contractId ?? null, meta.userId]
  );
  return {doc: rows[0], type};
}

export function documentRoutes(db: Db) {
  const r = Router();
  r.get('/:id', asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const {rows} = await db.query('select filename, mime, content from documents where id = $1', [id]);
    const d = rows[0];
    if (!d) throw new HttpError(404, 'Documento não encontrado');
    await audit(db, actorOf(req), 'document.download', 'document', id);
    res.setHeader('Content-Type', d.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(d.filename)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(d.content);
  }));
  return r;
}
