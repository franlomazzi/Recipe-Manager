import {
  addDays,
  format,
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

/** On Saturday or Sunday, returns next Monday's ISO date (look-ahead for shopping prep).
 *  On all other days, returns the current Monday — same as currentWeekMonday(). */
export function shoppingCurrentMonday(): string {
  const now = new Date();
  const base = startOfWeek(now, { weekStartsOn: 1 });
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  return format(day === 0 || day === 6 ? addDays(base, 7) : base, "yyyy-MM-dd");
}
