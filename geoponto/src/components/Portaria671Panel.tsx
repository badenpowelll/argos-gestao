import { useState } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Download, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildAfd, buildChain, verifyChain } from "@/utils/portaria671";
import { downloadFile } from "@/utils/monthlyClosing";

interface Props {
  companyId: string | null;
  companyName: string;
  companyCnpj: string;
  employees: { user_id: string; name: string }[];
}

const Portaria671Panel = ({ companyId, companyName, companyCnpj, employees }: Props) => {
  const [start, setStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [end, setEnd] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);
  const [integrity, setIntegrity] = useState<{ total: number; brokenAt: number | null } | null>(null);

  const load = async () => {
    if (!companyId) throw new Error("Empresa não configurada");
    // A cadeia de hash é calculada sobre todo o histórico, para o NSR ser estável entre períodos.
    const { data, error } = await supabase
      .from("time_entries")
      .select("id, user_id, timestamp, type")
      .eq("company_id", companyId)
      .order("timestamp", { ascending: true })
      .limit(50000);
    if (error) throw error;
    return buildChain((data ?? []) as { id: string; user_id: string; timestamp: string; type: "in" | "out" }[], companyCnpj);
  };

  const exportAfd = async () => {
    setLoading(true);
    try {
      const chain = await load();
      const from = new Date(`${start}T00:00:00`).getTime();
      const to = new Date(`${end}T23:59:59`).getTime();
      const slice = chain.filter((c) => {
        const t = new Date(c.timestamp).getTime();
        return t >= from && t <= to;
      });
      downloadFile(buildAfd(slice, companyCnpj, companyName), `AFD-${start}_${end}.txt`, "text/plain");
      toast.success(`${slice.length} marcações exportadas`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao exportar");
    }
    setLoading(false);
  };

  const check = async () => {
    setLoading(true);
    try {
      const chain = await load();
      setIntegrity({ total: chain.length, brokenAt: await verifyChain(chain, companyCnpj) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na verificação");
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Portaria 671 — registros e integridade</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Cada marcação recebe um NSR sequencial e um código SHA-256 encadeado ao anterior.
          Foram carregados {employees.length} funcionário(s). O arquivo AFD gerado usa layout simplificado e
          não substitui a validação oficial do MTE.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-44" />
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-44" />
          <Button onClick={exportAfd} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}Exportar AFD
          </Button>
          <Button variant="outline" onClick={check} disabled={loading}>Verificar integridade</Button>
        </div>
        {integrity && (
          <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${integrity.brokenAt ? "border-rose-300 bg-rose-50 text-rose-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>
            {integrity.brokenAt ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            {integrity.brokenAt ? `Divergência no NSR ${integrity.brokenAt}.` : `${integrity.total} marcações verificadas, cadeia íntegra.`}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default Portaria671Panel;
