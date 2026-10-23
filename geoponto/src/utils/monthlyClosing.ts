import { eachDayOfInterval, endOfMonth, format, isWeekend, parseISO, startOfMonth } from "date-fns";
import { calculateDailyMinutes, type TimeEntry } from "./timeCalculations";
import { getHolidayInfo } from "./holidays";

/** CLT art. 58 §1º: variações de até 5 min por marcação (máx. 10 min/dia) não contam. */
export const DAILY_TOLERANCE_MINUTES = 10;

export interface DayClosing {
  dateKey: string;
  expected: number;
  worked: number;
  extra: number;
  deficit: number;
  absent: boolean;
  justified: boolean;
  inconsistent: boolean;
}

export interface MonthClosing {
  days: DayClosing[];
  expected: number;
  worked: number;
  extra: number;
  deficit: number;
  absences: number;
  inconsistencies: number;
  balance: number;
}

/** Marcações fora de ordem entrada/saída ou com entrada sem saída. */
export const hasInconsistency = (entries: TimeEntry[]): boolean => {
  const sorted = [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let open = false;
  for (const e of sorted) {
    if (e.type === "in") {
      if (open) return true;
      open = true;
    } else {
      if (!open) return true;
      open = false;
    }
  }
  return open;
};

export const closeMonth = (
  month: Date,
  entries: TimeEntry[],
  dailyHours: number,
  justifiedDates: Set<string> = new Set(),
  today: Date = new Date(),
): MonthClosing => {
  const byDay = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const key = format(parseISO(e.timestamp), "yyyy-MM-dd");
    byDay.set(key, [...(byDay.get(key) ?? []), e]);
  }

  const days: DayClosing[] = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }).map((d) => {
    const dateKey = format(d, "yyyy-MM-dd");
    const dayEntries = byDay.get(dateKey) ?? [];
    const isWorkday = !isWeekend(d) && !getHolidayInfo(d);
    const justified = justifiedDates.has(dateKey);
    const expected = isWorkday && !justified && d <= today ? Math.round(dailyHours * 60) : 0;
    const worked = calculateDailyMinutes(dayEntries);
    let diff = worked - expected;
    if (Math.abs(diff) <= DAILY_TOLERANCE_MINUTES) diff = 0;
    return {
      dateKey,
      expected,
      worked,
      extra: Math.max(0, diff),
      deficit: Math.max(0, -diff),
      absent: expected > 0 && dayEntries.length === 0,
      justified,
      inconsistent: hasInconsistency(dayEntries),
    };
  });

  const sum = (f: (d: DayClosing) => number) => days.reduce((acc, d) => acc + f(d), 0);
  const extra = sum((d) => d.extra);
  const deficit = sum((d) => d.deficit);
  return {
    days,
    expected: sum((d) => d.expected),
    worked: sum((d) => d.worked),
    extra,
    deficit,
    absences: days.filter((d) => d.absent).length,
    inconsistencies: days.filter((d) => d.inconsistent).length,
    balance: extra - deficit,
  };
};

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export const closingToCsv = (rows: { name: string; closing: MonthClosing }[]): string => {
  const hm = (m: number) => `${m < 0 ? "-" : ""}${Math.floor(Math.abs(m) / 60)}:${String(Math.abs(m) % 60).padStart(2, "0")}`;
  const header = ["Funcionário", "Previstas", "Trabalhadas", "Horas extras", "Atrasos/saldo negativo", "Saldo", "Faltas", "Inconsistências"];
  const lines = rows.map(({ name, closing: c }) =>
    [name, hm(c.expected), hm(c.worked), hm(c.extra), hm(c.deficit), hm(c.balance), c.absences, c.inconsistencies].map(csvCell).join(";"),
  );
  return "﻿" + [header.map(csvCell).join(";"), ...lines].join("\r\n");
};

export const downloadFile = (content: string, filename: string, mime: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
