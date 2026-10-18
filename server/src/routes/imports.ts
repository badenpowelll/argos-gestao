import {Router} from 'express';
import {z} from 'zod';
import {audit} from '../audit.js';
import {WRITERS, actorOf, requireRole} from '../auth.js';
import {withTx, type Db} from '../db.js';
import {extractContract, type Extraction} from '../extract/contract.js';
import {extractText} from '../extract/text.js';
import {HttpError, asyncHandler, parse} from '../http.js';
import {uuid} from '../lib/sql.js';
import {clientSchema, insertClient} from './clients.js';
import {contractSchema, insertContract, itemSchema} from './contracts.js';
import {storeDocument, upload} from './documents.js';
import {systemSchema} from './systems.js';

export function importRoutes(db: Db) {
  const r = Router();
  r.use(requireRole(...WRITERS));

  r.get('/', asyncHandler(async (_req, res) => {
    const {rows} = await db.query(
      `select i.id, i.status, i.created_at, i.confirmed_at, i.contract_id, d.filename, d.size_bytes,
              i.extraction->>'document_kind' as document_kind
         from contract_imports i join documents d on d.id = i.document_id order by i.created_at desc limit 200`
    );
    res.json(rows);
  }));

  // 1) Upload: guarda o original, extrai e devolve para REVISÃO. Nada é cadastrado aqui.
  r.post('/', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(422, 'Envie um arquivo (PDF, DOCX ou TXT)');
    const actor = actorOf(req);
    const result = await withTx(db, async (tx) => {
      const {doc, type} = await storeDocument(tx, req.file!, {kind: 'contrato_original', userId: actor.id});
      const dup = await tx.query('select id, filename from documents where sha256 = $1 and id <> $2 limit 1', [doc.sha256, doc.id]);
      const {text, pages} = await extractText(req.file!.buffer, type);
      let extraction: Extraction;
      if (text.trim().length < 40) {
        extraction = {
          document_kind: 'indefinido', fields: [], items: [], text_length: text.length, pages: pages.length,
          issues: [{level: 'erro', message: 'O arquivo não contém texto legível (provavelmente um PDF digitalizado). Preencha os dados manualmente na revisão; o original foi preservado.'}]
        };
      } else extraction = extractContract(text, pages);
      if (dup.rows[0]) extraction.issues.unshift({level: 'aviso', message: `Este arquivo já foi enviado antes (${dup.rows[0].filename}). Verifique para não duplicar contrato.`});
      const ins = await tx.query('insert into contract_imports (document_id, extraction, created_by) values ($1,$2,$3) returning id, status, created_at', [doc.id, JSON.stringify(extraction), actor.id]);
      await audit(tx, actor, 'import.upload', 'import', ins.rows[0].id, {document: doc.id, filename: doc.filename, sha256: doc.sha256});
      return {import: ins.rows[0], document: doc, extraction, duplicate_of: dup.rows[0]?.id ?? null};
    });
    res.status(201).json(result);
  }));

  r.get('/:id', asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const {rows} = await db.query(
      `select i.*, d.filename, d.size_bytes, d.mime from contract_imports i join documents d on d.id = i.document_id where i.id = $1`, [id]);
    if (!rows[0]) throw new HttpError(404, 'Importação não encontrada');
    res.json(rows[0]);
  }));

  // 2) Confirmação humana: só aqui cliente/sistema/contrato são gravados.
  r.post('/:id/confirm', asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const actor = actorOf(req);
    const body = parse(
      z.object({
        reviewed: z.literal(true, {errorMap: () => ({message: 'Confirme que revisou os dados com o documento original'})}),
        client_id: uuid.nullish(),
        client: clientSchema.nullish(),
        system: systemSchema.omit({client_id: true}).nullish(),
        contract: contractSchema.innerType().omit({client_id: true, system_id: true, source_document_id: true}).extend({
          client_id: uuid.nullish(), system_id: uuid.nullish() // a tela envia null quando não há sistema
        }),
        items: z.array(itemSchema).min(1, 'Informe ao menos um item')
      }),
      req.body
    );
    if (!body.client_id && !body.client) throw new HttpError(422, 'Selecione um cliente existente ou informe os dados do novo cliente');

    const out = await withTx(db, async (tx) => {
      const imp = (await tx.query('select * from contract_imports where id = $1 for update', [id])).rows[0];
      if (!imp) throw new HttpError(404, 'Importação não encontrada');
      if (imp.status !== 'revisao') throw new HttpError(409, 'Esta importação já foi confirmada ou descartada', 'import_closed');

      let clientId = body.client_id ?? null;
      let created = false;
      if (!clientId) {
        const doc = body.client!.document;
        const existing = doc ? (await tx.query('select id from clients where document = $1', [doc])).rows[0] : null;
        if (existing) clientId = existing.id as string; // vincula ao cliente já cadastrado com o mesmo documento
        else {
          clientId = (await insertClient(tx, actor, body.client!)).id as string;
          created = true;
        }
      }
      let systemId: string | null = null;
      if (body.system) {
        const s = await tx.query(
          `insert into systems (client_id, name, description, access_url, domain, infrastructure, database_info, version, delivered_at, implemented_at, maintenance_until, support_until, operational_cost_cents, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
          [clientId, body.system.name, body.system.description, body.system.access_url, body.system.domain, body.system.infrastructure, body.system.database_info, body.system.version,
           body.system.delivered_at, body.system.implemented_at, body.system.maintenance_until, body.system.support_until, body.system.operational_cost_cents, body.system.status]
        );
        systemId = s.rows[0].id;
        await audit(tx, actor, 'system.create', 'system', systemId, {name: body.system.name, via: 'import'});
      }
      const contract = await insertContract(
        tx, actor,
        {...contractSchema.parse({...body.contract, client_id: clientId, system_id: systemId, source_document_id: imp.document_id})},
        body.items
      );
      await tx.query("update contract_imports set status='confirmado', contract_id=$2, confirmed_at=now() where id=$1", [id, contract.id]);
      await audit(tx, actor, 'import.confirm', 'import', id, {contract: contract.id, client: clientId, created_client: created});
      return {contract, client_id: clientId, created_client: created};
    });
    res.status(201).json(out);
  }));

  r.post('/:id/discard', asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const {rowCount} = await db.query("update contract_imports set status='descartado' where id = $1 and status='revisao'", [id]);
    if (!rowCount) throw new HttpError(409, 'Importação não está em revisão');
    await audit(db, actorOf(req), 'import.discard', 'import', id);
    res.json({ok: true});
  }));

  return r;
}
