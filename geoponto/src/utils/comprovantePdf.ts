import { jsPDF } from "jspdf";
import { format, parseISO } from "date-fns";
import { maskCpf } from "@/utils/cpf";

export interface ComprovanteData {
  nsr: number;
  hash: string;
  timestamp: string;
  serverReceivedAt: string | null;
  type: "in" | "out";
  employeeName: string;
  employeeCpf: string | null;
  employerName: string;
  employerCnpj: string;
}

/** Comprovante informativo do registro de ponto. Não substitui o comprovante oficial do REP. */
export const downloadComprovante = (d: ComprovanteData) => {
  const doc = new jsPDF({ unit: "mm", format: "a5" });
  doc.setFontSize(14);
  doc.text("COMPROVANTE DE REGISTRO DE PONTO", 14, 18);
  doc.setFontSize(10);
  const lines = [
    `Empregador: ${d.employerName}`,
    `CNPJ: ${d.employerCnpj}`,
    `Trabalhador: ${d.employeeName}`,
    d.employeeCpf ? `CPF: ${maskCpf(d.employeeCpf)}` : "CPF: não cadastrado",
    `NSR: ${d.nsr}`,
    `Registro: ${d.type === "in" ? "Entrada" : "Saída"}`,
    `Data/hora da marcação: ${format(parseISO(d.timestamp), "dd/MM/yyyy HH:mm:ss")}`,
    d.serverReceivedAt ? `Recebido pelo servidor em: ${format(parseISO(d.serverReceivedAt), "dd/MM/yyyy HH:mm:ss")}` : "",
    "Código de integridade (SHA-256):",
  ].filter(Boolean);
  doc.text(lines, 14, 30);
  doc.setFontSize(7);
  doc.text(doc.splitTextToSize(d.hash, 120), 14, 30 + lines.length * 5 + 2);
  doc.setFontSize(8);
  doc.text("Comprovante informativo gerado pelo GeoPonto. Não substitui o comprovante oficial do REP.", 14, 135);
  doc.save(`comprovante-NSR-${d.nsr}.pdf`);
};
