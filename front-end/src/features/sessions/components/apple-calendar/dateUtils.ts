import type { MonthMatrixCell } from "./types";

const MONTH_NAMES_PT = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export const WEEKDAY_LABELS_PT = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

export function toDateKeyFromDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function toDateKeyFromIso(isoDateTime: string): string {
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) {
    return isoDateTime.slice(0, 10);
  }
  return toDateKeyFromDate(parsed);
}

export function fromDateKey(dateKey: string): Date {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date();
  }
  return new Date(year, month - 1, day);
}

export function toMonthKey(monthDate: Date): string {
  return [monthDate.getFullYear(), String(monthDate.getMonth() + 1).padStart(2, "0")].join("-");
}

export function fromMonthKey(monthKey: string): Date {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return startOfMonth(new Date());
  }
  return new Date(year, month - 1, 1);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, amount: number): Date {
  const base = new Date(date);
  base.setDate(1);
  base.setMonth(base.getMonth() + amount);
  return startOfMonth(base);
}

export function monthLabel(monthDate: Date): string {
  return MONTH_NAMES_PT[monthDate.getMonth()];
}

export function monthAndYearLabel(monthDate: Date): string {
  return `${monthLabel(monthDate)} ${monthDate.getFullYear()}`;
}

export function yearMonths(year: number): Date[] {
  return Array.from({ length: 12 }, (_, index) => new Date(year, index, 1));
}

export function buildMonthMatrix(monthDate: Date): MonthMatrixCell[] {
  const monthStart = startOfMonth(monthDate);
  const firstWeekDay = monthStart.getDay();
  const start = new Date(monthStart);
  start.setDate(monthStart.getDate() - firstWeekDay);

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    return {
      dateKey: toDateKeyFromDate(current),
      day: current.getDate(),
      inCurrentMonth: current.getMonth() === monthStart.getMonth(),
    } satisfies MonthMatrixCell;
  });
}

export function splitIntoWeeks(cells: MonthMatrixCell[]): MonthMatrixCell[][] {
  const weeks: MonthMatrixCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

export function toTimeLabel(isoDateTime: string): string {
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) {
    return "--:--";
  }
  return parsed.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function combineDateAndTime(dateKey: string, timeText: string): string | null {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-");
  const [hourRaw, minuteRaw] = timeText.split(":");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  const localDate = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(localDate.getTime())) {
    return null;
  }
  return localDate.toISOString();
}
