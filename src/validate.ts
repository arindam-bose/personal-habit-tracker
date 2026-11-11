// Checks a JSON file before it is imported, so nothing half-valid ever reaches storage.
// Every problem is listed, in words, so a hand-edited file can be fixed.

import { isIsoDate } from "./dates";
import type { DayLog, Habit, YearFile } from "./types";

export type ValidationResult = { ok: true; file: YearFile; warnings: string[] } | { ok: false; errors: string[] };

const KINDS = ["check", "duration", "number"];

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function isDateInYear(date: string, year: number): boolean {
  return isIsoDate(date) && date.startsWith(`${year}-`);
}

function checkHabit(h: unknown, i: number, year: number, errors: string[]): void {
  const at = `Habit ${i + 1}`;
  if (!isObject(h)) return void errors.push(`${at} is not an object.`);
  if (typeof h.id !== "string" || !h.id) errors.push(`${at} has no id.`);
  if (typeof h.name !== "string" || !h.name.trim()) errors.push(`${at} has no name.`);
  const name = typeof h.name === "string" && h.name ? `"${h.name}"` : at;
  if (typeof h.emoji !== "string") errors.push(`${name}'s emoji must be text (it may be empty).`);
  if (!KINDS.includes(h.kind as string)) errors.push(`${name} has an unknown kind "${String(h.kind)}" (check, duration or number).`);
  if (h.goal !== undefined) {
    if (h.kind === "check") errors.push(`${name} is a check habit, which has no goal.`);
    const g = h.goal;
    if (!isObject(g) || (g.op !== "atLeast" && g.op !== "atMost") || typeof g.value !== "number" || !(g.value >= 0)) {
      errors.push(`${name}'s goal must be { op: "atLeast" or "atMost", value: a number of 0 or more }.`);
    }
  }
  if (h.unit !== undefined && typeof h.unit !== "string") errors.push(`${name}'s unit must be text.`);
  for (const key of ["from", "to"] as const) {
    if (h[key] !== undefined && !isDateInYear(h[key] as string, year)) errors.push(`${name}'s "${key}" must be a date in ${year}.`);
  }
  if (typeof h.from === "string" && typeof h.to === "string" && h.to < h.from) errors.push(`${name} stops before it starts.`);
}

function checkDay(d: unknown, i: number, file: { year: number; start?: string }, habits: Map<string, Habit>, errors: string[]): void {
  if (!isObject(d)) return void errors.push(`Day ${i + 1} is not an object.`);
  const date = d.date;
  if (typeof date !== "string" || !isDateInYear(date, file.year)) return void errors.push(`Day ${i + 1} has a date "${String(date)}" that isn't a day in ${file.year}.`);
  if (file.start && date < file.start) errors.push(`${date} comes before tracking starts (${file.start}).`);
  if (d.note !== undefined && typeof d.note !== "string") errors.push(`${date}'s note must be text.`);
  if (!isObject(d.values)) return void errors.push(`${date} has no values.`);
  for (const [id, v] of Object.entries(d.values)) {
    const h = habits.get(id);
    if (!h) {
      errors.push(`${date} has a value for "${id}", which isn't one of the habits.`);
      continue;
    }
    const ok = h.kind === "check" ? v === true : typeof v === "number" && Number.isFinite(v) && v >= 0 && (h.kind !== "duration" || v <= 1440);
    if (!ok) {
      const want = h.kind === "check" ? "true" : h.kind === "duration" ? "minutes from 0 to 1440" : "a number of 0 or more";
      errors.push(`${date}: "${h.name}" must be ${want}, not ${JSON.stringify(v)}.`);
    }
  }
}

/** Check parsed JSON; on success, return it as a YearFile. Warnings don't stop the import. */
export function validateYearFile(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObject(data)) return { ok: false, errors: ["The file doesn't hold a Habit Tracker year."] };
  if (data.app !== "habit-tracker") {
    const other = data.app === "money-tracker" ? " It's a Money Tracker file." : "";
    return { ok: false, errors: [`This isn't a Habit Tracker file.${other}`] };
  }
  if (data.schema !== 1) errors.push(`Unknown file version ${String(data.schema)}: this tracker reads version 1. A newer tracker may have made it.`);
  const year = data.year;
  if (typeof year !== "number" || !Number.isInteger(year) || year < 1900 || year > 3000) return { ok: false, errors: [...errors, "The file has no valid year."] };
  if (data.start !== undefined && !isDateInYear(data.start as string, year)) errors.push(`The start day must be a date in ${year}.`);
  if (!Array.isArray(data.habits)) return { ok: false, errors: [...errors, "The file has no list of habits."] };
  if (!Array.isArray(data.days)) return { ok: false, errors: [...errors, "The file has no list of days."] };

  data.habits.forEach((h, i) => checkHabit(h, i, year, errors));
  const habits = new Map<string, Habit>();
  for (const h of data.habits as Habit[]) {
    if (habits.has(h?.id)) errors.push(`Two habits have the id "${h.id}".`);
    else if (h?.id) habits.set(h.id, h);
  }
  const seen = new Set<string>();
  (data.days as unknown[]).forEach((d, i) => {
    checkDay(d, i, { year, start: data.start as string | undefined }, habits, errors);
    const date = isObject(d) ? d.date : undefined;
    if (typeof date === "string") {
      if (seen.has(date)) errors.push(`${date} is in the file twice.`);
      seen.add(date);
    }
  });
  if (data.streaksIn !== undefined && (!isObject(data.streaksIn) || Object.values(data.streaksIn).some((n) => typeof n !== "number" || !(n >= 0)))) {
    errors.push("Carried-in streaks must be whole numbers of days.");
  }
  if (data.settings !== undefined && !isObject(data.settings)) errors.push("The settings must be an object.");
  if (typeof data.exportedAt !== "string") warnings.push("The file doesn't say when it was exported.");
  if (errors.length) return { ok: false, errors };

  const days = [...(data.days as DayLog[])].sort((a, b) => (a.date < b.date ? -1 : 1));
  return { ok: true, file: { ...(data as unknown as YearFile), exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : "", days }, warnings };
}
