import { format } from "date-fns";

export type HolidayType = "Feriado Nacional" | "Feriado Estadual" | "Feriado Municipal";

export interface Holiday {
  date: string; // MM-DD
  name: string;
  type: HolidayType;
}

// Fixed-date holidays
const fixedHolidays: Holiday[] = [
  // Nacionais
  { date: "01-01", name: "Confraternização Universal", type: "Feriado Nacional" },
  { date: "04-21", name: "Tiradentes", type: "Feriado Nacional" },
  { date: "05-01", name: "Dia do Trabalho", type: "Feriado Nacional" },
  { date: "09-07", name: "Independência do Brasil", type: "Feriado Nacional" },
  { date: "10-12", name: "Nossa Senhora Aparecida", type: "Feriado Nacional" },
  { date: "11-02", name: "Dia de Finados", type: "Feriado Nacional" },
  { date: "11-15", name: "Proclamação da República", type: "Feriado Nacional" },
  { date: "11-20", name: "Consciência Negra", type: "Feriado Nacional" },
  { date: "12-25", name: "Natal", type: "Feriado Nacional" },
  // Estadual RN
  { date: "10-03", name: "Mártires de Cunhaú e Uruaçu", type: "Feriado Estadual" },
  // Municipal Natal/RN
  { date: "01-06", name: "Santos Reis", type: "Feriado Municipal" },
  { date: "11-21", name: "N. Sra. da Apresentação", type: "Feriado Municipal" },
];

// Easter calculation (Anonymous Gregorian algorithm)
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Get all holidays for a given year (including movable ones)
export function getHolidaysForYear(year: number): Map<string, { name: string; type: HolidayType }> {
  const holidays = new Map<string, { name: string; type: HolidayType }>();

  // Fixed holidays
  for (const h of fixedHolidays) {
    const key = `${year}-${h.date}`;
    holidays.set(key, { name: h.name, type: h.type });
  }

  // Movable holidays based on Easter
  const easter = getEasterDate(year);
  
  // Carnaval: 47 days before Easter (Monday and Tuesday)
  const carnavalTue = addDays(easter, -47);
  const carnavalMon = addDays(easter, -48);
  holidays.set(format(carnavalMon, "yyyy-MM-dd"), { name: "Carnaval", type: "Feriado Nacional" });
  holidays.set(format(carnavalTue, "yyyy-MM-dd"), { name: "Carnaval", type: "Feriado Nacional" });

  // Sexta-feira Santa / Paixão de Cristo: 2 days before Easter
  const goodFriday = addDays(easter, -2);
  holidays.set(format(goodFriday, "yyyy-MM-dd"), { name: "Sexta-feira Santa", type: "Feriado Nacional" });
  // Also municipal in Natal
  holidays.set(format(goodFriday, "yyyy-MM-dd"), { name: "Paixão de Cristo", type: "Feriado Municipal" });

  // Corpus Christi: 60 days after Easter
  const corpusChristi = addDays(easter, 60);
  holidays.set(format(corpusChristi, "yyyy-MM-dd"), { name: "Corpus Christi", type: "Feriado Municipal" });

  return holidays;
}

// Check if a specific date is a holiday
export function getHolidayInfo(date: Date): { name: string; type: HolidayType } | null {
  const year = date.getFullYear();
  const holidays = getHolidaysForYear(year);
  const key = format(date, "yyyy-MM-dd");
  return holidays.get(key) || null;
}
