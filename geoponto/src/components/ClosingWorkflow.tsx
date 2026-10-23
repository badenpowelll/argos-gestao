import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  STATUS_LABEL,
  allowedTransitions,
  canRectify,
  isLocked,
  type ClosingStatus,
} from "@/utils/closingWorkflow";

interface ClosingRow { id: string; version: number; status: ClosingStatus; created_by: string; justification: string | null; approved_at: string | null }
interface EventRow { id: string; from_status: string | null; to_status: string; note: string | null; created_at: string; closing_id: string }
type DbError = { message: string; code?: string } | null;
interface Query extends PromiseLike<{ data: unknown; error: DbError }> {
  select(cols: string): Query;
  eq(col: string, value: unknown): Query;
  order(col: string, opts?: { ascending: boolean }): Query;
}
// As tabelas/funções do fechamento ainda não constam em types.ts (arquivo gerado e protegido).
const db = supabase as unknown as {
  from(table: string): Query;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }>;
};

const MISSING = ["42P01", "42883", "PGRST202", "PGRST205"];

interface Props {
  companyId: string | null;
  /** Mês da apuração, "yyyy-MM". */
  month: string;
  /** Memória de cálculo por funcionário, copiada para a versão registrada. */
  snapshot: unknown[];
}

const ClosingWorkflow = ({ companyId, month, snapshot }: Props) => {
  const { user, role } = useAuth();
  const competence = `${month}-01`;
  const [closings, setClosings] = useState<ClosingRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [note, setNote] = useState("");
  const [justification, setJustification] = useState("");

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const closingsRes = await db.from("monthly_closings").select("id, version, status, created_by, justification, approved_at").eq("company_id", companyId).eq("competence", competence).order("version", { ascending: false });
    if (closingsRes.error) {
      setUnavailable(MISSING.includes(closingsRes.error.code ?? ""));
      setLoading(false);
      return;
    }
    setUnavailable(false);
    const list = (closingsRes.data ?? []) as ClosingRow[];
    setClosings(list);
    if (list.length) {
      const ev = await db.from("monthly_closing_events").select("id, closing_id, from_status, to_status, note, created_at").eq("company_id", companyId).order("created_at", { ascending: false });
      const ids = new Set(list.map((c) => c.id));
      setEvents(((ev.data ?? []) as EventRow[]).filter((e) => ids.has(e.closing_id)));
    } else setEvents([]);
    setLoading(false);
  }, [companyId, competence]);

  useEffect(() => { load(); }, [load]);

  const call = async (fn: string, args: Record<string, unknown>, okMsg: string) => {
    const { error } = await db.rpc(fn, args);
    if (error) return toast.error(error.message);
    toast.success(okMsg);
    setNote("");
    setJustification("");
    load();
  };

  const live = closings.find((c) => c.status !== "substituido");

  if (unavailable) {
    return (
      <Card><CardContent className="p-4 text-sm text-muted-foreground">
        O fluxo de aprovação do fechamento (estados, bloqueio e retificação) aguarda a migration autorizada.
        Enquanto isso, a apuração acima serve só para conferência.
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base">
        Fluxo do fechamento · {format(parseISO(competence), "MM/yyyy")}
        {live && isLocked(live.status) && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"><Lock className="h-3 w-3" />Competência bloqueada</span>}
      </CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {!loading && !live && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-muted-foreground">Nenhuma apuração registrada para esta competência.</p>
            <Button size="sm" disabled={snapshot.length === 0} onClick={() => call("closing_open", { _competence: competence, _snapshot: snapshot }, "Apuração registrada")}>Registrar apuração</Button>
          </div>
        )}
        {live && (
          <>
            <p>Versão <strong>{live.version}</strong> · situação: <strong>{STATUS_LABEL[live.status]}</strong>{live.justification ? ` · retificação: ${live.justification}` : ""}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input className="w-64" placeholder="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
              {allowedTransitions(live.status, role, live.created_by === user?.id).map((to) => (
                <Button key={to} size="sm" variant="outline" onClick={() => call("closing_transition", { _closing_id: live.id, _to: to, _note: note || null }, `Situação: ${STATUS_LABEL[to]}`)}>→ {STATUS_LABEL[to]}</Button>
              ))}
            </div>
            {canRectify(live.status, role) && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                <Input className="w-80" placeholder="Justificativa da retificação (mín. 10 caracteres)" value={justification} onChange={(e) => setJustification(e.target.value)} />
                <Button size="sm" variant="destructive" disabled={justification.trim().length < 10} onClick={() => call("closing_rectify", { _closing_id: live.id, _justification: justification, _snapshot: snapshot.length ? snapshot : null }, "Nova versão criada por retificação")}>Retificar fechamento</Button>
              </div>
            )}
          </>
        )}
        {events.length > 0 && (
          <ul className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
            {events.slice(0, 12).map((e) => (
              <li key={e.id}>{format(parseISO(e.created_at), "dd/MM/yyyy HH:mm")} · {e.from_status ? `${STATUS_LABEL[e.from_status as ClosingStatus] ?? e.from_status} → ` : ""}{STATUS_LABEL[e.to_status as ClosingStatus] ?? e.to_status}{e.note ? ` — ${e.note}` : ""}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default ClosingWorkflow;
