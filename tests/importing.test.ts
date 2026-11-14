// Importing from the top bar, Settings or a dropped file all go through importFile: the file is
// checked before anything is asked or stored, and a stored year is replaced only on a yes.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, eraseAll, loadYear } from "../src/db";
import { importFile, type AskReplace } from "../src/importing";
import { current, openYear, setValue, years } from "../src/state";
import type { YearFile } from "../src/types";
import { yearFile } from "./helpers";

// A change can arrive while an import is storing its year: `inGap` runs the moment it is stored.
const gap = vi.hoisted(() => ({ inGap: null as null | (() => void) }));
vi.mock("../src/backup", async (load) => {
  const backup = await load<typeof import("../src/backup")>();
  return {
    ...backup,
    importYear: async (data: unknown) => {
      const r = await backup.importYear(data);
      gap.inGap?.();
      return r;
    },
  };
});

const fileOf = (name: string, data: unknown) => new File([typeof data === "string" ? data : JSON.stringify(data)], name, { type: "application/json" });
const year = (y: number, days: number): YearFile =>
  yearFile(Array.from({ length: days }, (_, i) => ({ date: `${y}-01-${String(i + 1).padStart(2, "0")}`, values: { h_med: true } })), { year: y });
const never: AskReplace = async () => {
  throw new Error("asked when nothing was stored");
};

beforeEach(async () => {
  gap.inGap = null;
  await eraseAll();
  await closeDb();
  await openYear();
});

describe("importFile", () => {
  it("imports a new year and opens it", async () => {
    const out = await importFile(fileOf("habit-tracker-2026.json", year(2026, 3)), never);
    expect(out).toEqual({ kind: "imported", fileName: "habit-tracker-2026.json", year: 2026, days: 3 });
    expect(current.value?.setup.year).toBe(2026);
    expect(years.value.map((y) => y.setup.year)).toEqual([2026]);
  });

  it("asks before replacing a stored year, with today's counts, and keeps it on no", async () => {
    await importFile(fileOf("old.json", year(2026, 3)), never);
    const ask = vi.fn<AskReplace>(async () => false);
    const out = await importFile(fileOf("new.json", year(2026, 5)), ask);
    expect(ask).toHaveBeenCalledOnce();
    const [name, stored, file] = ask.mock.calls[0]!;
    expect(name).toBe("new.json");
    expect(stored.days).toBe(3);
    expect(file.days).toHaveLength(5);
    expect(out).toEqual({ kind: "kept", fileName: "new.json", year: 2026 });
    expect((await loadYear(2026))!.days).toHaveLength(3);
  });

  it("replaces a stored year on yes", async () => {
    await importFile(fileOf("old.json", year(2026, 3)), never);
    const out = await importFile(fileOf("new.json", year(2026, 5)), async () => true);
    expect(out).toMatchObject({ kind: "imported", days: 5 });
    expect((await loadYear(2026))!.days).toHaveLength(5);
  });

  it("stores nothing from a file that isn't JSON, or isn't a year, and never asks", async () => {
    const notJson = await importFile(fileOf("notes.txt", "not json"), never);
    expect(notJson).toEqual({ kind: "failed", fileName: "notes.txt", errors: ['"notes.txt" is not a valid JSON file.'] });
    const other = await importFile(fileOf("money.json", { app: "money-tracker" }), never);
    expect(other.kind).toBe("failed");
    expect(other.kind === "failed" && other.errors.length).toBeGreaterThan(0);
    expect(years.value).toEqual([]);
  });
});

describe("a change made while a year is being imported", () => {
  it("waits for the imported year, and never writes the one it replaced back over it", async () => {
    // The tracker has 2026 with an extra habit; the backup has 2026 without it.
    const old = year(2026, 3);
    old.habits = [...old.habits, { id: "h_old", name: "Old habit", emoji: "", kind: "check" }];
    await importFile(fileOf("old.json", old), never);
    // A tick lands just as the backup's year is stored, before it is open.
    let tick: Promise<void> | undefined;
    gap.inGap = () => (tick = setValue("2026-01-05", "h_med", true));
    await importFile(fileOf("new.json", year(2026, 3)), async () => true);
    await tick;
    const stored = (await loadYear(2026))!;
    expect(stored.setup.habits.map((h) => h.id)).not.toContain("h_old");
    expect(current.value!.setup.habits.map((h) => h.id)).not.toContain("h_old");
    // The tick still counts, on the imported year.
    expect(stored.days.find((d) => d.date === "2026-01-05")?.values.h_med).toBe(true);
  });
});
