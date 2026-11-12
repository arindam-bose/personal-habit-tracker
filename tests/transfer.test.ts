// A backup moves a year between devices: exported on one, imported on a clean one, it must come
// back exactly as it was. This uses every optional field a year file can hold, so a field added
// later and forgotten in export or import fails here.

import { beforeEach, expect, it } from "vitest";
import { exportYear, importYear } from "../src/backup";
import { closeDb, eraseAll, getSetting, loadYear, setSetting } from "../src/db";
import { current, openYear, readOnly } from "../src/state";
import type { YearFile } from "../src/types";
import { HABITS, yearFile } from "./helpers";

/** A clean device: nothing stored. */
async function cleanDevice(): Promise<void> {
  await eraseAll();
  await closeDb();
}

/**
 * A year with every optional field set: a late start, a closed year, carried-in streaks, a habit
 * added and one stopped partway, a unit, notes, and a setting. Typed Required, so a field added to
 * YearFile later must be added here too.
 */
function everything(): Required<YearFile> {
  return {
    ...yearFile([
      { date: "2026-02-01", values: { h_med: true, h_sleep: 465, h_screen: 300, h_old: true }, note: "First day" },
      { date: "2026-02-02", values: { h_sleep: 420 } },
      { date: "2026-07-04", values: { h_med: true, h_water: 8.5 }, note: "Hot day" },
    ], {
      habits: [
        ...HABITS,
        { id: "h_water", name: "Water", emoji: "💧", kind: "number", unit: "glasses", goal: { op: "atLeast", value: 8 }, from: "2026-07-01" },
        { id: "h_old", name: "Old", emoji: "", kind: "check", to: "2026-06-30" },
      ],
    }),
    start: "2026-02-01",
    lastChangedAt: "2026-11-10T21:05:09.000Z",
    setupChangedAt: "2026-11-09T08:30:00.000Z",
    closed: true,
    streaksIn: { h_med: 4, perfect: 1 },
    settings: { weekStart: 0 },
  };
}

beforeEach(cleanDevice);

it("moves a year to a clean device and back, unchanged", async () => {
  const file = everything();
  const at = new Date(file.exportedAt);
  expect((await importYear(file)).ok).toBe(true);
  const first = await exportYear(2026, at);
  expect(first).toEqual(file);

  await cleanDevice();
  expect((await importYear(JSON.parse(JSON.stringify(first)))).ok).toBe(true);
  const second = await exportYear(2026, at);
  // Byte for byte, so two backups of one year diff cleanly.
  expect(JSON.stringify(second)).toBe(JSON.stringify(first));

  // It comes back closed, counted as backed up when it was exported, with its setting.
  await openYear(2026);
  expect(readOnly.value).toBe(true);
  expect(current.value!.setup.lastBackupAt).toBe(file.exportedAt);
  expect(await getSetting("weekStart")).toBe(0);
});

it("doesn't let a backup's settings undo the ones a device already has", async () => {
  await setSetting("weekStart", 1);
  await importYear(everything());
  expect(await getSetting("weekStart")).toBe(1);
  expect((await exportYear(2026))!.settings).toEqual({ weekStart: 1 });
});

it("replaces the year it imports over, leaving no day of the old one behind", async () => {
  await importYear(yearFile([{ date: "2026-01-10", values: { h_med: true } }]));
  await importYear(everything());
  expect((await loadYear(2026))!.days.map((d) => d.date)).toEqual(["2026-02-01", "2026-02-02", "2026-07-04"]);
});
