import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db, isMissingSchema } from "@/lib/untypedDb";
import { formatCpf, isValidCpf, onlyDigits } from "@/utils/cpf";

interface Row { user_id: string; name: string; cpf: string | null; registration_number: string | null; admission_date: string | null }
interface Draft { cpf: string; registration_number: string; admission_date: string }

const LaborData = ({ companyId }: { companyId: string | null }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return setLoading(false);
    setLoading(true);
    const res = await db.from("profiles").select("user_id, name, cpf, registration_number, admission_date").eq("company_id", companyId).order("name");
    setLoading(false);
    if (res.error) return setUnavailable(isMissingSchema(res.error)) ;
    setUnavailable(false);
    const list = (res.data ?? []) as Row[];
    setRows(list);
    setDrafts(Object.fromEntries(list.map((r) => [r.user_id, { cpf: r.cpf ? formatCpf(r.cpf) : "", registration_number: r.registration_number ?? "", admission_date: r.admission_date ?? "" }])));
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const save = async (row: Row) => {
    const d = drafts[row.user_id];
    if (d.cpf && !isValidCpf(d.cpf)) return toast.error("CPF inválido");
    setSaving(row.user_id);
    const { error } = await db.from("profiles").update({
      cpf: d.cpf ? onlyDigits(d.cpf) : null,
      registration_number: d.registration_number.trim() || null,
      admission_date: d.admission_date || null,
    }).eq("user_id", row.user_id);
    setSaving(null);
    if (error) return toast.error(/unique|duplicate/i.test(error.message) ? "CPF ou matrícula já usado por outro funcionário" : error.message);
    toast.success(`Dados de ${row.name} salvos`);
    load();
  };

  const set = (id: string, patch: Partial<Draft>) => setDrafts((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (unavailable) {
    return <Card><CardContent className="p-4 text-sm text-muted-foreground">Os campos de CPF, matrícula e admissão aguardam a migration autorizada (003).</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Dados trabalhistas</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">CPF e matrícula identificam o trabalhador nos registros de ponto e na integração com a folha. Só admin e dono podem alterar.</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>CPF</TableHead><TableHead>Matrícula</TableHead><TableHead>Admissão</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => {
                const d = drafts[r.user_id];
                if (!d) return null;
                return (
                  <TableRow key={r.user_id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell><Input className="w-40" value={d.cpf} placeholder="000.000.000-00" onChange={(e) => set(r.user_id, { cpf: formatCpf(e.target.value) })} /></TableCell>
                    <TableCell><Input className="w-32" value={d.registration_number} onChange={(e) => set(r.user_id, { registration_number: e.target.value })} /></TableCell>
                    <TableCell><Input className="w-40" type="date" value={d.admission_date} onChange={(e) => set(r.user_id, { admission_date: e.target.value })} /></TableCell>
                    <TableCell><Button size="sm" variant="outline" disabled={saving === r.user_id} onClick={() => save(r)}><Save className="mr-1 h-4 w-4" />Salvar</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default LaborData;
