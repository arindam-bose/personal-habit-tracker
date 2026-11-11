// Changing a year's setup: its habits and the day tracking starts, and what the next year
// starts with when a year is closed. Pure functions: state.ts saves what they return.

import { isDateInYear } from "./validate";
import { closingStreaks, firstDay, trackedOf } from "./score";
import type { YearData } from "./db";
import type { DayLog, Habit, IsoDate, YearFile, YearSetup } from "./types";

/** A change the user asked for that can't be made, with why, in words. */
export class SetupError extends Error {}

/** True when a day holds nothing worth keeping. */
export function isEmptyDay(day: DayLog): boolean {
  return Object.keys(day.values).length === 0 && !day.note?.trim();
}

/** How many days have a value for each habit, by id. */
export function valueCounts(days: DayLog[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of days) for (const id of Object.keys(d.values)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/**
 * Add a habit, or replace the one with the same id. Refuses a habit without a name, a name
 * already used, a change of kind once days have values for it, and first and last days outside
 * the year or the wrong way round.
 */
export function withHabit(data: YearData, habit: Habit): YearSetup {
  const { setup } = data;
  const name = habit.name.trim();
  if (!name) throw new SetupError("A habit needs a name.");
  if (setup.habits.some((h) => h.id !== habit.id && h.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new SetupError(`There is already a habit called "${name}".`);
  }
  const old = setup.habits.find((h) => h.id === habit.id);
  if (old && old.kind !== habit.kind && (valueCounts(data.days).get(habit.id) ?? 0) > 0) {
    throw new SetupError(`"${old.name}" has days logged, so it can't change from ${kindName(old.kind)} to ${kindName(habit.kind)}. Stop it and add a new habit instead.`);
  }
  if (habit.kind !== "check" && habit.goal && !(habit.goal.value >= 0)) throw new SetupError("The goal must be a number of 0 or more.");
  for (const [key, date] of [["first", habit.from], ["last", habit.to]] as const) {
    if (date === undefined) continue;
    if (!isDateInYear(date, setup.year)) throw new SetupError(`The ${key} day must be in ${setup.year}.`);
  }
  if (habit.from && habit.to && habit.to < habit.from) throw new SetupError("The last day comes before the first.");
  const clean: Habit = {
    id: habit.id,
    name,
    emoji: habit.emoji.trim(),
    kind: habit.kind,
    ...(habit.kind !== "check" && habit.goal ? { goal: habit.goal } : {}),
    ...(habit.kind === "number" && habit.unit?.trim() ? { unit: habit.unit.trim() } : {}),
    // A first day on or before the start is the same as none.
    ...(habit.from && habit.from > firstDay(setup) ? { from: habit.from } : {}),
    ...(habit.to && habit.to < `${setup.year}-12-31` ? { to: habit.to } : {}),
  };
  const habits = old ? setup.habits.map((h) => (h.id === habit.id ? clean : h)) : [...setup.habits, clean];
  return { ...setup, habits };
}

function kindName(kind: Habit["kind"]): string {
  return kind === "check" ? "a check" : kind === "duration" ? "a time" : "a number";
}

/** Move a habit up (-1) or down (+1) in the list. */
export function movedHabit(setup: YearSetup, id: string, delta: -1 | 1): YearSetup {
  const habits = [...setup.habits];
  const i = habits.findIndex((h) => h.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= habits.length) return setup;
  [habits[i], habits[j]] = [habits[j]!, habits[i]!];
  return { ...setup, habits };
}

/** Delete a habit and every value logged for it. Days left with nothing are removed. */
export function withoutHabit(data: YearData, id: string): { setup: YearSetup; put: DayLog[]; remove: IsoDate[] } {
  const put: DayLog[] = [];
  const remove: IsoDate[] = [];
  for (const day of data.days) {
    if (!(id in day.values)) continue;
    const { [id]: _gone, ...values } = day.values;
    const next = { ...day, values };
    if (isEmptyDay(next)) remove.push(day.date);
    else put.push(next);
  }
  const setup = { ...data.setup, habits: data.setup.habits.filter((h) => h.id !== id) };
  if (setup.streaksIn?.[id] !== undefined) {
    const { [id]: _s, ...rest } = setup.streaksIn;
    setup.streaksIn = rest;
  }
  return { setup, put, remove };
}

/** Move the day tracking starts (null: January 1). Refuses a day after something already logged. */
export function withStart(data: YearData, start: IsoDate | null): YearSetup {
  const { start: _old, ...setup } = data.setup;
  if (start === null || start === `${setup.year}-01-01`) return setup;
  if (!isDateInYear(start, setup.year)) throw new SetupError(`The start day must be in ${setup.year}.`);
  const early = data.days.filter((d) => d.date < start).map((d) => d.date).sort();
  if (early.length) throw new SetupError(`${early.length} day${early.length === 1 ? " is" : "s are"} logged before then (the first is ${early[0]}).`);
  return { ...setup, start };
}

/**
 * The next year, when a year is closed: the habits still counting on December 31, each for the
 * whole year (their first and last days don't carry), the streaks running on December 31, and no days.
 */
export function nextYearFile(data: YearData, now = new Date()): YearFile {
  const { setup } = data;
  const end = `${setup.year}-12-31`;
  const habits = setup.habits.filter((h) => h.to === undefined || h.to >= end).map(({ from: _f, to: _t, ...h }) => h);
  const streaks = closingStreaks(trackedOf(data));
  return {
    app: "habit-tracker",
    schema: 1,
    year: setup.year + 1,
    exportedAt: now.toISOString(),
    habits,
    days: [],
    ...(Object.keys(streaks).length ? { streaksIn: streaks } : {}),
  };
}

/** A year file with these habits and nothing logged yet. */
export function emptyYearFile(year: number, habits: Habit[], start: IsoDate | null = null, now = new Date()): YearFile {
  return {
    app: "habit-tracker",
    schema: 1,
    year,
    ...(start && start !== `${year}-01-01` ? { start } : {}),
    exportedAt: now.toISOString(),
    habits: habits.map(({ from: _f, to: _t, ...h }) => h),
    days: [],
  };
}
