import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatusBadge from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Calendar, Clock, Loader2, Search, MapPin, CalendarCheck } from "lucide-react";
import { format, parseISO, isSunday, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { db } from "@/lib/untypedDb";
import { downloadComprovante } from "@/utils/comprovantePdf";
import { calculateDailyMinutes, formatMinutes, isEntryLate } from "@/utils/timeCalculations";

interface TimeEntry {
  id: string;
  timestamp: string;
  type: "in" | "out";
  status: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  mood_score: number | null;
  nsr?: number | null;
  record_hash?: string | null;
  server_received_at?: string | null;
}

const MyPunches = () => {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [absences, setAbsences] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const downloadReceipt = async (entry: TimeEntry) => {
    if (!user || entry.nsr == null || !entry.record_hash) return;
    const { data: me } = await db.from("profiles").select("name, cpf, company_id").eq("user_id", user.id).maybeSingle();
    const profile = me as { name?: string; cpf?: string | null; company_id?: string | null } | null;
    const { data: company } = profile?.company_id
      ? await supabase.from("companies").select("name, cnpj").eq("id", profile.company_id).maybeSingle()
      : { data: null };
    downloadComprovante({
      nsr: entry.nsr, hash: entry.record_hash, timestamp: entry.timestamp, serverReceivedAt: entry.server_received_at ?? null, type: entry.type,
      employeeName: profile?.name ?? "Trabalhador", employeeCpf: profile?.cpf ?? null,
      employerName: company?.name ?? "Empregador", employerCnpj: company?.cnpj ?? "",
    });
  };

  const fetchEntries = async () => {
    if (!user || !startDate || !endDate) return;
    setLoading(true);
    
    const [entriesRes, absencesRes] = await Promise.all([
      supabase
        .from("time_entries")
        .select("*")
        .eq("user_id", user.id)
        .gte("timestamp", `${startDate}T00:00:00`)
        .lte("timestamp", `${endDate}T23:59:59`)
        .order("timestamp", { ascending: true }),
      supabase
        .from("absence_justifications")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", startDate)
        .lte("date", endDate)
    ]);

    if (entriesRes.error) console.error(entriesRes.error);
    setEntries((entriesRes.data || []) as TimeEntry[]);
    setAbsences(absencesRes.data || []);
    setSearched(true);
    setLoading(false);
  };

  useEffect(() => {
    fetchEntries();
  }, [user]);

  // Group entries by date
  const entriesByDate: Record<string, TimeEntry[]> = {};
  entries.forEach((e) => {
    const key = e.timestamp.split("T")[0];
    if (!entriesByDate[key]) entriesByDate[key] = [];
    entriesByDate[key].push(e);
  });

  const allDays = startDate && endDate
    ? eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
    : [];

  const stepLabels = ["Entrada", "Saída Almoço", "Retorno Almoço", "Saída"];

  // Calculate total hours using util
  let totalMinutes = 0;
  allDays.forEach((day) => {
    const dateKey = format(day, "yyyy-MM-dd");
    const dayEntries = entriesByDate[dateKey] || [];
    totalMinutes += calculateDailyMinutes(dayEntries);
  });

  const isLate = (dayEntries: TimeEntry[]) => {
    const firstIn = dayEntries.filter(e => e.type === "in").sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0];
    if (!firstIn) return false;
    return isEntryLate(firstIn.timestamp);
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meu Ponto</h1>
        <p className="text-sm text-muted-foreground">Consulte seus registros de ponto por período</p>
      </div>

      {/* Period filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data Início</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data Fim</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="pl-9" />
              </div>
            </div>
            <Button onClick={fetchEntries} disabled={loading} className="shrink-0">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {searched && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{entries.length}</p>
              <p className="text-xs text-muted-foreground">Registros</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{Object.keys(entriesByDate).length}</p>
              <p className="text-xs text-muted-foreground">Dias Trabalhados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">
                {formatMinutes(totalMinutes)}
              </p>
              <p className="text-xs text-muted-foreground">Total Horas</p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Day-by-day list */}
      {searched && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          {allDays.map((day) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const dayEntries = entriesByDate[dateKey] || [];
            const sunday = isSunday(day);
            const absence = absences.find(a => a.date === dateKey);

            // Sunday or Justified Absence
            if (sunday || absence) {
              const label = absence ? (absence.type.replace('_', ' ')) : "Folga";
              return (
                <Card key={dateKey} className="opacity-70 bg-muted/30">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {absence ? <CalendarCheck className="h-4 w-4 text-emerald-600" /> : <Calendar className="h-4 w-4 text-muted-foreground" />}
                        <span className="text-sm font-semibold text-foreground">
                          {format(day, "EEEE, dd/MM/yyyy", { locale: ptBR })}
                        </span>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${absence ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                        {label}
                      </span>
                    </div>
                    {absence?.description && (
                      <p className="mt-1 text-xs text-muted-foreground pl-6 italic">{absence.description}</p>
                    )}
                  </CardContent>
                </Card>
              );
            }

            const absent = dayEntries.length === 0;
            const late = !absent && isLate(dayEntries);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const isFuture = day > today;

            // Determine status color
            let statusLabel = "";
            let statusClass = "";
            if (absent && isFuture) {
              statusLabel = "Aguardando";
              statusClass = "text-blue-700 bg-blue-100";
            } else if (absent) {
              statusLabel = "Falta";
              statusClass = "text-red-700 bg-red-100";
            } else if (late) {
              statusLabel = "Atrasado";
              statusClass = "text-amber-700 bg-amber-100";
            } else {
              statusLabel = "Presente";
              statusClass = "text-green-700 bg-green-100";
            }

            return (
              <Card key={dateKey} className={absent ? "border-red-200" : late ? "border-amber-200" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">
                        {format(day, "EEEE, dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>

                  {dayEntries.length > 0 && (
                    <div className="space-y-1.5">
                      {dayEntries.map((entry, idx) => (
                        <div key={entry.id} className="flex flex-col gap-2 rounded-md bg-muted/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm text-foreground">
                                {stepLabels[idx] || (entry.type === "in" ? "Entrada" : "Saída")}
                              </span>
                            </div>
                            <span className="text-sm font-medium text-foreground tabular-nums">
                              {format(parseISO(entry.timestamp), "HH:mm:ss")}
                            </span>
                          </div>
                          
                          <div className="flex items-center justify-between gap-3 border-t border-border/20 pt-2 sm:border-0 sm:pt-0">
                            <div className="flex items-center gap-2">
                              {entry.latitude && (
                                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <MapPin className="h-3 w-3" />
                                  GPS OK
                                </span>
                              )}
                              {entry.nsr != null && (
                                <button type="button" onClick={() => downloadReceipt(entry)} className="text-[10px] font-medium text-primary underline-offset-2 hover:underline">
                                  Comprovante · NSR {entry.nsr}
                                </button>
                              )}
                              <StatusBadge status={entry.status as any} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {entries.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nenhum registro encontrado no período selecionado.
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default MyPunches;
