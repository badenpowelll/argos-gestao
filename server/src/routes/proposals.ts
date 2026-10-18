import crypto from 'node:crypto';
import {Router} from 'express';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import {audit, type Actor} from '../audit.js';
import {FINANCE, WRITERS, actorOf, requireRole} from '../auth.js';
import {withTx, type Db, type Tx} from '../db.js';
import {HttpError, asyncHandler, parse} from '../http.js';
import {addMonths, today} from '../lib/dates.js';
import {isValidDocument, onlyDigits, toWhatsappNumber} from '../lib/documents.js';
import {formatBRL} from '../lib/money.js';
import {isoDateSchema, uuid} from '../lib/sql.js';
import {computeProposal, type ComputedProposal} from '../pricing/compute.js';
import {defaultContent, proposalContentSchema, type ProposalContent} from '../pricing/content.js';
import {currentTax, latestFx, loadCatalog, loadCompany, loadSettings} from '../pricing/data.js';
import {renderProposalPdf, type ProposalDocData} from '../pricing/pdf.js';
import {buildPixPayload, validatePixPayload} from '../pricing/pix.js';
import {clientSchema, insertClient} from './clients.js';
import {contractSchema, insertContract, itemSchema} from './contracts.js';
import {storeDocument} from './documents.js';

type ClientSnap = {name: string; document: string | null; address: string | null; email?: string | null; phone?: string | null; whatsapp?: string | null; kind?: string | null};

const addr = (c: Record<string, string | null>) => [c.street, c.number, c.complement, c.district, c.city && c.state ? `${c.city}/${c.state}` : c.city, c.zip ? `CEP ${c.zip}` : null].filter(Boolean).join(', ') || null;

async function snapshotOf(db: Db | Tx, clientId: string): Promise<ClientSnap> {
  const c = (await db.query('select * from clients where id = $1', [clientId])).rows[0];
  if (!c) throw new HttpError(404, 'Cliente não encontrado');
  return {name: c.name, document: c.document, address: addr(c), email: c.email, phone: c.phone, whatsapp: c.whatsapp, kind: c.kind};
}

async function liveCtx(db: Db | Tx) {
  const [catalog, fx, settings, tax] = await Promise.all([loadCatalog(db), latestFx(db), loadSettings(db), currentTax(db, today())]);
  return {catalog, fx, settings, tax};
}

const totalsOf = (c: ComputedProposal) => ({one_time_cents: c.totals.one_time_final_cents, monthly_cents: c.totals.monthly_final_cents});

async function docData(opts: {
  proposal: Record<string, any>; version: Record<string, any>; content: ProposalContent; computed: ComputedProposal; client: ClientSnap;
  company: Awaited<ReturnType<typeof loadCompany>>; draft: boolean; issued_at: string | null; valid_until: string | null; pixPayload: string | null;
}): Promise<ProposalDocData> {
  return {
    number: opts.proposal.number, draft: opts.draft, project_name: opts.content.identification.project_name,
    commercial_owner: opts.content.identification.commercial_owner ?? null, issued_at: opts.issued_at, valid_until: opts.valid_until, version: opts.version.version,
    client: {name: opts.client.name, document: opts.client.document, address: opts.client.address}, company: opts.company, content: opts.content, computed: opts.computed, pix_payload: opts.pixPayload
  };
}

function pixFor(content: ProposalContent, company: Record<string, any>, computed: ComputedProposal): {payload: string | null; error: string | null} {
  if (!content.pix.include_qr) return {payload: null, error: null};
  const key = content.pix.key === 'cnpj' ? company.pix_key_cnpj : company.pix_key_random;
  if (!key) return {payload: null, error: 'Chave Pix selecionada não está configurada na empresa'};
  try {
    const payload = buildPixPayload({key, receiver_name: company.pix_receiver_name ?? company.trade_name, city: company.pix_city ?? 'NATAL', amount_cents: computed.totals.entry_cents});
    const v = validatePixPayload(payload);
    return v.valid ? {payload, error: null} : {payload: null, error: `Payload Pix inválido: ${v.errors.join('; ')}`};
  } catch (e) {
    return {payload: null, error: (e as Error).message};
  }
}

export function proposalRoutes(db: Db, appOrigin: string | null = null) {
  const r = Router();

  r.get('/', asyncHandler(async (_req, res) => {
    const {rows} = await db.query(
      `select p.id, p.number, p.status, p.project_name, p.current_version, p.issued_at::text as issued_at, p.valid_until::text as valid_until, p.created_at, p.updated_at, p.contract_id, p.client_id,
              coalesce(c.name, p.client_snapshot->>'name') as client_name,
              case when p.status in ('emitida','enviada') and p.valid_until < $1::date then 'expirada' else p.status end as display_status,
              coalesce(v.result->'one_time'->>'price_final_cents', '0')::bigint as one_time_cents,
              coalesce(v.result->'recurring'->>'price_final_cents', '0')::bigint as monthly_cents
         from proposals p left join clients c on c.id = p.client_id
         left join proposal_versions v on v.proposal_id = p.id and v.version = coalesce(p.approved_version, p.current_version)
        order by p.created_at desc limit 500`, [today()]);
    res.json(rows);
  }));

  r.post('/', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const b = parse(z.object({
      client_id: uuid.nullish(),
      client: z.object({name: z.string().trim().min(2).max(200), document: z.string().trim().max(20).nullish(), address: z.string().trim().max(300).nullish()}).nullish(),
      project_name: z.string().trim().min(2).max(200),
      commercial_owner: z.string().trim().max(150).nullish(),
      template_ids: z.array(uuid).max(5).default([])
    }), req.body);
    if (!b.client_id && !b.client) throw new HttpError(422, 'Selecione um cliente ou informe os dados do cliente');
    const actor = actorOf(req);
    const out = await withTx(db, async (tx) => {
      const snap: ClientSnap = b.client_id ? await snapshotOf(tx, b.client_id) : {name: b.client!.name, document: b.client!.document ? onlyDigits(b.client!.document) : null, address: b.client!.address ?? null};
      if (snap.document && !isValidDocument(snap.document)) throw new HttpError(422, 'CPF/CNPJ inválido');
      const settings = await loadSettings(tx);
      const content = defaultContent(settings, b.project_name);
      content.identification.commercial_owner = b.commercial_owner ?? null;
      if (b.template_ids.length) {
        const t = (await tx.query('select kind, body from proposal_templates where id = any($1::uuid[])', [b.template_ids])).rows;
        for (const row of t) {
          if (row.kind === 'escopo' && row.body) { content.scope = {summary: row.body.summary ?? '', groups: row.body.groups ?? []}; }
          if (row.kind === 'fora_escopo' && Array.isArray(row.body)) content.out_of_scope = row.body;
          if (row.kind === 'condicoes' && Array.isArray(row.body)) content.conditions = row.body;
        }
      }
      const seq = (await tx.query("select nextval('proposal_number_seq')::int as n")).rows[0].n;
      const number = `PROP-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;
      const p = (await tx.query(
        `insert into proposals (number, client_id, project_name, client_snapshot, commercial_owner, created_by) values ($1,$2,$3,$4,$5,$6) returning *`,
        [number, b.client_id ?? null, b.project_name, JSON.stringify(snap), b.commercial_owner ?? null, actor.id])).rows[0];
      await tx.query('insert into proposal_versions (proposal_id, version, content, created_by) values ($1,1,$2,$3)', [p.id, JSON.stringify(proposalContentSchema.parse(content)), actor.id]);
      await audit(tx, actor, 'proposal.create', 'proposal', p.id, {number, client_id: b.client_id ?? null});
      return p;
    });
    res.status(201).json(out);
  }));

  r.get('/:id', asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const p = (await db.query('select p.*, p.issued_at::text as issued_at, p.valid_until::text as valid_until from proposals p where id = $1', [id])).rows[0];
    if (!p) throw new HttpError(404, 'Proposta não encontrada');
    const versions = (await db.query(
      `select version, status, change_note, created_at, issued_at, pdf_document_id,
              coalesce(result->'one_time'->>'price_final_cents','0')::bigint as one_time_cents, coalesce(result->'recurring'->>'price_final_cents','0')::bigint as monthly_cents
         from proposal_versions where proposal_id = $1 order by version desc`, [id])).rows;
    const wanted = req.query.version ? Number(req.query.version) : p.current_version;
    const v = (await db.query('select * from proposal_versions where proposal_id = $1 and version = $2', [id, wanted])).rows[0];
    if (!v) throw new HttpError(404, 'Versão não encontrada');
    // rascunho: recalcula ao vivo; emitida: usa o resultado CONGELADO
    let computed: ComputedProposal;
    if (v.status === 'emitida') computed = v.result as ComputedProposal;
    else computed = computeProposal(v.content, await liveCtx(db));
    const history = (await db.query(
      `select at, user_name, action, detail from audit_log where entity = 'proposal' and entity_id = $1 order by at desc limit 200`, [id])).rows;
    res.json({proposal: p, version: {...v, content: v.content}, computed, versions, history, stale_warning: v.status === 'emitida' ? null : null});
  }));

  r.put('/:id/draft', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const b = parse(z.object({
      content: proposalContentSchema, change_note: z.string().max(300).nullish(),
      client_id: uuid.nullish(), client: z.object({name: z.string().trim().min(2).max(200), document: z.string().trim().max(20).nullish(), address: z.string().trim().max(300).nullish()}).nullish()
    }), req.body);
    const actor = actorOf(req);
    const out = await withTx(db, async (tx) => {
      const p = (await tx.query('select * from proposals where id = $1 for update', [id])).rows[0];
      if (!p) throw new HttpError(404, 'Proposta não encontrada');
      const v = (await tx.query('select * from proposal_versions where proposal_id = $1 and version = $2 for update', [id, p.current_version])).rows[0];
      if (v.status !== 'rascunho') throw new HttpError(409, 'A versão atual já foi emitida. Crie uma nova versão para editar.', 'version_issued');
      const ctx = await liveCtx(tx);
      const before = computeProposal(v.content, ctx);
      const after = computeProposal(b.content, ctx);
      let snap = p.client_snapshot as ClientSnap;
      let clientId = p.client_id as string | null;
      if (b.client_id !== undefined && b.client_id !== clientId) { clientId = b.client_id ?? null; if (clientId) snap = await snapshotOf(tx, clientId); }
      else if (b.client && !clientId) {
        const doc = b.client.document ? onlyDigits(b.client.document) : null;
        if (doc && !isValidDocument(doc)) throw new HttpError(422, 'CPF/CNPJ inválido');
        snap = {name: b.client.name, document: doc, address: b.client.address ?? null};
      }
      await tx.query('update proposal_versions set content = $3, change_note = coalesce($4, change_note) where proposal_id = $1 and version = $2', [id, p.current_version, JSON.stringify(b.content), b.change_note ?? null]);
      await tx.query('update proposals set project_name = $2, commercial_owner = $3, client_id = $4, client_snapshot = $5, updated_at = now() where id = $1',
        [id, b.content.identification.project_name, b.content.identification.commercial_owner ?? null, clientId, JSON.stringify(snap)]);
      await audit(tx, actor, 'proposal.update', 'proposal', id, {version: p.current_version, before: totalsOf(before), after: totalsOf(after), note: b.change_note ?? null});
      return after;
    });
    res.json({computed: out});
  }));

  r.post('/:id/new-version', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const b = parse(z.object({change_note: z.string().trim().min(3).max(300)}), req.body);
    const actor = actorOf(req);
    const out = await withTx(db, async (tx) => {
      const p = (await tx.query('select * from proposals where id = $1 for update', [id])).rows[0];
      if (!p) throw new HttpError(404, 'Proposta não encontrada');
      if (p.status === 'aprovada') throw new HttpError(409, 'Proposta aprovada é preservada: não pode ser versionada', 'approved');
      const v = (await tx.query('select * from proposal_versions where proposal_id = $1 and version = $2', [id, p.current_version])).rows[0];
      if (v.status === 'rascunho') throw new HttpError(409, 'A versão atual ainda é um rascunho; edite-a diretamente.', 'already_draft');
      const next = p.current_version + 1;
      await tx.query('insert into proposal_versions (proposal_id, version, content, change_note, created_by) values ($1,$2,$3,$4,$5)', [id, next, JSON.stringify(v.content), b.change_note, actor.id]);
      await tx.query("update proposals set current_version = $2, status = 'rascunho', updated_at = now() where id = $1", [id, next]);
      await audit(tx, actor, 'proposal.new_version', 'proposal', id, {from: p.current_version, to: next, note: b.change_note});
      return {version: next};
    });
    res.status(201).json(out);
  }));

  // Emissão: valida bloqueios, congela cálculo/câmbio/tributos/dados e gera o PDF oficial
  r.post('/:id/issue', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    parse(z.object({confirm: z.literal(true, {errorMap: () => ({message: 'Confirmação explícita obrigatória'})})}), req.body);
    const actor = actorOf(req);
    const out = await withTx(db, async (tx) => {
      const p = (await tx.query('select * from proposals where id = $1 for update', [id])).rows[0];
      if (!p) throw new HttpError(404, 'Proposta não encontrada');
      const v = (await tx.query('select * from proposal_versions where proposal_id = $1 and version = $2 for update', [id, p.current_version])).rows[0];
      if (v.status !== 'rascunho') throw new HttpError(409, 'Versão já emitida');
      const content = proposalContentSchema.parse(v.content);
      const ctx = await liveCtx(tx);
      const computed = computeProposal(content, ctx);
      if (computed.result.blocking_open.length) {
        throw new HttpError(422, 'Existem pendências que impedem a emissão', 'blocking', {blocking: computed.result.alerts.filter((a) => a.blocking)});
      }
      if (computed.totals.one_time_final_cents <= 0 && computed.totals.monthly_final_cents <= 0) throw new HttpError(422, 'A proposta não tem valores', 'empty');
      const snap = p.client_snapshot as ClientSnap;
      if (!snap?.name) throw new HttpError(422, 'Informe o cliente', 'no_client');
      const company = await loadCompany(tx);
      const pix = pixFor(content, company, computed);
      if (pix.error) throw new HttpError(422, pix.error, 'pix_invalid');
      const issued = today();
      const validUntil = new Date(Date.parse(`${issued}T00:00:00Z`) + content.identification.validity_days * 86_400_000).toISOString().slice(0, 10);
      const pdf = await renderProposalPdf(await docData({proposal: p, version: v, content, computed, client: snap, company, draft: false, issued_at: issued, valid_until: validUntil, pixPayload: pix.payload}));
      const {doc} = await storeDocument(tx, {buffer: pdf, originalname: `Proposta-${p.number}-v${v.version}.pdf`}, {kind: 'anexo', userId: actor.id, clientId: p.client_id}, ['pdf']);
      const snapshots = {client: snap, company, fx: computed.fx_used, tax: computed.tax_used, settings: ctx.settings, pix_payload: pix.payload, catalog: ctx.catalog.filter((c) => [...content.calc.one_time_catalog, ...content.calc.recurring_catalog].some((x) => x.catalog_item_id === c.id))};
      await tx.query("update proposal_versions set status='emitida', result=$3, snapshots=$4, pdf_document_id=$5, issued_at=now() where proposal_id=$1 and version=$2", [id, v.version, JSON.stringify(computed), JSON.stringify(snapshots), doc.id]);
      await tx.query("update proposals set status='emitida', issued_at=$2, valid_until=$3, updated_at=now() where id=$1", [id, issued, validUntil]);
      await audit(tx, actor, 'proposal.issue', 'proposal', id, {version: v.version, totals: totalsOf(computed), document: doc.id, valid_until: validUntil});
      return {version: v.version, document_id: doc.id, issued_at: issued, valid_until: validUntil, google_qr: !!company.google_review_url && content.google_review.include};
    });
    res.json(out);
  }));

  // PDF: versão emitida = arquivo oficial armazenado; rascunho = pré-visualização (marcada como rascunho)
  r.get('/:id/pdf', asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const p = (await db.query('select * from proposals where id = $1', [id])).rows[0];
    if (!p) throw new HttpError(404, 'Proposta não encontrada');
    const wanted = req.query.version ? Number(req.query.version) : p.current_version;
    const v = (await db.query('select * from proposal_versions where proposal_id = $1 and version = $2', [id, wanted])).rows[0];
    if (!v) throw new HttpError(404, 'Versão não encontrada');
    let buf: Buffer;
    if (v.status === 'emitida' && v.pdf_document_id) {
      buf = (await db.query('select content from documents where id = $1', [v.pdf_document_id])).rows[0].content;
    } else {
      const content = proposalContentSchema.parse(v.content);
      const computed = computeProposal(content, await liveCtx(db));
      const company = await loadCompany(db);
      const pix = pixFor(content, company, computed);
      buf = await renderProposalPdf(await docData({proposal: p, version: v, content, computed, client: p.client_snapshot, company, draft: true, issued_at: null, valid_until: null, pixPayload: pix.payload}));
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${p.number}-v${v.version}${v.status === 'emitida' ? '' : '-rascunho'}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.send(buf);
  }));

  r.post('/:id/status', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const b = parse(z.object({status: z.enum(['enviada', 'recusada', 'cancelada']), reason: z.string().trim().max(300).nullish(), confirm: z.literal(true)}), req.body);
    const p = (await db.query('select status from proposals where id = $1', [id])).rows[0];
    if (!p) throw new HttpError(404, 'Proposta não encontrada');
    if (p.status === 'aprovada') throw new HttpError(409, 'Proposta aprovada não muda de status por aqui');
    if (b.status === 'enviada' && p.status !== 'emitida') throw new HttpError(409, 'Só propostas emitidas podem ser marcadas como enviadas');
    if (b.status !== 'enviada' && (!b.reason || b.reason.length < 5)) throw new HttpError(422, 'Informe o motivo');
    await db.query('update proposals set status = $2, updated_at = now() where id = $1', [id, b.status]);
    await audit(db, actorOf(req), 'proposal.status', 'proposal', id, {from: p.status, to: b.status, reason: b.reason ?? null});
    res.json({ok: true});
  }));

  // Aprovação: preserva a versão, vincula cliente, cria CONTRATO em rascunho + sistema (cobranças só após ativação confirmada)
  r.post('/:id/approve', requireRole(...FINANCE), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const b = parse(z.object({
      confirm: z.literal(true, {errorMap: () => ({message: 'Confirmação explícita obrigatória'})}),
      option_id: z.string().min(1),
      signed_at: isoDateSchema,
      entry_due_date: isoDateSchema.nullish(),
      monthly_first_due_date: isoDateSchema.nullish(),
      due_day: z.number().int().min(1).max(31).nullish(),
      client_id: uuid.nullish(),
      create_client: z.boolean().default(false)
    }), req.body);
    const actor: Actor = actorOf(req);
    const out = await withTx(db, async (tx) => {
      const p = (await tx.query('select * from proposals where id = $1 for update', [id])).rows[0];
      if (!p) throw new HttpError(404, 'Proposta não encontrada');
      if (p.status === 'aprovada') throw new HttpError(409, 'Proposta já aprovada', 'already_approved');
      if (!['emitida', 'enviada'].includes(p.status)) throw new HttpError(409, 'Somente propostas emitidas podem ser aprovadas');
      if (p.valid_until && p.valid_until < today()) throw new HttpError(409, 'Proposta com validade expirada: crie uma nova versão e emita novamente', 'expired');
      const v = (await tx.query('select * from proposal_versions where proposal_id = $1 and version = $2 for update', [id, p.current_version])).rows[0];
      if (v.status !== 'emitida') throw new HttpError(409, 'Versão não emitida');
      const computed = v.result as ComputedProposal;
      const content = v.content as ProposalContent;
      const option = computed.payments.find((x) => x.id === b.option_id);
      if (!option) throw new HttpError(422, 'Opção de pagamento escolhida não existe na proposta');
      const one = computed.result.one_time.price_final_cents;
      const mo = computed.result.recurring.price_final_cents;
      if (one > 0 && !b.entry_due_date) throw new HttpError(422, 'Informe o vencimento do valor inicial');
      if (mo > 0 && !b.monthly_first_due_date) throw new HttpError(422, 'Informe o primeiro vencimento da mensalidade');

      // cliente
      let clientId: string | null = b.client_id ?? p.client_id;
      if (!clientId) {
        if (!b.create_client) throw new HttpError(422, 'A proposta não está vinculada a um cliente cadastrado. Vincule um cliente ou confirme a criação a partir dos dados da proposta.', 'no_client');
        const s = p.client_snapshot as ClientSnap;
        const doc = s.document ? onlyDigits(s.document) : null;
        const kind = doc && doc.length === 11 ? 'pessoa_fisica' : 'empresa_privada';
        const data = clientSchema.parse({kind, name: s.name, document: doc, email: s.email ?? null, phone: s.phone ?? null, whatsapp: s.whatsapp ?? null, status: 'ativo', notes: `Criado a partir da proposta ${p.number}`});
        clientId = (await insertClient(tx, actor, data)).id as string;
      }
      const sys = (await tx.query("insert into systems (client_id, name, description, status) values ($1,$2,$3,'em_desenvolvimento') returning id", [clientId, content.identification.project_name, content.scope.summary || null])).rows[0];
      await audit(tx, actor, 'system.create', 'system', sys.id, {name: content.identification.project_name, via: 'proposal', proposal: p.number});

      const items: z.infer<typeof itemSchema>[] = [];
      if (one > 0) items.push(itemSchema.parse({kind: 'implementacao', description: `Implantação e desenvolvimento — ${content.identification.project_name}`, billing_type: 'unico', unit_amount_cents: one, first_due_date: b.entry_due_date, notes: `Proposta ${p.number} v${v.version}`}));
      if (mo > 0) items.push(itemSchema.parse({kind: 'mensalidade', description: `Mensalidade — ${content.identification.project_name}`, billing_type: 'recorrente', unit_amount_cents: mo, first_due_date: b.monthly_first_due_date, notes: `Proposta ${p.number} v${v.version}`}));
      const terms = `${option.title}: ${option.rows.map((r) => `${r.label}${r.amount_cents !== null ? ` ${(r.amount_cents / 100).toFixed(2).replace('.', ',')}` : ''}`).join('; ')}`;
      const contract = await insertContract(tx, actor, contractSchema.parse({
        client_id: clientId, system_id: sys.id, kind: 'contrato', object: content.scope.summary || content.identification.project_name, signed_at: b.signed_at,
        start_date: null, end_date: null, auto_renew: false, adjustment_index: null, adjustment_month: null, payment_terms: terms.slice(0, 1900), due_day: b.due_day ?? null,
        fine_percent: 0, interest_monthly_percent: 0, is_public_flow: false, administrative_process: null, commitment_number: null,
        notes: `Gerado da proposta ${p.number} (versão ${v.version}) aprovada.`, source_document_id: null, parent_contract_id: null
      }), items);
      await tx.query('update contracts set source_proposal_id = $2 where id = $1', [contract.id, id]);
      await tx.query("update proposals set status='aprovada', approved_version=$2, approved_at=now(), approved_by=$3, contract_id=$4, client_id=$5, updated_at=now() where id=$1", [id, v.version, actor.id, contract.id, clientId]);
      await audit(tx, actor, 'proposal.approve', 'proposal', id, {version: v.version, option: b.option_id, contract: contract.id, client: clientId, totals: totalsOf(computed)});
      return {contract_id: contract.id as string, client_id: clientId, contract_number: contract.number as string};
    });
    res.status(201).json(out);
  }));

  // ---- envio ao cliente (WhatsApp): link seguro do PDF + mensagem pronta + registro do envio
  const loadIssued = async (id: string, versionQ: unknown) => {
    const p = (await db.query('select p.*, p.valid_until::text as valid_until from proposals p where id = $1', [id])).rows[0];
    if (!p) throw new HttpError(404, 'Proposta não encontrada');
    const version = versionQ ? Number(versionQ) : p.current_version;
    const v = (await db.query('select * from proposal_versions where proposal_id = $1 and version = $2', [id, version])).rows[0];
    if (!v) throw new HttpError(404, 'Versão não encontrada');
    if (v.status !== 'emitida') throw new HttpError(409, 'Emita a proposta antes de enviá-la ao cliente', 'not_issued');
    return {p, v};
  };

  r.get('/:id/shares', asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const {rows} = await db.query('select id, version, expires_at, revoked_at, views, last_viewed_at, created_at from proposal_shares where proposal_id = $1 order by created_at desc', [id]);
    res.json(rows);
  }));

  r.post('/:id/share', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const b = parse(z.object({version: z.number().int().optional(), confirm: z.literal(true, {errorMap: () => ({message: 'Confirmação explícita obrigatória'})})}), req.body);
    const {p, v} = await loadIssued(id, b.version);
    if (p.status === 'cancelada' || p.status === 'recusada') throw new HttpError(409, 'Proposta cancelada/recusada não pode ser compartilhada');
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const until = p.valid_until ? `${p.valid_until}T23:59:59-03:00` : new Date(Date.now() + 15 * 86_400_000).toISOString();
    const expires = new Date(Math.max(Date.parse(until), Date.now() + 24 * 3600_000)); // no mínimo 24 h
    await db.query('insert into proposal_shares (proposal_id, version, token_hash, expires_at, created_by) values ($1,$2,$3,$4,$5)', [id, v.version, hash, expires.toISOString(), actorOf(req).id]);
    await audit(db, actorOf(req), 'proposal.share', 'proposal', id, {version: v.version, expires_at: expires.toISOString()});
    const origin = appOrigin ?? `${req.protocol}://${req.get('host')}`;
    res.status(201).json({url: `${origin}/p/${token}`, expires_at: expires.toISOString(), version: v.version});
  }));

  r.post('/:id/shares/:shareId/revoke', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const {rowCount} = await db.query('update proposal_shares set revoked_at = now() where id = $1 and proposal_id = $2 and revoked_at is null', [parse(uuid, req.params.shareId), id]);
    if (!rowCount) throw new HttpError(404, 'Link não encontrado ou já revogado');
    await audit(db, actorOf(req), 'proposal.share_revoke', 'proposal', id, {share: req.params.shareId});
    res.json({ok: true});
  }));

  r.get('/:id/whatsapp', asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const {p, v} = await loadIssued(id, req.query.version);
    const shareUrl = typeof req.query.share_url === 'string' ? req.query.share_url : null;
    if (shareUrl && !/^https?:\/\/[^\s]+\/p\/[A-Za-z0-9_-]{20,}$/.test(shareUrl)) throw new HttpError(422, 'Link de compartilhamento inválido');
    const computed = v.result as ComputedProposal;
    const company = await loadCompany(db);
    const cl = p.client_id ? (await db.query('select name, whatsapp, phone, responsible_name from clients where id = $1', [p.client_id])).rows[0] : null;
    const snap = p.client_snapshot as ClientSnap;
    const number = toWhatsappNumber(typeof req.query.phone === 'string' && req.query.phone ? req.query.phone : (cl?.whatsapp ?? cl?.phone ?? snap.whatsapp ?? snap.phone));
    const one = computed.totals.one_time_final_cents;
    const mo = computed.totals.monthly_final_cents;
    const valid = p.valid_until ? p.valid_until.split('-').reverse().join('/') : null;
    const lines = [
      `Olá${cl?.responsible_name ? `, ${cl.responsible_name}` : ''}!`,
      `Segue a proposta comercial ${p.number} — ${v.content.identification.project_name}.`,
      [one > 0 ? `Investimento inicial: ${formatBRL(one)}` : null, mo > 0 ? `Mensalidade: ${formatBRL(mo)}` : null].filter(Boolean).join('\n') || null,
      valid ? `Validade: até ${valid}.` : null,
      shareUrl ? `Para ver a proposta completa em PDF:\n${shareUrl}` : null,
      'Qualquer dúvida, estou à disposição.',
      `${company.trade_name}${company.whatsapp ? ` — ${formatContact(company.whatsapp)}` : ''}`
    ].filter(Boolean);
    const message = lines.join('\n\n');
    res.json({message, phone: number, link: number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null, client_has_number: !!number});
  }));

  r.post('/:id/sent', requireRole(...WRITERS), asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const b = parse(z.object({message: z.string().max(4000).nullish(), channel: z.enum(['whatsapp', 'email', 'outro']).default('whatsapp'), confirm: z.literal(true)}), req.body);
    const {p, v} = await loadIssued(id, undefined);
    const a = actorOf(req);
    await withTx(db, async (tx) => {
      if (p.client_id) await tx.query('insert into contact_log (client_id, channel, direction, message, operator_id, operator_name) values ($1,$2,\'saida\',$3,$4,$5)', [p.client_id, b.channel, b.message ?? `Proposta ${p.number} enviada`, a.id, a.name]);
      if (p.status === 'emitida') await tx.query("update proposals set status = 'enviada', updated_at = now() where id = $1", [id]);
      await audit(tx, a, 'proposal.sent', 'proposal', id, {channel: b.channel, version: v.version, manual: true});
    });
    res.json({ok: true, status: p.status === 'emitida' ? 'enviada' : p.status});
  }));

  void addMonths;
  return r;
}

/** Download público do PDF por link secreto (sem login). Token aleatório de 256 bits; só o hash fica no banco. */
export function publicProposalRoutes(db: Db) {
  const r = Router();
  const limiter = rateLimit({windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false});
  r.get('/:token', limiter, asyncHandler(async (req, res) => {
    const token = String(req.params.token ?? '');
    const notFound = () => new HttpError(404, 'Link inválido ou expirado');
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw notFound();
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const s = (await db.query(
      `select s.id, s.proposal_id, v.pdf_document_id, p.number, p.status from proposal_shares s
         join proposal_versions v on v.proposal_id = s.proposal_id and v.version = s.version join proposals p on p.id = s.proposal_id
        where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()`, [hash])).rows[0];
    if (!s || !s.pdf_document_id || ['cancelada', 'recusada'].includes(s.status)) throw notFound();
    const buf = (await db.query('select content from documents where id = $1', [s.pdf_document_id])).rows[0]?.content as Buffer | undefined;
    if (!buf) throw notFound();
    await db.query('update proposal_shares set views = views + 1, last_viewed_at = now() where id = $1', [s.id]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="Proposta-${s.number}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.send(buf);
  }));
  return r;
}

function formatContact(n: string): string {
  const d = n.replace(/^55/, '');
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : n;
}
