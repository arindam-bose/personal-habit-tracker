// What a habit is and how its values read: when a day's value meets its goal, how a time is
// typed and shown, and the habits a year can start with.

import type { DayLog, Goal, Habit, IsoDate } from "./types";

/** Whether the habit counts on this day: on or after its first day, and on or before its last. */
export function isActive(habit: Pick<Habit, "from" | "to">, date: IsoDate): boolean {
  return (habit.from === undefined || date >= habit.from) && (habit.to === undefined || date <= habit.to);
}

/** The habits that count on a day, in their order. */
export function activeOn(habits: Habit[], date: IsoDate): Habit[] {
  return habits.filter((h) => isActive(h, date));
}

/** Whether a logged value meets the habit: done for a check, the goal for a duration or number. Nothing logged never does. */
export function meets(habit: Pick<Habit, "kind" | "goal">, value: true | number | undefined): boolean {
  if (value === undefined) return false;
  if (habit.kind === "check") return value === true;
  if (typeof value !== "number") return false;
  if (!habit.goal) return true;
  return habit.goal.op === "atLeast" ? value >= habit.goal.value : value <= habit.goal.value;
}

/** Whether the habit was met on a logged day. */
export function metOn(habit: Habit, day: DayLog | undefined): boolean {
  return meets(habit, day?.values[habit.id]);
}

/** "7:05" for 425 minutes. */
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** "3 d 4 h 18 min" for long totals, "7 h 5 min" under a day. */
export function durationWords(minutes: number): string {
  const m = Math.round(minutes);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const parts = [d ? `${d} d` : "", h || d ? `${h} h` : "", `${m % 60} min`];
  return parts.filter(Boolean).join(" ");
}

/**
 * Minutes from what was typed: "7:45", "7h45", "7h 45m", "45m", "7.5" (hours) or "7" (hours).
 * Null when it can't be read. Up to 24 hours.
 */
export function parseDuration(text: string): number | null {
  const s = text.trim().toLowerCase();
  if (!s) return null;
  let minutes: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,2}):([0-5]\d)$/))) minutes = Number(m[1]) * 60 + Number(m[2]);
  else if (/^\d{1,2}(\.\d+)?$/.test(s)) minutes = Math.round(Number(s) * 60);
  else if ((m = s.match(/^(\d{1,2})\s*h(?:rs?|ours?)?\s*(?:(\d{1,2})\s*(?:m(?:in(?:ute)?s?)?)?)?$/))) {
    minutes = Number(m[1]) * 60 + Number(m[2] ?? 0);
  } else if ((m = s.match(/^(\d{1,4})\s*m(?:in(?:ute)?s?)?$/))) minutes = Number(m[1]);
  return minutes !== null && minutes <= 1440 ? minutes : null;
}

/** A number typed in a number habit's box, or null. Whole or decimal, not negative. */
export function parseCount(text: string): number | null {
  const s = text.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** A value as it reads: "7:45", "8 glasses", "Done". */
export function formatValue(habit: Pick<Habit, "kind" | "unit">, value: true | number): string {
  if (value === true) return "Done";
  if (habit.kind === "duration") return formatMinutes(value);
  return `${value.toLocaleString()}${habit.unit ? ` ${habit.unit}` : ""}`;
}

/** "at least 7:30", "at most 6:00", "at least 8 glasses". */
export function goalText(habit: Pick<Habit, "kind" | "goal" | "unit">): string {
  if (!habit.goal) return "";
  const value = habit.kind === "duration" ? formatMinutes(habit.goal.value) : `${habit.goal.value.toLocaleString()}${habit.unit ? ` ${habit.unit}` : ""}`;
  return `${habit.goal.op === "atLeast" ? "at least" : "at most"} ${value}`;
}

/** "≥ 7:30", "≤ 6:00": the goal, short, for tight places. */
export function goalShort(habit: Pick<Habit, "kind" | "goal" | "unit">): string {
  if (!habit.goal) return "";
  const value = habit.kind === "duration" ? formatMinutes(habit.goal.value) : habit.goal.value.toLocaleString();
  return `${habit.goal.op === "atLeast" ? "≥" : "≤"} ${value}`;
}

/** The name with its emoji: "🧘 Meditation". */
export function label(habit: Pick<Habit, "emoji" | "name">): string {
  return habit.emoji ? `${habit.emoji} ${habit.name}` : habit.name;
}

export function slug(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** An id for a new habit, from its name: "h_cold-shower", or "h_cold-shower-2" when that is taken. */
export function habitId(name: string, taken: (id: string) => boolean): string {
  const base = `h_${slug(name) || "habit"}`;
  if (!taken(base)) return base;
  for (let i = 2; ; i++) if (!taken(`${base}-${i}`)) return `${base}-${i}`;
}

/** Habits to pick from when starting a year from scratch. */
export const STARTER_HABITS: Habit[] = [
  { id: "h_wake-up-early", name: "Wake up early", emoji: "⏰", kind: "check" },
  { id: "h_meditation", name: "Meditation", emoji: "🧘", kind: "check" },
  { id: "h_workout", name: "Workout", emoji: "🏋️", kind: "check" },
  { id: "h_read", name: "Read", emoji: "📖", kind: "check" },
  { id: "h_no-alcohol", name: "No Alcohol", emoji: "🚫", kind: "check" },
  { id: "h_water", name: "Water", emoji: "💧", kind: "number", unit: "glasses", goal: { op: "atLeast", value: 8 } },
  { id: "h_sleep-time", name: "Sleep Time", emoji: "💤", kind: "duration", goal: { op: "atLeast", value: 450 } },
  { id: "h_screen-time", name: "Screen Time", emoji: "📱", kind: "duration", goal: { op: "atMost", value: 360 } },
];

export function sameGoal(a: Goal | undefined, b: Goal | undefined): boolean {
  return a?.op === b?.op && a?.value === b?.value;
}
