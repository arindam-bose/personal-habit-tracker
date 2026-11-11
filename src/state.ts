// App-wide reactive state. Components read these signals and re-render when they change.
// Every change goes through the actions below: they write to IndexedDB first, then
// update the signal, so what you see is always what is stored.

import { computed, signal } from "@preact/signals";
import { downloadYear } from "./backup";
import { dayCounts, deleteYear, eraseAll, getSetting, listYears, loadYear, putChange, replaceYear, setSetting, type YearData } from "./db";
import { localToday } from "./dates";
import { trackedOf, type Tracked } from "./score";
import { emptyYearFile, isEmptyDay, movedHabit, nextYearFile, withHabit, withoutHabit, withStart } from "./setup";
import type { PersistState } from "./storage";
import type { DayLog, Habit, IsoDate, YearSetup } from "./types";

export interface YearSummary {
  setup: YearSetup;
  /** Days with something logged. */
  days: number;
}

/** Every stored year with how many days it has logged, newest first. */
export const years = signal<YearSummary[]>([]);

export const persistState = signal<PersistState | null>(null);

/** The year being viewed and edited, fully loaded. Null until one is started or imported. */
export const current = signal<YearData | null>(null);

/** A closed year can be looked at but not changed. */
export const readOnly = computed(() => current.value?.setup.closed === true);

/** The open year in the shape the calculations in score.ts take. */
export const tracked = computed<Tracked | null>(() => (current.value ? trackedOf(current.value) : null));

/** Today, on the reader's clock. Moves on at midnight while the page stays open. */
export const today = signal<IsoDate>(localToday());
if (typeof window !== "undefined") {
  setInterval(() => {
    const now = localToday();
    if (now !== today.value) today.value = now;
  }, 60_000);
}

/** The day the Today page shows. Other pages set it to open a day there. */
export const selectedDay = signal<IsoDate>(today.value);

/** The first day of the week: 1 Monday, 0 Sunday. */
export const weekStart = signal<0 | 1>(1);

export async function loadSettings(): Promise<void> {
  weekStart.value = (await getSetting("weekStart")) ?? 1;
}

export async function saveWeekStart(value: 0 | 1): Promise<void> {
  weekStart.value = value;
  await setSetting("weekStart", value);
}

export async function refreshYears(): Promise<void> {
  const [setups, counts] = await Promise.all([listYears(), dayCounts()]);
  years.value = setups.map((setup) => ({ setup, days: counts.get(setup.year) ?? 0 })).sort((a, b) => b.setup.year - a.setup.year);
}

/**
 * Load a year into `current`. Without an argument, opens the year used last time, or else this
 * year if stored, or else the newest stored year.
 */
export async function openYear(year?: number): Promise<void> {
  await refreshYears();
  const stored = years.value.map((y) => y.setup.year);
  const saved = await getSetting("activeYear");
  const thisYear = Number(today.value.slice(0, 4));
  const pick = [year, saved, thisYear, stored[0]].find((y) => y !== undefined && stored.includes(y));
  current.value = pick === undefined ? null : await loadYear(pick);
  if (pick !== undefined && pick !== saved) await setSetting("activeYear", pick);
  // The Today page shows a day of the open year: today when it's this year, else its last day.
  if (pick !== undefined && !selectedDay.value.startsWith(`${pick}-`)) {
    selectedDay.value = pick === thisYear ? today.value : `${pick}-${pick < thisYear ? "12-31" : "01-01"}`;
  }
}

/** Every stored year, oldest first (for Over the years). */
export async function loadAllYears(): Promise<YearData[]> {
  const all = await Promise.all(years.value.map((y) => loadYear(y.setup.year)));
  return all.filter((d): d is YearData => d !== null).sort((a, b) => a.setup.year - b.setup.year);
}

// Changes run one at a time. Each one reads the current state only when its turn comes,
// so two quick changes (ticking habits fast) can't overwrite each other.
let queue: Promise<unknown> = Promise.resolve();

function inTurn<T>(change: () => Promise<T>): Promise<T> {
  const run = queue.then(change);
  queue = run.catch(() => undefined); // a failed change must not block the ones after it
  return run;
}

function editable(): YearData {
  const data = current.value;
  if (!data) throw new Error("No year is open.");
  if (data.setup.closed) throw new Error(`${data.setup.year} is closed and can't be changed.`);
  return data;
}

const stamp = () => new Date().toISOString();

/** Save new days (and the setup stamped as changed) and show them. */
async function saveDays(data: YearData, put: DayLog[], remove: IsoDate[], setup: YearSetup): Promise<void> {
  await putChange(setup, put, remove);
  const gone = new Set([...remove, ...put.map((d) => d.date)]);
  const days = [...data.days.filter((d) => !gone.has(d.date)), ...put].sort((a, b) => (a.date < b.date ? -1 : 1));
  current.value = { setup, days };
}

/** Change one day's log with `edit`. A day left with nothing is removed. */
function changeDay(date: IsoDate, edit: (day: DayLog) => DayLog): Promise<void> {
  return inTurn(async () => {
    const data = editable();
    const { year, start } = data.setup;
    if (!date.startsWith(`${year}-`)) throw new Error(`${date} isn't in ${year}.`);
    if (start && date < start) throw new Error(`Tracking starts on ${start}.`);
    if (date > today.value) throw new Error("That day hasn't come yet.");
    const old = data.days.find((d) => d.date === date) ?? { date, values: {} };
    const next = edit(old);
    if (JSON.stringify(next) === JSON.stringify(old)) return;
    const setup = { ...data.setup, lastChangedAt: stamp() };
    if (isEmptyDay(next)) await saveDays(data, [], [date], setup);
    else await saveDays(data, [next], [], setup);
  });
}

/** Set a habit's value on a day: true (done) or a number; null clears it. */
export function setValue(date: IsoDate, habitId: string, value: true | number | null): Promise<void> {
  return changeDay(date, (day) => {
    const { [habitId]: _old, ...values } = day.values;
    return { ...day, values: value === null ? values : { ...values, [habitId]: value } };
  });
}

export function setNote(date: IsoDate, note: string): Promise<void> {
  return changeDay(date, ({ note: _old, ...day }) => (note.trim() ? { ...day, note: note.trim() } : day));
}

/** Save a setup change (habits, start day), stamped, unless it changes nothing. */
async function saveSetup(data: YearData, change: YearSetup): Promise<void> {
  if (JSON.stringify(change) === JSON.stringify(data.setup)) return;
  const setup = { ...change, setupChangedAt: stamp() };
  await putChange(setup);
  current.value = { ...data, setup };
}

/** Add a habit, or save changes to one. Throws a SetupError when it can't be saved. */
export function saveHabit(habit: Habit): Promise<void> {
  return inTurn(async () => {
    const data = editable();
    await saveSetup(data, withHabit(data, habit));
  });
}

export function moveHabit(id: string, delta: -1 | 1): Promise<void> {
  return inTurn(async () => {
    const data = editable();
    await saveSetup(data, movedHabit(data.setup, id, delta));
  });
}

/** Delete a habit and everything logged for it. */
export function removeHabit(id: string): Promise<void> {
  return inTurn(async () => {
    const data = editable();
    const { setup, put, remove } = withoutHabit(data, id);
    const at = stamp();
    await saveDays(data, put, remove, { ...setup, setupChangedAt: at, ...(put.length + remove.length ? { lastChangedAt: at } : {}) });
  });
}

/** Move the day the open year's tracking starts (null: January 1). */
export function setStart(start: IsoDate | null): Promise<void> {
  return inTurn(async () => {
    const data = editable();
    await saveSetup(data, withStart(data, start));
  });
}

/** Start a year with these habits and nothing logged. */
export async function startYear(year: number, habits: Habit[], start: IsoDate | null = null): Promise<void> {
  await inTurn(async () => {
    if ((await listYears()).some((y) => y.year === year)) throw new Error(`${year} already exists.`);
    await replaceYear(emptyYearFile(year, habits, start));
  });
  await openYear(year);
}

/** Download a year's backup and mark it as backed up, in turn with any save on its way. */
export function backUpYear(year: number): Promise<void> {
  return inTurn(async () => {
    await downloadYear(year);
    const data = await loadYear(year);
    if (data && current.value?.setup.year === year) current.value = data;
    await refreshYears();
  });
}

export interface CloseResult {
  next: number;
  /** False when the next year already existed: only its carried-in streaks were updated. */
  created: boolean;
}

/**
 * Close the open year: make it read-only and start the next one with its habits and the streaks
 * running on December 31. Back up first (backUpYear). Opens the next year afterwards.
 */
export async function closeYear(): Promise<CloseResult> {
  const result = await inTurn(async () => {
    const data = editable();
    const next = nextYearFile(data);
    const existing = await loadYear(next.year);
    await putChange({ ...data.setup, closed: true });
    if (!existing) await replaceYear(next);
    else {
      const { streaksIn: _old, ...setup } = existing.setup;
      await putChange(next.streaksIn ? { ...setup, streaksIn: next.streaksIn } : setup);
    }
    return { next: next.year, created: !existing };
  });
  await openYear(result.next);
  return result;
}

/** Make a closed year editable again. */
export async function reopenYear(year: number): Promise<void> {
  await inTurn(async () => {
    const data = await loadYear(year);
    if (data) {
      const { closed: _c, ...setup } = data.setup;
      await putChange(setup);
    }
  });
  await openYear(year);
}

/** Delete one year and everything logged in it. If it was open, the newest remaining year opens. */
export async function removeYear(year: number): Promise<void> {
  await inTurn(() => deleteYear(year));
  const open = current.value?.setup.year;
  await openYear(open !== year ? open : undefined);
}

/** Erase everything stored. The app starts empty. */
export async function eraseEverything(): Promise<void> {
  await inTurn(async () => {
    await eraseAll();
    current.value = null;
    weekStart.value = 1;
  });
  await refreshYears();
}
