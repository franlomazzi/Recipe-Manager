import {
  addDays,
  getISOWeek,
  getISOWeekYear,
  parseISO,
  startOfWeek,
} from "date-fns";

export function isoWeekKey(date: Date): string {
  const year = getISOWeekYear(date);
  const week = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function isoWeekKeyForOffset(
  planStartDate: string,
  offset: number
): string {
  const planStart = parseISO(planStartDate);
  const firstMonday = startOfWeek(planStart, { weekStartsOn: 1 });
  return isoWeekKey(addDays(firstMonday, offset * 7));
}

export function legacyWeekKey(offset: number): string {
  return String(offset);
}
