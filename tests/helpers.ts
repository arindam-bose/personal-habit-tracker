import type { DayLog, Habit, YearFile } from "../src/types";

export const HABITS: Habit[] = [
  { id: "h_med", name: "Meditation", emoji: "🧘", kind: "check" },
  { id: "h_sleep", name: "Sleep", emoji: "💤", kind: "duration", goal: { op: "atLeast", value: 450 } },
  { id: "h_screen", name: "Screen", emoji: "📱", kind: "duration", goal: { op: "atMost", value: 360 } },
];

export function yearFile(days: DayLog[], extra: Partial<YearFile> = {}): YearFile {
  return { app: "habit-tracker", schema: 1, year: 2026, exportedAt: "2026-11-11T12:00:00.000Z", habits: HABITS, days, ...extra };
}
