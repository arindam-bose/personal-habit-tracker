// Importing from the top bar, Settings or a dropped file all go through importFiles: a file is
// checked before anything is stored, and a stored year is replaced only when the answer is yes.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, eraseAll, loadYear } from "../src/db";
import { importFiles, type AskReplace } from "../src/importing";
import { current, openYear, years } from "../src/state";
import type { YearFile } from "../src/types";
import { yearFile } from "./helpers";

const fileOf = (name: string, data: unknown) => new File([typeof data === "string" ? data : JSON.stringify(data)], name, { type: "application/json" });
const year = (y: number, days: number): YearFile =>
  yearFile(Array.from({ length: days }, (_, i) => ({ date: `${y}-01-${String(i + 1).padStart(2, "0")}`, values: { h_med: true } })), { year: y });
const never: AskReplace = async () => {
  throw new Error("asked when nothing was stored");
};

beforeEach(async () => {
  await eraseAll();
  await closeDb();
  await openYear();
});

describe("importFiles", () => {
  it("imports a new year and opens it", async () => {
    const out = await importFiles([fileOf("habit-tracker-2026.json", year(2026, 3))], never);
    expect(out).toEqual({ imported: [{ year: 2026, days: 3 }], errors: [] });
    expect(current.value?.setup.year).toBe(2026);
    expect(years.value.map((y) => y.setup.year)).toEqual([2026]);
  });

  it("asks before replacing a stored year, and keeps it on no", async () => {
    await importFiles([fileOf("old.json", year(2026, 3))], never);
    const ask = vi.fn<AskReplace>(async () => false);
    const out = await importFiles([fileOf("new.json", year(2026, 5))], ask);
    expect(ask).toHaveBeenCalledOnce();
    expect(ask.mock.calls[0]![0]).toBe("new.json");
    expect(ask.mock.calls[0]![1].days).toBe(3);
    expect(ask.mock.calls[0]![2].days).toHaveLength(5);
    expect(out).toEqual({ imported: [], errors: [] });
    expect((await loadYear(2026))!.days).toHaveLength(3);
  });

  it("replaces a stored year on yes", async () => {
    await importFiles([fileOf("old.json", year(2026, 3))], never);
    const out = await importFiles([fileOf("new.json", year(2026, 5))], async () => true);
    expect(out.imported).toEqual([{ year: 2026, days: 5 }]);
    expect((await loadYear(2026))!.days).toHaveLength(5);
  });

  it("stores nothing from a file that isn't JSON, or isn't a year, and says which file", async () => {
    const out = await importFiles([fileOf("notes.txt", "not json"), fileOf("other.json", { app: "money-tracker" })], never);
    expect(out.imported).toEqual([]);
    expect(out.errors[0]).toBe('"notes.txt" is not a valid JSON file.');
    expect(out.errors[1]).toBe("other.json:");
    expect(out.errors.length).toBeGreaterThan(2);
    expect(years.value).toEqual([]);
  });

  it("imports several files at once, goes on past a bad one, and opens the last year imported", async () => {
    const out = await importFiles([fileOf("a.json", year(2025, 2)), fileOf("bad.json", "{"), fileOf("b.json", year(2026, 4))], never);
    expect(out.imported).toEqual([{ year: 2025, days: 2 }, { year: 2026, days: 4 }]);
    expect(out.errors).toEqual(['"bad.json" is not a valid JSON file.']);
    expect(current.value?.setup.year).toBe(2026);
  });

  it("asks about a year an earlier file in the same import added", async () => {
    const ask = vi.fn<AskReplace>(async () => false);
    const out = await importFiles([fileOf("first.json", year(2026, 2)), fileOf("second.json", year(2026, 6))], ask);
    expect(ask).toHaveBeenCalledOnce();
    expect(out.imported).toEqual([{ year: 2026, days: 2 }]);
    expect((await loadYear(2026))!.days).toHaveLength(2);
  });
});
