import { differenceInMinutes, parseISO } from "date-fns";

export interface TimeEntry {
  timestamp: string;
  type: "in" | "out";
}

/**
 * Calcula o total de minutos trabalhados em um dia, considerando múltiplos intervalos.
 * Regra: Soma a diferença entre cada Saída e sua Entrada correspondente.
 */
export const calculateDailyMinutes = (entries: TimeEntry[]): number => {
  const sorted = [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let total = 0;
  let lastIn: string | null = null;

  for (const entry of sorted) {
    if (entry.type === "in") {
      lastIn = entry.timestamp;
    } else if (entry.type === "out" && lastIn) {
      total += differenceInMinutes(parseISO(entry.timestamp), parseISO(lastIn));
      lastIn = null;
    }
  }

  return Math.max(0, total);
};

/**
 * Formata minutos em string HH:mm
 */
export const formatMinutes = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h${String(m).padStart(2, "0")}`;
};

/**
 * Verifica se um horário de entrada é considerado atraso (ex: após 08:15)
 */
export const isEntryLate = (timestamp: string, limitHour = 8, limitMinute = 15): boolean => {
  const date = parseISO(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return hours > limitHour || (hours === limitHour && minutes > limitMinute);
};
