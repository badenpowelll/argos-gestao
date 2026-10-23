import { supabase } from "@/integrations/supabase/client";

export interface AdjustmentLike {
  id: string;
  user_id: string;
  company_id: string | null;
  date: string;
  punch_step: string;
  proposed_time: string | null;
}

export const punchTypeOf = (step: string): "in" | "out" =>
  step === "entrada" || step === "retorno_almoco" ? "in" : "out";

/**
 * Aprova um ajuste e cria a marcação correspondente. Se a marcação não puder ser criada
 * (por exemplo, permissão do banco), o ajuste volta a pendente em vez de ficar "aprovado" sem marcação.
 */
export const approveAdjustment = async (
  adj: AdjustmentLike,
  approverId: string,
): Promise<{ ok: boolean; message: string }> => {
  const { error } = await supabase
    .from("adjustments")
    .update({ status: "approved", approved_by: approverId })
    .eq("id", adj.id)
    .eq("status", "pending");
  if (error) return { ok: false, message: `Erro ao aprovar: ${error.message}` };

  const { error: insertError } = await supabase.from("time_entries").insert({
    user_id: adj.user_id,
    company_id: adj.company_id,
    type: punchTypeOf(adj.punch_step),
    timestamp: `${adj.date}T${adj.proposed_time || "08:00:00"}`,
    status: "verified",
    sync_status: "synced",
  });
  if (insertError) {
    await supabase.from("adjustments").update({ status: "pending", approved_by: null }).eq("id", adj.id);
    return {
      ok: false,
      message: `Não foi possível registrar a marcação (${insertError.message}). O ajuste continua pendente.`,
    };
  }

  // Auditoria: registra quem aprovou e o snapshot do ajuste.
  await supabase.from("audit_logs").insert({
    user_id: approverId,
    company_id: adj.company_id,
    action: "adjustment_approved",
    metadata: {
      adjustment_id: adj.id,
      target_user_id: adj.user_id,
      date: adj.date,
      punch_step: adj.punch_step,
      proposed_time: adj.proposed_time,
    },
    snapshot_before: { status: "pending" },
    snapshot_after: { status: "approved", approved_by: approverId },
  });
  return { ok: true, message: "" };
};
