import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Clock,
  Plus,
  Loader2,
  Send,
  CalendarDays,
  AlertCircle,
} from "lucide-react";

const PUNCH_STEP_OPTIONS = [
  { value: "entrada", label: "Entrada" },
  { value: "saida_almoco", label: "Saída Almoço" },
  { value: "retorno_almoco", label: "Retorno Almoço" },
  { value: "saida", label: "Saída" },
];

type Adjustment = {
  id: string;
  date: string;
  proposed_time: string;
  punch_step: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason?: string | null;
};

const Adjustments = () => {
  const { user } = useAuth();
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  // Form state
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [punchStep, setPunchStep] = useState("entrada");
  const [proposedTime, setProposedTime] = useState("08:00");
  const [reason, setReason] = useState("");

  const loadAdjustments = useCallback(async () => {
    if (!user) {
      setAdjustments([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("adjustments")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Não foi possível carregar suas solicitações de ajuste.");
      setAdjustments([]);
    } else {
      setAdjustments((data as Adjustment[]) || []);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadAdjustments();
  }, [loadAdjustments]);

  const handleSubmit = async () => {
    setShowValidation(true);

    if (!user) {
      toast.error("Faça login novamente para enviar a solicitação.");
      return;
    }

    if (!date || !punchStep || !proposedTime || !reason.trim()) {
      toast.error("Preencha todos os campos obrigatórios da solicitação.");
      return;
    }

    setSubmitting(true);

    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      const { error } = await supabase
        .from("adjustments")
        .insert({
          user_id: user.id,
          company_id: profile?.company_id || null,
          date,
          punch_step: punchStep,
          proposed_time: proposedTime,
          reason: reason.trim(),
          status: "pending",
        })
        .select("id")
        .single();

      if (error) throw error;

      toast.success("Solicitação de ajuste enviada!");
      setShowForm(false);
      setShowValidation(false);
      setReason("");
      setProposedTime("08:00");
      setPunchStep("entrada");
      await loadAdjustments();
    } catch (err: any) {
      toast.error("Erro ao enviar ajuste: " + (err.message || "Tente novamente"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setShowValidation(false);
  };

  const isReasonMissing = showValidation && !reason.trim();

  const statusMap: Record<string, string> = {
    pending: "Pendente",
    approved: "Aprovado",
    rejected: "Rejeitado",
  };

  const statusColor: Record<string, string> = {
    pending: "text-amber-600 bg-amber-100",
    approved: "text-emerald-700 bg-emerald-100",
    rejected: "text-rose-700 bg-rose-100",
  };

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ajustes de Ponto</h1>
          <p className="text-sm text-muted-foreground">Solicite correções nos seus registros</p>
        </div>
        <Button type="button" onClick={() => setShowForm(!showForm)} className="bg-primary text-primary-foreground">
          <Plus className="mr-2 h-4 w-4" /> Nova Solicitação
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="h-4 w-4 text-primary" />
                Solicitar Ajuste de Horário
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Data</label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Tipo de Registro</label>
                  <Select value={punchStep} onValueChange={setPunchStep}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PUNCH_STEP_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Horário Proposto</label>
                  <Input
                    type="time"
                    value={proposedTime}
                    onChange={(e) => setProposedTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Motivo</label>
                <Textarea
                  placeholder="Descreva o motivo do ajuste (ex: esqueci de registrar, erro no sistema, etc.)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  aria-invalid={isReasonMissing}
                  className={isReasonMissing ? "border-destructive focus-visible:ring-destructive" : undefined}
                />
                {isReasonMissing ? (
                  <p className="text-xs font-medium text-destructive">Preencha o motivo para enviar a solicitação.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Informe o motivo do ajuste para liberar o envio.</p>
                )}
              </div>
              <div className="flex gap-3">
                <Button type="button" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {submitting ? "Enviando..." : "Enviar Solicitação"}
                </Button>
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* List */}
      {adjustments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhuma solicitação de ajuste. Clique em "Nova Solicitação" para criar uma.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {adjustments.map((adj) => {
            const stepLabel = PUNCH_STEP_OPTIONS.find((o) => o.value === adj.punch_step)?.label || adj.punch_step;
            return (
              <motion.div key={adj.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <Clock className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-card-foreground">
                          {stepLabel} — {adj.proposed_time?.slice(0, 5) || "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(adj.date).toLocaleDateString("pt-BR")} — {adj.reason}
                        </p>
                        {adj.status === "rejected" && adj.rejection_reason && (
                          <p className="text-xs text-destructive mt-1">
                            Motivo da rejeição: {adj.rejection_reason}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor[adj.status] || ""}`}>
                      {statusMap[adj.status] || adj.status}
                    </span>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Adjustments;
