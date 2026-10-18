import type {Db, Tx} from './db.js';

export interface Actor {
  id: string;
  name: string;
  role: Role;
  ip?: string;
}
export type Role = 'admin' | 'financeiro' | 'operador' | 'leitura';

/** Registra no log imutável. Use o `tx` da operação para que auditoria e dado sejam atômicos. */
export async function audit(
  db: Db | Tx,
  actor: Pick<Actor, 'id' | 'name' | 'ip'> | null,
  action: string,
  entity: string,
  entityId: string | null,
  detail?: unknown
): Promise<void> {
  await db.query(
    `insert into audit_log (user_id, user_name, action, entity, entity_id, detail, ip)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [actor?.id ?? null, actor?.name ?? null, action, entity, entityId, detail === undefined ? null : JSON.stringify(detail), actor?.ip ?? null]
  );
}
