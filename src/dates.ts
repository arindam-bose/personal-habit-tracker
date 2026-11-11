// Calendar dates as "YYYY-MM-DD" strings. All arithmetic is done in UTC, so a day is always a
// day, whatever the reader's time zone and daylight saving; only "today" reads the local clock.

import type { IsoDate } from "./types";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAYS_SHORT = WEEKDAYS.map((d) => d.slice(0, 3));

const DAY_MS = 86_400_000;

function utc(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Today on the reader's own clock (UTC would make an evening tomorrow, west of Greenwich). */
export function localToday(now = new Date()): IsoDate {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  return new Date(utc(iso).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / DAY_MS);
}

/** 0 for Sunday to 6 for Saturday. */
export function weekday(iso: IsoDate): number {
  return utc(iso).getUTCDay();
}

/** 1 to 12. */
export function monthOf(iso: IsoDate): number {
  return Number(iso.slice(5, 7));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isLeap(year: number): boolean {
  return daysInMonth(year, 2) === 29;
}

/** Every date from a to b, both included. Empty if b is before a. */
export function dateRange(a: IsoDate, b: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The first day of the week holding `iso`, for weeks starting on `weekStart` (0 Sunday, 1 Monday). */
export function weekOf(iso: IsoDate, weekStart: 0 | 1): IsoDate {
  return addDays(iso, -((weekday(iso) - weekStart + 7) % 7));
}

export function isIsoDate(s: unknown): s is IsoDate {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = utc(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** "Wed, 11 Nov 2026" (in the reader's own date order). */
export function longDate(iso: IsoDate): string {
  return utc(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "11 Nov" (in the reader's own date order). */
export function shortDate(iso: IsoDate): string {
  return utc(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

/** A moment, e.g. "11 Nov 2026, 17:31", with seconds when asked. */
export function dateTime(iso: string, seconds = false): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}),
  });
}
