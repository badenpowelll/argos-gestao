import { supabase } from "@/integrations/supabase/client";

/**
 * Cliente sem tipos para tabelas, colunas e funções criadas por migrations ainda ausentes de
 * `src/integrations/supabase/types.ts` (arquivo gerado e protegido). Use só onde for inevitável.
 */
export type DbError = { message: string; code?: string } | null;
export interface Query extends PromiseLike<{ data: unknown; error: DbError }> {
  select(cols: string): Query;
  update(values: Record<string, unknown>): Query;
  eq(col: string, value: unknown): Query;
  gte(col: string, value: unknown): Query;
  lte(col: string, value: unknown): Query;
  order(col: string, opts?: { ascending: boolean }): Query;
  limit(n: number): Query;
  maybeSingle(): Query;
}

export const db = supabase as unknown as {
  from(table: string): Query;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }>;
};

/** Erros que indicam que a migration correspondente ainda não foi aplicada. */
export const isMissingSchema = (error: DbError) =>
  !!error && (["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(error.code ?? "") || /does not exist|Could not find/i.test(error.message));
