import { beforeEach, expect, it, vi } from "vitest";
import { exportYear, importYear } from "../src/backup";
import { closeDb, eraseAll, loadYear } from "../src/db";
import { habitStreakAcross } from "../src/score";
import { chain, closeYear, current, removeHabit, saveHabit, setNote, setValue, today, openYear, readOnly } from "../src/state";
import { SetupError } from "../src/setup";
import { HABITS, yearFile } from "./helpers";

// A save can be made slow, to see what happens when something else finishes first.
const slow = vi.hoisted(() => ({ on: false }));
vi.mock("../src/db", async (load) => {
  const db = await load<typeof import("../src/db")>();
  return {
    ...db,
    putChange: async (...args: Parameters<typeof db.putChange>) => {
      if (slow.on) await new Promise((r) => setTimeout(r, 100));
      return db.putChange(...args);
    },
  };
});

beforeEach(async () => {
  await eraseAll();
  await closeDb();
  today.value = "2026-12-31";
});

it("logs a day, and a day left empty is removed", async () => {
  await importYear(yearFile([]));
  await openYear(2026);
  await setValue("2026-03-01", "h_med", true);
  await setValue("2026-03-01", "h_sleep", 420);
  expect((await loadYear(2026))!.days).toEqual([{ date: "2026-03-01", values: { h_med: true, h_sleep: 420 } }]);
  await setValue("2026-03-01", "h_med", null);
  await setValue("2026-03-01", "h_sleep", null);
  await setNote("2026-03-01", "  ");
  expect((await loadYear(2026))!.days).toEqual([]);
  expect(current.value!.setup.lastChangedAt).toBeDefined();
});

it("keeps every one of several quick changes, made before the first is saved", async () => {
  await importYear(yearFile([]));
  await openYear(2026);
  // Slow saves, so the changes overlap: run all at once, each would read the same old year and the last would win.
  slow.on = true;
  await Promise.all([
    setValue("2026-03-01", "h_med", true),
    setValue("2026-03-01", "h_sleep", 480),
    setNote("2026-03-01", "Long walk"),
    setValue("2026-03-02", "h_med", true),
    saveHabit({ id: "h_water", name: "Water", emoji: "💧", kind: "number", unit: "glasses", goal: { op: "atLeast", value: 8 } }),
  ]);
  slow.on = false;
  const expected = [
    { date: "2026-03-01", values: { h_med: true, h_sleep: 480 }, note: "Long walk" },
    { date: "2026-03-02", values: { h_med: true } },
  ];
  for (const data of [current.value!, (await loadYear(2026))!]) {
    expect(data.days).toEqual(expected);
    expect(data.setup.habits.map((h) => h.id)).toEqual(["h_med", "h_sleep", "h_screen", "h_water"]);
  }
});

it("won't log a day that hasn't come", async () => {
  today.value = "2026-03-01";
  await importYear(yearFile([]));
  await openYear(2026);
  await expect(setValue("2026-03-02", "h_med", true)).rejects.toThrow("hasn't come");
});

it("refuses to change a logged habit's kind, and deletes a habit's values with it", async () => {
  await importYear(yearFile([{ date: "2026-01-01", values: { h_med: true } }, { date: "2026-01-02", values: { h_med: true, h_sleep: 400 } }]));
  await openYear(2026);
  await expect(saveHabit({ ...HABITS[0]!, kind: "number" })).rejects.toBeInstanceOf(SetupError);
  await removeHabit("h_med");
  expect((await loadYear(2026))!.days).toEqual([{ date: "2026-01-02", values: { h_sleep: 400 } }]);
});

it("counts streaks through earlier stored years, closed or not", async () => {
  await importYear(yearFile([{ date: "2025-12-30", values: { h_med: true } }, { date: "2025-12-31", values: { h_med: true } }], { year: 2025 }));
  await importYear(yearFile([{ date: "2026-01-01", values: { h_med: true } }]));
  today.value = "2026-01-01";
  await openYear(2026);
  expect(chain.value.map((t) => t.year)).toEqual([2025, 2026]);
  expect(habitStreakAcross(chain.value, "h_med", today.value).current).toBe(3);
});

it("doesn't put back a year switched away from while a save was on its way", async () => {
  await importYear(yearFile([], { year: 2025 }));
  await importYear(yearFile([]));
  await openYear(2026);
  slow.on = true;
  const saving = setValue("2026-03-01", "h_med", true);
  await openYear(2025);
  await saving;
  slow.on = false;
  expect(current.value!.setup.year).toBe(2025);
  expect((await loadYear(2026))!.days).toEqual([{ date: "2026-03-01", values: { h_med: true } }]);
});

it("closes a year into the next with its habits and running streaks", async () => {
  await importYear(yearFile([
    { date: "2026-12-30", values: { h_med: true } },
    { date: "2026-12-31", values: { h_med: true } },
  ], { habits: [...HABITS, { id: "h_old", name: "Old", emoji: "", kind: "check", to: "2026-06-30" }] }));
  await openYear(2026);
  const r = await closeYear();
  expect(r).toEqual({ next: 2027, created: true });
  expect(current.value!.setup.habits.map((h) => h.id)).toEqual(["h_med", "h_sleep", "h_screen"]);
  expect(current.value!.setup.streaksIn).toEqual({ h_med: 2 });
  await openYear(2026);
  expect(readOnly.value).toBe(true);
  const file = await exportYear(2026);
  expect(file!.closed).toBe(true);
});
