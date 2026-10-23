import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { format, isWeekend, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, Loader2, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { approveAdjustment, type AdjustmentLike } from "@/utils/adjustments";
import { hasInconsistency } from "@/utils/monthlyClosing";
import { getHolidayInfo } from "@/utils/holidays";
import MonthlyClosingPanel from "@/components/MonthlyClosing";

interface Member { user_id: string; name: string; company_id: string | null; team_id: string | null }
interface Team { id: string; name: string }
interface PendingAdjustment extends AdjustmentLike { reason: string; created_at: string }
interface Entry { user_id: string; timestamp: string; type: "in" | "out" }

const STEP_LABEL: Record<string, string> = {
  entrada: "Entrada",
  saida_almoco: "Saída Almoço",
  retorno_almoco: "Retorno Almoço",
  saida: "Saída",
};

type Section = "visao" | "ajustes" | "fechamento";

const ManagerPanel = () => {
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>("visao");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamFilter, setTeamFilter] = useState("all");
  const [members, setMembers] = useState<Member[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pending, setPending] = useState<PendingAdjustment[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingAdjustment | null>(null);
  const [reason, setReason] = useState("");

  const isManagerOnly = role === "manager";

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: me } = await supabase.from("profiles").select("company_id, team_id").eq("user_id", user.id).maybeSingle();
    const company = me?.company_id ?? null;
    setCompanyId(company);
    setMyTeamId(me?.team_id ?? null);
    if (!company) return setLoading(false);

    const [profilesRes, teamsRes] = await Promise.all([
      supabase.from("profiles").select("user_id, name, company_id, team_id").eq("company_id", company),
      supabase.from("teams").select("id, name").eq("company_id", company).order("name"),
    ]);
    setMembers((profilesRes.data ?? []) as Member[]);
    setTeams((teamsRes.data ?? []) as Team[]);

    const monthStart = startOfMonth(new Date()).toISOString();
    const [entriesRes, adjRes] = await Promise.all([
      supabase.from("time_entries").select("user_id, timestamp, type").eq("company_id", company).gte("timestamp", monthStart).limit(10000),
      supabase.from("adjustments").select("id, user_id, company_id, date, punch_step, proposed_time, reason, created_at").eq("company_id", company).eq("status", "pending").order("created_at"),
    ]);
    setEntries((entriesRes.data ?? []) as Entry[]);
    setPending((adjRes.data ?? []) as PendingAdjustment[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Gestor enxerga sua equipe; dono/admin escolhem a equipe. Filtro de tela: a RLS libera a empresa inteira ao gestor.
  const scopeTeam = isManagerOnly ? myTeamId : teamFilter === "all" ? null : teamFilter;
  const team = useMemo(
    () => members.filter((m) => m.user_id !== user?.id && (!scopeTeam || m.team_id === scopeTeam)),
    [members, scopeTeam, user],
  );
  const teamIds = useMemo(() => new Set(team.map((m) => m.user_id)), [team]);
  const nameOf = (id: string) => members.find((m) => m.user_id === id)?.name ?? "Funcionário";

  const today = format(new Date(), "yyyy-MM-dd");
  const workday = !isWeekend(new Date()) && !getHolidayInfo(new Date());

  const summary = useMemo(() => {
    const teamEntries = entries.filter((e) => teamIds.has(e.user_id));
    const todayEntries = teamEntries.filter((e) => format(parseISO(e.timestamp), "yyyy-MM-dd") === today);
    const present = new Set(todayEntries.map((e) => e.user_id));
    const missing = workday ? team.filter((m) => !present.has(m.user_id)) : [];

    // Inconsistências dos dias anteriores (o dia de hoje ainda pode estar em andamento).
    const byUserDay = new Map<string, Entry[]>();
    for (const e of teamEntries) {
      const day = format(parseISO(e.timestamp), "yyyy-MM-dd");
      if (day === today) continue;
      const key = `${e.user_id}|${day}`;
      byUserDay.set(key, [...(byUserDay.get(key) ?? []), e]);
    }
    const inconsistent = [...byUserDay.entries()]
      .filter(([, list]) => hasInconsistency(list))
      .map(([key]) => { const [uid, day] = key.split("|"); return { uid, day }; })
      .sort((a, b) => b.day.localeCompare(a.day));
    return { present: present.size, missing, inconsistent };
  }, [entries, teamIds, team, today, workday]);

  const teamPending = pending.filter((a) => teamIds.has(a.user_id));

  const approve = async (adj: PendingAdjustment) => {
    if (!user) return;
    setBusyId(adj.id);
    const result = await approveAdjustment(adj, user.id);
    setBusyId(null);
    if (!result.ok) return toast.error(result.message);
    toast.success("Ajuste aprovado e ponto registrado");
    load();
  };

  const confirmReject = async () => {
    if (!rejecting || !user) return;
    if (reason.trim().length < 5) return toast.error("Informe o motivo da rejeição");
    setBusyId(rejecting.id);
    const { error } = await supabase
      .from("adjustments")
      .update({ status: "rejected", rejection_reason: reason.trim(), approved_by: user.id })
      .eq("id", rejecting.id)
      .eq("status", "pending");
    setBusyId(null);
    if (error) return toast.error(`Erro ao rejeitar: ${error.message}`);
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      company_id: rejecting.company_id,
      action: "adjustment_rejected",
      metadata: { adjustment_id: rejecting.id, target_user_id: rejecting.user_id, reason: reason.trim() },
      snapshot_before: { status: "pending" },
      snapshot_after: { status: "rejected" },
    });
    toast.success("Ajuste rejeitado");
    setRejecting(null);
    setReason("");
    load();
  };

  if (role && !["owner", "admin", "manager"].includes(role)) return <Navigate to="/app" replace />;
  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (isManagerOnly && !myTeamId) {
    return (
      <Card className="m-4">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Você ainda não está vinculado a uma equipe. Peça ao administrador para definir sua equipe no cadastro.
        </CardContent>
      </Card>
    );
  }

  const sections: { key: Section; label: string }[] = [
    { key: "visao", label: "Visão da equipe" },
    { key: "ajustes", label: `Ajustes pendentes (${teamPending.length})` },
    { key: "fechamento", label: "Fechamento do mês" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold uppercase text-foreground">Painel do gestor</h1>
          <p className="text-sm text-muted-foreground">
            {isManagerOnly ? teams.find((t) => t.id === myTeamId)?.name ?? "Sua equipe" : "Acompanhe as equipes"} · {team.length} pessoa(s)
          </p>
        </div>
        {!isManagerOnly && (
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Equipe" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as equipes</SelectItem>
              {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <Button key={s.key} size="sm" variant={section === s.key ? "default" : "outline"} onClick={() => setSection(s.key)}>{s.label}</Button>
        ))}
      </div>

      {section === "visao" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "Na equipe", value: team.length },
              { label: "Presentes hoje", value: summary.present },
              { label: workday ? "Sem marcação hoje" : "Hoje não é dia útil", value: workday ? summary.missing.length : "—" },
              { label: "Dias inconsistentes no mês", value: summary.inconsistent.length },
            ].map((c) => (
              <Card key={c.label}><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">{c.label}</p><p className="text-3xl font-bold">{c.value}</p></CardContent></Card>
            ))}
          </div>

          {summary.missing.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" />Ainda sem marcação hoje</CardTitle></CardHeader>
              <CardContent className="text-sm">{summary.missing.map((m) => m.name).join(", ")}</CardContent>
            </Card>
          )}

          {summary.inconsistent.length > 0 && (
            <Card className="border-amber-300">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base text-amber-800"><AlertTriangle className="h-4 w-4" />Marcações para conferir</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {summary.inconsistent.slice(0, 15).map((i) => (
                  <p key={`${i.uid}${i.day}`}>{nameOf(i.uid)} · {format(parseISO(i.day), "dd/MM (EEE)", { locale: ptBR })} — entrada/saída incompleta ou fora de ordem</p>
                ))}
                {summary.inconsistent.length > 15 && <p className="text-xs text-muted-foreground">Mostrando 15 de {summary.inconsistent.length}.</p>}
                <p className="pt-2 text-xs text-muted-foreground">O colaborador pode pedir ajuste; você aprova na aba "Ajustes pendentes".</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {section === "ajustes" && (
        <div className="space-y-3">
          {teamPending.length === 0 && <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Nenhum ajuste pendente na equipe.</CardContent></Card>}
          {teamPending.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="text-sm">
                  <p className="font-semibold">{nameOf(a.user_id)}</p>
                  <p className="text-muted-foreground">
                    {format(parseISO(a.date), "dd/MM/yyyy")} · {STEP_LABEL[a.punch_step] ?? a.punch_step} às {(a.proposed_time ?? "").slice(0, 5)}
                  </p>
                  <p className="mt-1">{a.reason}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={busyId === a.id} onClick={() => approve(a)}><CheckCircle2 className="mr-1 h-4 w-4" />Aprovar</Button>
                  <Button size="sm" variant="outline" disabled={busyId === a.id} onClick={() => { setRejecting(a); setReason(""); }}><XCircle className="mr-1 h-4 w-4" />Rejeitar</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {section === "fechamento" && (
        <MonthlyClosingPanel companyId={companyId} employees={team} absencesPartial={isManagerOnly} />
      )}

      <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) setRejecting(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Motivo da rejeição</DialogTitle></DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explique ao colaborador por que o ajuste não foi aceito" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancelar</Button>
            <Button onClick={confirmReject} disabled={busyId === rejecting?.id}>Rejeitar ajuste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManagerPanel;
