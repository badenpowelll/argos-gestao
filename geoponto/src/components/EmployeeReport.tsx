import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { FileText, Download, Loader2, Calendar, Eye, Pencil } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { format, parseISO, eachDayOfInterval, isWeekend } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getHolidayInfo } from "@/utils/holidays";

interface EmployeeReportProps {
  companyId: string | null;
  companyName: string;
  companyCnpj: string;
}

interface TimeEntry {
  id: string;
  user_id: string;
  timestamp: string;
  type: "in" | "out";
  status: string;
  latitude: number | null;
  longitude: number | null;
}

interface DayRow {
  date: Date;
  dateKey: string;
  entrada: string;
  saidaAlmoco: string;
  retornoAlmoco: string;
  saida: string;
  totalStr: string;
  dayMinutes: number;
  diffMinutes: number;
  diffStr: string;
  statusStr: string;
  isWeekend: boolean;
  observations?: string;
}

const EmployeeReport = ({ companyId, companyName, companyCnpj }: EmployeeReportProps) => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewRows, setPreviewRows] = useState<DayRow[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchEmployees = async () => {
      const query = supabase
        .from("profiles")
        .select("user_id, name, email")
        .order("name");
      if (companyId) query.eq("company_id", companyId);
      const { data } = await query;
      setEmployees(data || []);
    };
    fetchEmployees();
  }, [companyId]);

  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  };

  const buildRows = (entries: TimeEntry[], start: string, end: string): DayRow[] => {
    const entriesByDate: Record<string, TimeEntry[]> = {};
    entries.forEach((entry) => {
      const dateKey = entry.timestamp.split("T")[0];
      if (!entriesByDate[dateKey]) entriesByDate[dateKey] = [];
      entriesByDate[dateKey].push(entry);
    });

    const allDays = eachDayOfInterval({ start: parseISO(start), end: parseISO(end) });

    return allDays.map((day) => {
      const dateKey = format(day, "yyyy-MM-dd");
      const dayEntries = entriesByDate[dateKey] || [];
      const weekend = isWeekend(day);

      const ins = dayEntries.filter(e => e.type === "in").sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const outs = dayEntries.filter(e => e.type === "out").sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      const entrada = ins[0] ? format(parseISO(ins[0].timestamp), "HH:mm") : "—";
      const saidaAlmoco = outs[0] && ins.length > 1 ? format(parseISO(outs[0].timestamp), "HH:mm") : "—";
      const retornoAlmoco = ins[1] ? format(parseISO(ins[1].timestamp), "HH:mm") : "—";
      const saida = outs.length > 0 ? format(parseISO(outs[outs.length - 1].timestamp), "HH:mm") : "—";

      // Cálculo robusto: soma todos os intervalos entre uma Entrada e sua Saída subsequente
      let dayMinutes = 0;
      const sortedEntries = [...dayEntries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      
      let currentIn: TimeEntry | null = null;
      for (const entry of sortedEntries) {
        if (entry.type === "in" && !currentIn) {
          currentIn = entry;
        } else if (entry.type === "out" && currentIn) {
          dayMinutes += (new Date(entry.timestamp).getTime() - new Date(currentIn.timestamp).getTime()) / 60000;
          currentIn = null;
        }
      }

      const totalStr = dayMinutes > 0 ? `${Math.floor(dayMinutes / 60)}h${String(Math.round(dayMinutes % 60)).padStart(2, "0")}` : "—";
      const holidayInfo = getHolidayInfo(day);
      let statusStr: string;
      if (dayEntries.length > 0) {
        statusStr = "OK";
      } else if (holidayInfo) {
        statusStr = holidayInfo.type;
      } else if (weekend) {
        statusStr = "Folga";
      } else {
        statusStr = "Falta";
      }

      // Diferença para jornada de 8h (só para dias trabalhados)
      const shouldCalcDiff = statusStr === "OK" && dayMinutes > 0;
      const diffMinutes = shouldCalcDiff ? dayMinutes - 480 : 0;
      const absDiff = Math.abs(diffMinutes);
      const diffStr = shouldCalcDiff ? `${diffMinutes >= 0 ? "+" : "-"}${Math.floor(absDiff / 60)}h${String(Math.round(absDiff % 60)).padStart(2, "0")}` : "—";

      return { date: day, dateKey, entrada, saidaAlmoco, retornoAlmoco, saida, totalStr, dayMinutes, diffMinutes, diffStr, statusStr, isWeekend: weekend, observations: "" };
    });
  };

  const recalcRow = (row: DayRow): DayRow => {
    const parseTime = (t: string) => {
      if (t === "—") return null;
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    const entradaMin = parseTime(row.entrada);
    const saidaMin = parseTime(row.saida);
    const saidaAlmMin = parseTime(row.saidaAlmoco);
    const retAlmMin = parseTime(row.retornoAlmoco);

    // Cálculo robusto para edição manual: Entrada -> Saída Almoco | Retorno Almoco -> Saída
    let dayMinutes = 0;
    if (entradaMin !== null) {
      if (saidaAlmMin !== null && retAlmMin !== null && saidaMin !== null) {
        // Possui almoço
        dayMinutes = (saidaAlmMin - entradaMin) + (saidaMin - retAlmMin);
      } else if (saidaMin !== null) {
        // Direto sem almoço (ou almoço não preenchido)
        dayMinutes = saidaMin - entradaMin;
      }
    }
    if (dayMinutes < 0) dayMinutes = 0;

    const totalStr = dayMinutes > 0 ? `${Math.floor(dayMinutes / 60)}h${String(Math.round(dayMinutes % 60)).padStart(2, "0")}` : "—";
    const hasEntries = row.entrada !== "—" || row.saida !== "—";
    let statusStr = row.statusStr;
    if (hasEntries) {
      statusStr = "OK";
    } else if (!row.statusStr.startsWith("Feriado") && row.statusStr !== "Folga") {
      const holidayInfo = getHolidayInfo(row.date);
      if (holidayInfo) {
        statusStr = holidayInfo.type;
      } else if (row.isWeekend) {
        statusStr = "Folga";
      } else {
        statusStr = "Falta";
      }
    }

    const shouldCalcDiff = statusStr === "OK" && dayMinutes > 0;
    const diffMinutes = shouldCalcDiff ? dayMinutes - 480 : 0;
    const absDiff = Math.abs(diffMinutes);
    const diffStr = shouldCalcDiff ? `${diffMinutes >= 0 ? "+" : "-"}${Math.floor(absDiff / 60)}h${String(Math.round(absDiff % 60)).padStart(2, "0")}` : "—";

    return { ...row, dayMinutes, totalStr, diffMinutes, diffStr, statusStr };
  };

  const handlePreview = async () => {
    if (!selectedEmployee || !startDate || !endDate) {
      toast.error("Selecione o funcionário e o período.");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      toast.error("A data inicial deve ser anterior à data final.");
      return;
    }

    setLoading(true);
    try {
      const emp = employees.find((e) => e.user_id === selectedEmployee);
      if (!emp) throw new Error("Funcionário não encontrado.");
      setEmployeeName(emp.name || emp.email || "—");
      setEmployeeEmail(emp.email || "—");

      const { data: entries, error } = await supabase
        .from("time_entries")
        .select("*")
        .eq("user_id", selectedEmployee)
        .gte("timestamp", `${startDate}T00:00:00`)
        .lte("timestamp", `${endDate}T23:59:59`)
        .order("timestamp", { ascending: true });

      if (error) throw error;
      const rows = buildRows((entries || []) as TimeEntry[], startDate, endDate);
      setPreviewRows(rows);
      setShowPreview(true);
    } catch (err: any) {
      toast.error("Erro ao carregar dados: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (idx: number, field: keyof DayRow, value: string) => {
    setPreviewRows(prev => {
      const updated = [...prev];
      updated[idx] = recalcRow({ ...updated[idx], [field]: value });
      return updated;
    });
  };

  const generatePDFFromPreview = async () => {
    setGenerating(true);
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = 210;
      const pageHeight = 297;
      const marginLeft = 20;
      const marginRight = 20;
      const marginTop = 10;
      const marginBottom = 20;
      const contentWidth = pageWidth - marginLeft - marginRight;

      const headerEl = headerRef.current;
      let y = marginTop + 10;
      if (headerEl) {
        headerEl.style.display = "block";
        const canvas = await html2canvas(headerEl, { scale: 3, useCORS: true, logging: false, backgroundColor: "#ffffff" });
        headerEl.style.display = "none";
        const imgData = canvas.toDataURL("image/png");
        const imgWidth = contentWidth * 0.7;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        const imgX = (pageWidth - imgWidth) / 2;
        pdf.addImage(imgData, "PNG", imgX, marginTop, imgWidth, imgHeight);
        y = marginTop + imgHeight + 5;
      }

      pdf.setDrawColor(30, 64, 175);
      pdf.setLineWidth(0.8);
      pdf.line(marginLeft, y, marginLeft + contentWidth, y);
      y += 8;

      pdf.setTextColor(33, 33, 33);
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("RELATÓRIO DE REGISTRO DE PONTO", pageWidth / 2, y, { align: "center" });
      y += 10;

      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      pdf.text("Funcionário:", marginLeft, y);
      pdf.setFont("helvetica", "normal");
      pdf.text(employeeName, marginLeft + 30, y);
      y += 6;

      pdf.setFont("helvetica", "bold");
      pdf.text("E-mail:", marginLeft, y);
      pdf.setFont("helvetica", "normal");
      pdf.text(employeeEmail, marginLeft + 30, y);
      y += 6;

      pdf.setFont("helvetica", "bold");
      pdf.text("Período:", marginLeft, y);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${format(parseISO(startDate), "dd/MM/yyyy")} a ${format(parseISO(endDate), "dd/MM/yyyy")}`, marginLeft + 30, y);
      y += 6;

      pdf.setFont("helvetica", "bold");
      pdf.text("Emissão:", marginLeft, y);
      pdf.setFont("helvetica", "normal");
      pdf.text(format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }), marginLeft + 30, y);
      y += 12;

      const colWidths = [38, 16, 16, 16, 16, 16, 16, 26];
      const colHeaders = ["Data", "Entrada", "S. Alm.", "R. Alm.", "Saída", "Total", "Dif. 8h", "Status"];
      const colX = [marginLeft];
      for (let i = 1; i < colWidths.length; i++) colX.push(colX[i - 1] + colWidths[i - 1]);

      const addNewPageIfNeeded = (space: number) => {
        if (y + space > pageHeight - marginBottom) { pdf.addPage(); y = marginTop + 10; return true; }
        return false;
      };

      const drawTableHeader = () => {
        pdf.setFillColor(30, 64, 175);
        pdf.rect(marginLeft, y, contentWidth, 8, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        colHeaders.forEach((h, i) => pdf.text(h, colX[i] + colWidths[i] / 2, y + 5.5, { align: "center" }));
        y += 8;
      };

      drawTableHeader();

      let totalMinutes = 0;
      previewRows.forEach((row, rowIndex) => {
        addNewPageIfNeeded(7);
        if (y === marginTop + 10) drawTableHeader();

        totalMinutes += row.dayMinutes;

        if (rowIndex % 2 === 0) { pdf.setFillColor(245, 247, 250); pdf.rect(marginLeft, y, contentWidth, 7, "F"); }
        if (row.isWeekend && row.statusStr === "Folga" || row.statusStr.startsWith("Feriado")) { pdf.setFillColor(255, 249, 235); pdf.rect(marginLeft, y, contentWidth, 7, "F"); }

        pdf.setFontSize(7);
        pdf.setFont("helvetica", "normal");
        const dayOfWeek = format(row.date, "EEE", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase());
        const dateLabel = `${format(row.date, "dd/MM/yyyy")} ${dayOfWeek}`;
        const isRedDate = row.isWeekend || row.statusStr.startsWith("Feriado");
        const displayStatus = row.statusStr === "Outros" && row.observations ? `Outros: ${row.observations}` : row.statusStr;
        const vals = [dateLabel, row.entrada, row.saidaAlmoco, row.retornoAlmoco, row.saida, row.totalStr, row.diffStr, displayStatus];
        vals.forEach((val, i) => {
          const isFalta = val === "Falta";
          const isFolga = val === "Folga" || val.startsWith("Feriado");
          const isDiffNeg = i === 6 && val.startsWith("-");
          const isDiffPos = i === 6 && val.startsWith("+");
          const isDateRed = i === 0 && isRedDate;
          pdf.setTextColor(
            isDateRed ? 220 : isFalta ? 220 : isDiffNeg ? 220 : isDiffPos ? 22 : isFolga ? 180 : val === "Atestado Médico" ? 30 : 33,
            isDateRed ? 38 : isFalta ? 38 : isDiffNeg ? 38 : isDiffPos ? 163 : isFolga ? 150 : val === "Atestado Médico" ? 64 : 33,
            isDateRed ? 38 : isFalta ? 38 : isDiffNeg ? 38 : isDiffPos ? 74 : isFolga ? 50 : val === "Atestado Médico" ? 175 : 33
          );
          pdf.text(val, colX[i] + colWidths[i] / 2, y + 5, { align: "center" });
        });
        y += 7;
      });

      y += 5;
      addNewPageIfNeeded(20);
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.3);
      pdf.line(marginLeft, y, marginLeft + contentWidth, y);
      y += 8;

      const workDays = previewRows.filter(r => !r.isWeekend).length;
      const justified = previewRows.filter(r => ["OK", "Folga", "Atestado Médico", "Outros"].includes(r.statusStr) || r.statusStr.startsWith("Feriado")).length;
      const daysWorked = previewRows.filter(r => r.statusStr === "OK").length;
      const absences = previewRows.filter(r => r.statusStr === "Falta").length;
      const atestados = previewRows.filter(r => r.statusStr === "Atestado Médico").length;

      pdf.setTextColor(33, 33, 33);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      pdf.text("Resumo do Período", marginLeft, y);
      y += 7;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      const totalDiffMinutes = previewRows.reduce((sum, r) => sum + r.diffMinutes, 0);
      const absTotalDiff = Math.abs(totalDiffMinutes);
      const totalDiffStr = `${totalDiffMinutes >= 0 ? "+" : "-"}${Math.floor(absTotalDiff / 60)}h${String(Math.round(absTotalDiff % 60)).padStart(2, "0")}min`;
      pdf.text(`Total de horas trabalhadas: ${Math.floor(totalMinutes / 60)}h${String(Math.round(totalMinutes % 60)).padStart(2, "0")}min`, marginLeft, y); y += 5;
      pdf.setFont("helvetica", "bold");
      pdf.text("Diferença jornada 8h: ", marginLeft, y);
      const diffLabelWidth = pdf.getTextWidth("Diferença jornada 8h: ");
      pdf.setTextColor(totalDiffMinutes >= 0 ? 22 : 220, totalDiffMinutes >= 0 ? 163 : 38, totalDiffMinutes >= 0 ? 74 : 38);
      pdf.text(totalDiffStr, marginLeft + diffLabelWidth, y);
      pdf.setTextColor(33, 33, 33);
      pdf.setFont("helvetica", "normal"); y += 5;
      pdf.text(`Dias no período: ${previewRows.length}`, marginLeft, y); y += 5;
      pdf.text(`Dias úteis: ${workDays} | Dias trabalhados: ${daysWorked}`, marginLeft, y); y += 5;
      pdf.text(`Faltas: ${absences} | Atestados: ${atestados}`, marginLeft, y); y += 15;

      addNewPageIfNeeded(40);
      pdf.setDrawColor(150, 150, 150);
      pdf.setLineWidth(0.3);
      const sigLineWidth = 70;
      const sigX = pageWidth / 2 - sigLineWidth / 2;
      pdf.line(sigX, y, sigX + sigLineWidth, y); y += 5;
      pdf.setTextColor(33, 33, 33);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "bold");
      pdf.text("Eduardo César Vilar", pageWidth / 2, y, { align: "center" }); y += 4;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text(companyName || "Betices Bolos Artesanais", pageWidth / 2, y, { align: "center" }); y += 4;
      pdf.text("Gestor", pageWidth / 2, y, { align: "center" }); y += 4;
      pdf.setTextColor(100, 100, 100);
      pdf.setFontSize(7);
      pdf.text(`Documento gerado digitalmente em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}`, pageWidth / 2, y, { align: "center" }); y += 3;
      pdf.text("Assinatura digital — Válido sem necessidade de reconhecimento de firma.", pageWidth / 2, y, { align: "center" });

      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setTextColor(150, 150, 150);
        pdf.setFontSize(7);
        pdf.text("Argos Soluções — Relatório de Ponto", marginLeft, pageHeight - 10);
        pdf.text(`Página ${i} de ${totalPages}`, pageWidth - marginRight, pageHeight - 10, { align: "right" });
      }

      const fileName = `relatorio_ponto_${employeeName.replace(/\s+/g, "_")}_${startDate}_${endDate}.pdf`;
      pdf.save(fileName);
      toast.success("Relatório PDF gerado com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao gerar relatório: " + err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (!companyId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Cadastre uma empresa primeiro para gerar relatórios.
        </CardContent>
      </Card>
    );
  }

  const totalMinutes = previewRows.reduce((sum, r) => sum + r.dayMinutes, 0);
  const totalDiffMinutes = previewRows.reduce((sum, r) => sum + r.diffMinutes, 0);
  const absTotalDiff = Math.abs(totalDiffMinutes);
  const totalDiffStr = `${totalDiffMinutes >= 0 ? "+" : "-"}${Math.floor(absTotalDiff / 60)}h${String(Math.round(absTotalDiff % 60)).padStart(2, "0")}`;
  const workDays = previewRows.filter(r => !r.isWeekend).length;
  const daysWorked = previewRows.filter(r => r.statusStr === "OK").length;
  const absences = previewRows.filter(r => r.statusStr === "Falta").length;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Relatório de Ponto por Funcionário</h2>

      {/* Hidden header for PDF rendering */}
      <div
        ref={headerRef}
        style={{
          display: "none",
          width: "680px",
          padding: "30px 20px",
          backgroundColor: "#ffffff",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "8px" }}>
          <p style={{ fontSize: "18px", fontWeight: "bold", color: "#1E40AF", margin: "0 0 4px 0" }}>
            {companyName || "Empresa"}
          </p>
          <p style={{ fontSize: "13px", color: "#444", margin: "0 0 2px 0" }}>
            CNPJ: {companyCnpj ? formatCnpj(companyCnpj) : "—"}
          </p>
        </div>
        <div style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#25D366">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          <span style={{ fontSize: "13px", color: "#444", fontWeight: "500" }}>(84) 99418-0810</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            Gerar Relatório em PDF
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Funcionário</label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o funcionário" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.user_id} value={emp.user_id}>
                      {emp.name || emp.email || "Sem nome"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Data Início</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Data Fim</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="pl-9" />
                </div>
              </div>
            </div>
          </div>

          <Button
            onClick={handlePreview}
            disabled={loading || !selectedEmployee || !startDate || !endDate}
            className="w-full sm:w-auto"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {loading ? "Carregando..." : "Visualizar Relatório"}
          </Button>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Pré-visualização do Relatório
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Employee info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-medium">Funcionário:</span> {employeeName}</div>
              <div><span className="font-medium">E-mail:</span> {employeeEmail}</div>
              <div><span className="font-medium">Período:</span> {startDate && endDate ? `${format(parseISO(startDate), "dd/MM/yyyy")} a ${format(parseISO(endDate), "dd/MM/yyyy")}` : ""}</div>
              <div><span className="font-medium">Emissão:</span> {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</div>
            </div>

            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Pencil className="h-3 w-3" /> Clique em um horário para editá-lo antes de gerar o PDF.
            </p>

            {/* Responsive Table / Cards */}
            <div className="border rounded-lg overflow-hidden bg-background">
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary hover:bg-primary">
                      <TableHead className="text-primary-foreground text-xs font-bold whitespace-nowrap">Data</TableHead>
                      <TableHead className="text-primary-foreground text-xs font-bold whitespace-nowrap">Entrada</TableHead>
                      <TableHead className="text-primary-foreground text-xs font-bold whitespace-nowrap">Saída Alm.</TableHead>
                      <TableHead className="text-primary-foreground text-xs font-bold whitespace-nowrap">Ret. Alm.</TableHead>
                      <TableHead className="text-primary-foreground text-xs font-bold whitespace-nowrap">Saída</TableHead>
                      <TableHead className="text-primary-foreground text-xs font-bold whitespace-nowrap text-center">Total</TableHead>
                      <TableHead className="text-primary-foreground text-xs font-bold whitespace-nowrap text-center">Dif. 8h</TableHead>
                      <TableHead className="text-primary-foreground text-xs font-bold whitespace-nowrap">Status</TableHead>
                      <TableHead className="text-primary-foreground text-xs font-bold w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, idx) => (
                      <TableRow
                        key={row.dateKey}
                        className={`text-xs ${(row.isWeekend && row.statusStr === "Folga") || row.statusStr.startsWith("Feriado") ? "bg-amber-50 dark:bg-amber-950/20" : idx % 2 === 0 ? "bg-muted/30" : ""}`}
                      >
                        <TableCell className={`py-2 font-medium whitespace-nowrap ${row.isWeekend || row.statusStr.startsWith("Feriado") ? "text-destructive" : ""}`}>
                          {format(row.date, "dd/MM/yyyy")} {format(row.date, "EEEE", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase())}
                        </TableCell>
                        {(["entrada", "saidaAlmoco", "retornoAlmoco", "saida"] as const).map((field) => (
                          <TableCell key={field} className="py-2">
                            {editingIdx === idx ? (
                              <Input
                                type="time"
                                value={row[field] === "—" ? "" : row[field]}
                                onChange={(e) => updateRow(idx, field, e.target.value || "—")}
                                className="h-8 w-24 text-xs p-1"
                              />
                            ) : (
                              <span
                                className="cursor-pointer hover:text-primary hover:underline px-2 py-1 block rounded hover:bg-primary/5 transition-colors"
                                onClick={() => setEditingIdx(idx)}
                              >
                                {row[field]}
                              </span>
                            )}
                          </TableCell>
                        ))}
                        <TableCell className="py-2 font-medium text-center">{row.totalStr}</TableCell>
                        <TableCell className={`py-2 font-medium text-center ${row.diffMinutes > 0 ? "text-green-600" : row.diffMinutes < 0 ? "text-destructive" : ""}`}>{row.diffStr}</TableCell>
                        <TableCell className="py-2">
                          <div className="space-y-1">
                            <Select
                              value={row.statusStr}
                              onValueChange={(val) => {
                                setPreviewRows(prev => {
                                  const updated = [...prev];
                                  updated[idx] = { ...updated[idx], statusStr: val };
                                  return updated;
                                });
                              }}
                            >
                              <SelectTrigger className={`h-8 w-32 text-xs px-2 font-medium ${
                                row.statusStr === "Falta" ? "text-destructive" 
                                : row.statusStr === "OK" ? "text-green-600" 
                                : row.statusStr === "Atestado Médico" ? "text-blue-600"
                                : "text-amber-600"
                              }`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="OK">OK</SelectItem>
                                <SelectItem value="Falta">Falta</SelectItem>
                                <SelectItem value="Atestado Médico">Atestado Médico</SelectItem>
                                <SelectItem value="Folga">Folga</SelectItem>
                                <SelectItem value="Feriado Nacional">Feriado Nacional</SelectItem>
                                <SelectItem value="Feriado Estadual">Feriado Estadual</SelectItem>
                                <SelectItem value="Feriado Municipal">Feriado Municipal</SelectItem>
                                <SelectItem value="Outros">Outros</SelectItem>
                              </SelectContent>
                            </Select>
                            
                            {row.statusStr === "Outros" && (
                              <Input
                                placeholder="Observação..."
                                value={row.observations || ""}
                                onChange={(e) => {
                                  setPreviewRows(prev => {
                                    const updated = [...prev];
                                    updated[idx] = { ...updated[idx], observations: e.target.value };
                                    return updated;
                                  });
                                }}
                                className="h-7 w-32 text-[10px] px-2 py-0"
                              />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          {editingIdx === idx ? (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => setEditingIdx(null)} title="Confirmar">
                              ✓
                            </Button>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingIdx(idx)} title="Editar">
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y">
                {previewRows.map((row, idx) => (
                  <div 
                    key={row.dateKey} 
                    className={`p-4 space-y-3 ${(row.isWeekend && row.statusStr === "Folga") || row.statusStr.startsWith("Feriado") ? "bg-amber-50/50 dark:bg-amber-950/10" : idx % 2 === 0 ? "bg-muted/10" : ""}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className={`text-sm font-bold ${row.isWeekend || row.statusStr.startsWith("Feriado") ? "text-destructive" : "text-foreground"}`}>
                        {format(row.date, "dd/MM/yyyy")} {format(row.date, "EEEE", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase())}
                      </div>
                      <div className="flex gap-2">
                        {editingIdx === idx ? (
                          <Button size="sm" variant="outline" className="h-8 text-green-600" onClick={() => setEditingIdx(null)}>
                            ✓ Confirmar
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingIdx(idx)}>
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <span className="text-muted-foreground">Entrada</span>
                        {editingIdx === idx ? (
                          <Input type="time" value={row.entrada === "—" ? "" : row.entrada} onChange={(e) => updateRow(idx, "entrada", e.target.value || "—")} className="h-8 text-xs" />
                        ) : (
                          <div className="font-semibold">{row.entrada}</div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <span className="text-muted-foreground">Saída</span>
                        {editingIdx === idx ? (
                          <Input type="time" value={row.saida === "—" ? "" : row.saida} onChange={(e) => updateRow(idx, "saida", e.target.value || "—")} className="h-8 text-xs" />
                        ) : (
                          <div className="font-semibold">{row.saida}</div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <span className="text-muted-foreground">Saída Alm.</span>
                        {editingIdx === idx ? (
                          <Input type="time" value={row.saidaAlmoco === "—" ? "" : row.saidaAlmoco} onChange={(e) => updateRow(idx, "saidaAlmoco", e.target.value || "—")} className="h-8 text-xs" />
                        ) : (
                          <div className="font-semibold">{row.saidaAlmoco}</div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <span className="text-muted-foreground">Ret. Alm.</span>
                        {editingIdx === idx ? (
                          <Input type="time" value={row.retornoAlmoco === "—" ? "" : row.retornoAlmoco} onChange={(e) => updateRow(idx, "retornoAlmoco", e.target.value || "—")} className="h-8 text-xs" />
                        ) : (
                          <div className="font-semibold">{row.retornoAlmoco}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t text-xs">
                      <div className="flex gap-4">
                        <div>
                          <span className="text-muted-foreground mr-1">Total:</span>
                          <span className="font-bold">{row.totalStr}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground mr-1">Dif:</span>
                          <span className={`font-bold ${row.diffMinutes > 0 ? "text-green-600" : row.diffMinutes < 0 ? "text-destructive" : ""}`}>{row.diffStr}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Select
                          value={row.statusStr}
                          onValueChange={(val) => {
                            setPreviewRows(prev => {
                              const updated = [...prev];
                              updated[idx] = { ...updated[idx], statusStr: val };
                              return updated;
                            });
                          }}
                        >
                          <SelectTrigger className={`h-8 w-32 border-none shadow-none text-right font-medium p-0 ${
                            row.statusStr === "Falta" ? "text-destructive" 
                            : row.statusStr === "OK" ? "text-green-600" 
                            : row.statusStr === "Atestado Médico" ? "text-blue-600"
                            : "text-amber-600"
                          }`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="OK">OK</SelectItem>
                            <SelectItem value="Falta">Falta</SelectItem>
                            <SelectItem value="Atestado Médico">Atestado Médico</SelectItem>
                            <SelectItem value="Folga">Folga</SelectItem>
                            <SelectItem value="Feriado Nacional">Feriado Nacional</SelectItem>
                            <SelectItem value="Feriado Estadual">Feriado Estadual</SelectItem>
                            <SelectItem value="Feriado Municipal">Feriado Municipal</SelectItem>
                            <SelectItem value="Outros">Outros</SelectItem>
                          </SelectContent>
                        </Select>
                        {row.statusStr === "Outros" && (
                          <Input
                            placeholder="Descreva..."
                            value={row.observations || ""}
                            onChange={(e) => {
                              setPreviewRows(prev => {
                                const updated = [...prev];
                                updated[idx] = { ...updated[idx], observations: e.target.value };
                                return updated;
                              });
                            }}
                            className="h-7 w-32 text-[10px] ml-auto"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="text-muted-foreground text-xs">Total Horas</div>
                <div className="font-bold">{Math.floor(totalMinutes / 60)}h{String(Math.round(totalMinutes % 60)).padStart(2, "0")}min</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="text-muted-foreground text-xs">Dif. Jornada 8h</div>
                <div className={`font-bold ${totalDiffMinutes >= 0 ? "text-green-600" : "text-destructive"}`}>{totalDiffStr}</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="text-muted-foreground text-xs">Dias no Período</div>
                <div className="font-bold">{previewRows.length}</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="text-muted-foreground text-xs">Dias Úteis / Trabalhados</div>
                <div className="font-bold">{workDays} / {daysWorked}</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="text-muted-foreground text-xs">Faltas</div>
                <div className="font-bold text-destructive">{absences}</div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPreview(false)}>Fechar</Button>
            <Button
              variant="outline"
              onClick={() => {
                // Exporta o relatório em CSV (UTF-8 com BOM para Excel PT-BR).
                // Delimitador ";" evita quebra em números com vírgula decimal.
                const header = [
                  "Data",
                  "Dia da Semana",
                  "Entrada",
                  "Saída Almoço",
                  "Retorno Almoço",
                  "Saída",
                  "Total",
                  "Diferença",
                  "Status",
                  "Observações",
                ];
                const escape = (v: string) => `"${(v ?? "").toString().replace(/"/g, '""')}"`;
                const lines = previewRows.map((r) => [
                  format(r.date, "dd/MM/yyyy"),
                  format(r.date, "EEEE", { locale: ptBR }),
                  r.entrada,
                  r.saidaAlmoco,
                  r.retornoAlmoco,
                  r.saida,
                  r.totalStr,
                  r.diffStr,
                  r.statusStr,
                  r.observations ?? "",
                ].map(escape).join(";"));
                const csv = "\uFEFF" + [header.map(escape).join(";"), ...lines].join("\r\n");
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                const employeeName =
                  employees.find((e) => e.user_id === selectedEmployee)?.name || "funcionario";
                a.href = url;
                a.download = `relatorio_${employeeName.replace(/\s+/g, "_")}_${startDate}_${endDate}.csv`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success("CSV exportado");
              }}
            >
              <Download className="h-4 w-4 mr-2" /> Exportar CSV
            </Button>
            <Button onClick={generatePDFFromPreview} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              {generating ? "Gerando..." : "Exportar PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeeReport;
