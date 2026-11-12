import { beforeEach, expect, it } from "vitest";
import { exportYear, importYear } from "../src/backup";
import { closeDb, eraseAll, loadYear } from "../src/db";
import { habitStreakAcross } from "../src/score";
import { chain, closeYear, current, removeHabit, saveHabit, setNote, setValue, today, openYear, readOnly } from "../src/state";
import { SetupError } from "../src/setup";
import { HABITS, yearFile } from "./helpers";

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
