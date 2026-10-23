import { useState } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { closeMonth, closingToCsv, downloadFile, type MonthClosing } from "@/utils/monthlyClosing";
import { formatMinutes } from "@/utils/timeCalculations";

interface Props {
  companyId: string | null;
  employees: { user_id: string; name: string; company_id: string | null }[];
}

const MonthlyClosingPanel = ({ companyId, employees }: Props) => {
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<{ name: string; closing: MonthClosing }[]>([]);
  const [pendingAdjustments, setPendingAdjustments] = useState(0);

  const run = async () => {
    if (!companyId) return toast.error("Empresa não configurada");
    setLoading(true);
    const ref = new Date(`${month}-01T12:00:00`);
    const start = startOfMonth(ref).toISOString();
    const end = endOfMonth(ref);
    end.setHours(23, 59, 59, 999);
    const startDay = format(startOfMonth(ref), "yyyy-MM-dd");
    const endDay = format(end, "yyyy-MM-dd");

    const [entriesRes, absRes, schedRes, adjRes] = await Promise.all([
      supabase.from("time_entries").select("user_id, timestamp, type").eq("company_id", companyId).gte("timestamp", start).lte("timestamp", end.toISOString()).limit(10000),
      supabase.from("absence_justifications").select("user_id, date").eq("company_id", companyId).gte("date", startDay).lte("date", endDay),
      supabase.from("work_schedules").select("daily_hours").eq("company_id", companyId).limit(1),
      supabase.from("adjustments").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending").gte("date", startDay).lte("date", endDay),
    ]);
    setLoading(false);
    if (entriesRes.error) return toast.error("Erro ao carregar marcações");

    const dailyHours = Number(schedRes.data?.[0]?.daily_hours ?? 8);
    setPendingAdjustments(adjRes.count ?? 0);
    const team = employees.filter((e) => e.company_id === companyId);
    setRows(
      team.map((e) => {
        const entries = (entriesRes.data ?? []).filter((t) => t.user_id === e.user_id) as { timestamp: string; type: "in" | "out" }[];
        const justified = new Set((absRes.data ?? []).filter((a) => a.user_id === e.user_id).map((a) => a.date));
        return { name: e.name, closing: closeMonth(ref, entries, dailyHours, justified) };
      }),
    );
  };

  const alerts = rows.reduce((n, r) => n + r.closing.inconsistencies, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Fechamento mensal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-48" />
          <Button onClick={run} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Apurar
          </Button>
          {rows.length > 0 && (
            <Button variant="outline" onClick={() => downloadFile(closingToCsv(rows), `fechamento-${month}.csv`, "text/csv")}>
              <Download className="h-4 w-4 mr-2" />Exportar CSV (folha)
            </Button>
          )}
        </div>
        {rows.length > 0 && (pendingAdjustments > 0 || alerts > 0) && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <span>
              {pendingAdjustments > 0 && `${pendingAdjustments} ajuste(s) pendentes no mês. `}
              {alerts > 0 && `${alerts} dia(s) com marcações inconsistentes (entrada sem saída ou fora de ordem). `}
              Resolva antes de fechar a folha.
            </span>
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead><TableHead>Previstas</TableHead><TableHead>Trabalhadas</TableHead>
                <TableHead>H. extras</TableHead><TableHead>Atrasos</TableHead><TableHead>Saldo</TableHead>
                <TableHead>Faltas</TableHead><TableHead>Inconsist.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ name, closing: c }) => (
                <TableRow key={name}>
                  <TableCell className="font-medium">{name}</TableCell>
                  <TableCell>{formatMinutes(c.expected)}</TableCell>
                  <TableCell>{formatMinutes(c.worked)}</TableCell>
                  <TableCell>{formatMinutes(c.extra)}</TableCell>
                  <TableCell>{formatMinutes(c.deficit)}</TableCell>
                  <TableCell className={c.balance < 0 ? "text-rose-600" : "text-emerald-600"}>
                    {c.balance < 0 ? "-" : ""}{formatMinutes(Math.abs(c.balance))}
                  </TableCell>
                  <TableCell>{c.absences}</TableCell>
                  <TableCell>{c.inconsistencies}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default MonthlyClosingPanel;
