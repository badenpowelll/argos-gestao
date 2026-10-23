import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { table: string; op: string; payload?: unknown }[] = [];
let insertError: { message: string } | null = null;

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string, op: string, payload?: unknown) => {
    calls.push({ table, op, payload });
    const result = { error: table === "time_entries" && op === "insert" ? insertError : null };
    const chain: Record<string, unknown> = {};
    chain.eq = () => chain;
    chain.then = (resolve: (v: unknown) => void) => resolve(result);
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => ({
        update: (payload: unknown) => builder(table, "update", payload),
        insert: (payload: unknown) => builder(table, "insert", payload),
      }),
    },
  };
});

import { approveAdjustment, punchTypeOf } from "@/utils/adjustments";

const adj = { id: "a1", user_id: "u1", company_id: "c1", date: "2025-03-10", punch_step: "entrada", proposed_time: "08:00:00" };

describe("aprovação de ajuste", () => {
  beforeEach(() => { calls.length = 0; insertError = null; });

  it("mapeia a etapa para entrada/saída", () => {
    expect(punchTypeOf("entrada")).toBe("in");
    expect(punchTypeOf("retorno_almoco")).toBe("in");
    expect(punchTypeOf("saida_almoco")).toBe("out");
    expect(punchTypeOf("saida")).toBe("out");
  });

  it("aprova, cria a marcação e audita", async () => {
    const r = await approveAdjustment(adj, "m1");
    expect(r.ok).toBe(true);
    expect(calls.map((c) => `${c.table}:${c.op}`)).toEqual(["adjustments:update", "time_entries:insert", "audit_logs:insert"]);
  });

  it("volta o ajuste a pendente se a marcação não puder ser criada", async () => {
    insertError = { message: "violates row-level security policy" };
    const r = await approveAdjustment(adj, "m1");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("continua pendente");
    const last = calls[calls.length - 1];
    expect(last.op).toBe("update");
    expect((last.payload as { status: string }).status).toBe("pending");
    expect(calls.some((c) => c.table === "audit_logs")).toBe(false);
  });
});
