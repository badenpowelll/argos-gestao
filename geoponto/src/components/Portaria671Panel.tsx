import { useMemo, useState } from "react";
import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, ShieldCheck, ShieldAlert, FileText, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ANOMALY_LABEL,
  buildAfd,
  buildChain,
  findAnomalies,
  hasClockDivergence,
  verifyChain,
  verifyPersisted,
  type ChainedPunch,
  type PersistedPunch,
} from "@/utils/portaria671";
import { db, isMissingSchema } from "@/lib/untypedDb";
import { downloadComprovante } from "@/utils/comprovantePdf";
import { downloadFile } from "@/utils/monthlyClosing";

interface Props {
  companyId: string | null;
  companyName: string;
  companyCnpj: string;
  employees: { user_id: string; name: string }[];
}

const MAX_ROWS = 300;

/** Marcação com NSR: `persisted` = gravado pelo banco; senão é legado, com NSR calculado aqui. */
type Row = ChainedPunch & { persisted: boolean; offset: number | null; serverAt: string | null };

const COLUMNS = "id, user_id, timestamp, type, nsr, prev_hash, record_hash, server_received_at, clock_offset_seconds";

const Portaria671Panel = ({ companyId, companyName, companyCnpj, employees }: Props) => {
  const [start, setStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [end, setEnd] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [userId, setUserId] = useState("all");
  const [loading, setLoading] = useState(false);
  const [chain, setChain] = useState<Row[] | null>(null);
  const [integrity, setIntegrity] = useState<{ total: number; brokenAt: number | null; legacy: number } | null>(null);
  const [persistedAvailable, setPersistedAvailable] = useState(true);

  const nameOf = (id: string) => employees.find((e) => e.user_id === id)?.name ?? "Funcionário";

  const load = async (): Promise<Row[]> => {
    if (!companyId) throw new Error("Empresa não configurada");
    // Tenta com as colunas gravadas (migration 003); se ainda não existirem, usa só o cálculo.
    let res = await db.from("time_entries").select(COLUMNS).eq("company_id", companyId).order("timestamp", { ascending: true }).limit(50000);
    let available = true;
    if (res.error && isMissingSchema(res.error)) {
      available = false;
      res = await db.from("time_entries").select("id, user_id, timestamp, type").eq("company_id", companyId).order("timestamp", { ascending: true }).limit(50000);
    }
    if (res.error) throw new Error(res.error.message);
    setPersistedAvailable(available);

    type Raw = { id: string; user_id: string; timestamp: string; type: "in" | "out"; nsr?: number | null; prev_hash?: string | null; record_hash?: string | null; server_received_at?: string | null; clock_offset_seconds?: number | null };
    const raw = (res.data ?? []) as Raw[];
    const legacy = raw.filter((r) => r.nsr == null);
    const stored = raw.filter((r) => r.nsr != null).sort((a, b) => (a.nsr as number) - (b.nsr as number));

    const legacyRows: Row[] = (await buildChain(legacy, companyCnpj)).map((c) => ({ ...c, persisted: false, offset: null, serverAt: null }));
    const storedRows: Row[] = stored.map((r) => ({
      id: r.id, user_id: r.user_id, timestamp: r.timestamp, type: r.type, nsr: r.nsr as number,
      hash: r.record_hash ?? "", prevHash: r.prev_hash ?? "", persisted: true,
      offset: r.clock_offset_seconds ?? null, serverAt: r.server_received_at ?? null,
    }));
    const all = [...legacyRows, ...storedRows];
    setChain(all);
    return all;
  };

  const run = async (fn: (c: Row[]) => void | Promise<void>) => {
    setLoading(true);
    try {
      await fn(chain ?? (await load()));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao processar");
    }
    setLoading(false);
  };

  const inPeriod = useMemo(() => {
    if (!chain) return [];
    const from = new Date(`${start}T00:00:00`).getTime();
    const to = new Date(`${end}T23:59:59`).getTime();
    return chain.filter((c) => {
      const t = new Date(c.timestamp).getTime();
      return t >= from && t <= to && (userId === "all" || c.user_id === userId);
    });
  }, [chain, start, end, userId]);

  const anomalies = useMemo(() => {
    if (!chain) return [];
    const nsrs = new Set(inPeriod.map((p) => p.nsr));
    return findAnomalies(chain).filter((a) => nsrs.has(a.nsr));
  }, [chain, inPeriod]);

  const comprovantePdf = async (p: Row) => {
    const { data } = await db.from("profiles").select("cpf").eq("user_id", p.user_id).maybeSingle();
    downloadComprovante({
      nsr: p.nsr, hash: p.hash, timestamp: p.timestamp, serverReceivedAt: p.serverAt, type: p.type,
      employeeName: nameOf(p.user_id), employeeCpf: (data as { cpf?: string | null } | null)?.cpf ?? null,
      employerName: companyName, employerCnpj: companyCnpj,
    });
  };

  const exportAfd = () =>
    run(async () => {
      const slice = chain ? inPeriod : [];
      downloadFile(buildAfd(slice, companyCnpj, companyName), `AFD-${start}_${end}.txt`, "text/plain");
      toast.success(`${slice.length} marcações exportadas`);
    });

  const check = () =>
    run(async (c) => {
      const stored = c.filter((r) => r.persisted);
      const legacy = c.filter((r) => !r.persisted);
      const storedBroken = await verifyPersisted(
        stored.map((r) => ({ id: r.id, user_id: r.user_id, timestamp: r.timestamp, type: r.type, nsr: r.nsr, prev_hash: r.prevHash, record_hash: r.hash, server_received_at: r.serverAt, clock_offset_seconds: r.offset }) as PersistedPunch),
        companyCnpj,
      );
      const legacyBroken = await verifyChain(legacy, companyCnpj);
      setIntegrity({ total: c.length, brokenAt: storedBroken ?? legacyBroken, legacy: legacy.length });
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Portaria 671 — registros, comprovantes e integridade</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Cada marcação recebe um NSR sequencial e um código SHA-256 encadeado ao anterior. O AFD usa layout simplificado e
          não substitui a validação oficial do MTE. Marcações novas têm NSR, hora do servidor e código gravados no banco; as anteriores mostram NSR calculado.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-44" />
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-44" />
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Funcionário" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os funcionários</SelectItem>
              {employees.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => run(() => undefined)} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Carregar marcações
          </Button>
          <Button variant="outline" onClick={exportAfd} disabled={loading || !chain}><Download className="h-4 w-4 mr-2" />Exportar AFD</Button>
          <Button variant="outline" onClick={check} disabled={loading}>Verificar integridade</Button>
        </div>

        {!persistedAvailable && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            O NSR gravado no banco ainda não está ativo (aguarda a migration 003). Os números abaixo são calculados.
          </p>
        )}
        {integrity && (
          <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${integrity.brokenAt ? "border-rose-300 bg-rose-50 text-rose-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>
            {integrity.brokenAt ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            {integrity.brokenAt ? `Divergência no NSR ${integrity.brokenAt}.` : `${integrity.total} marcações verificadas, cadeia íntegra.${integrity.legacy ? ` ${integrity.legacy} são anteriores ao NSR gravado (NSR calculado).` : ""}`}
          </div>
        )}

        {chain && anomalies.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />{anomalies.length} marcação(ões) para conferência do RH</p>
            <ul className="mt-2 space-y-1">
              {anomalies.slice(0, 20).map((a) => (
                <li key={`${a.nsr}-${a.kind}`}>
                  NSR {a.nsr} · {nameOf(a.user_id)} · {format(parseISO(a.date), "dd/MM/yyyy")} — {ANOMALY_LABEL[a.kind]}
                </li>
              ))}
            </ul>
            {anomalies.length > 20 && <p className="mt-1 text-xs">Mostrando 20 de {anomalies.length}.</p>}
          </div>
        )}

        {chain && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead>NSR</TableHead><TableHead>Funcionário</TableHead><TableHead>Data/hora</TableHead><TableHead>Tipo</TableHead><TableHead>Código</TableHead><TableHead>Relógio</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {inPeriod.slice(0, MAX_ROWS).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.nsr}</TableCell>
                    <TableCell>{nameOf(p.user_id)}</TableCell>
                    <TableCell>{format(parseISO(p.timestamp), "dd/MM/yyyy HH:mm:ss")}</TableCell>
                    <TableCell>{p.type === "in" ? "Entrada" : "Saída"}</TableCell>
                    <TableCell className="font-mono text-xs">{p.hash.slice(0, 12)}…{!p.persisted && <span className="ml-1 font-sans text-muted-foreground">(calculado)</span>}</TableCell>
                    <TableCell className="text-xs">{p.persisted && hasClockDivergence({ clock_offset_seconds: p.offset }) ? <span className="flex items-center gap-1 text-amber-700"><Clock className="h-3 w-3" />{Math.round((p.offset ?? 0) / 60)} min</span> : p.persisted ? "ok" : "—"}</TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => comprovantePdf(p)}><FileText className="h-4 w-4 mr-1" />Comprovante</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {inPeriod.length > MAX_ROWS && <p className="mt-2 text-xs text-muted-foreground">Mostrando {MAX_ROWS} de {inPeriod.length}. Use os filtros ou exporte o AFD.</p>}
            {inPeriod.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nenhuma marcação no período.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default Portaria671Panel;
