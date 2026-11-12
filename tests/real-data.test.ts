// The Notion export, run through tools/notion_import.py, must score exactly as Notion did: each
// month's score and each habit's share of days, against Notion's own monthly and yearly summaries.
// Skipped when data/ (the owner's own export, not in the repository) isn't there.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MONTHS } from "../src/dates";
import { monthStats, trackedOf, yearStats } from "../src/score";
import type { YearFile } from "../src/types";
import { validateYearFile } from "../src/validate";

const ROOT = join(import.meta.dirname, "..");
/** The day the export was taken: Notion counted the days up to it. */
const EXPORTED = "2026-11-11";

function csvRows(path: string): Record<string, string>[] {
  // Small, well-formed files: a quoted-field parser is enough.
  const text = readFileSync(path, "utf-8").replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head!.map((h, i) => [h, r[i] ?? ""])));
}

const pct = (s: string | undefined) => (s ? Number(s.replace("%", "")) : NaN);

for (const year of [2025, 2026]) {
  const dir = join(ROOT, "data/notion", String(year));
  describe.skipIf(!existsSync(dir))(`Notion ${year}`, () => {
    const out = join(mkdtempSync(join(tmpdir(), "habits-")), `${year}.json`);
    execFileSync("python3", ["-I", join(ROOT, "tools/notion_import.py"), dir, String(year), out]);
    const file = JSON.parse(readFileSync(out, "utf-8")) as YearFile;
    const t = trackedOf({ setup: file, days: file.days });
    const monthly = csvRows(globSync(join(dir, "**/*Monthly*[0-9a-f].csv"))[0]!);

    it("is a valid year file", () => {
      expect(validateYearFile(file).ok).toBe(true);
    });

    it("scores every month as Notion did", () => {
      for (const row of monthly) {
        const month = MONTHS.indexOf(row.Month!) + 1;
        const notion = pct(row["📈 Monthly Progress"]);
        if (Number.isNaN(notion)) continue;
        const stats = monthStats(t, month, EXPORTED);
        expect(stats.score!, row.Month).toBeCloseTo(notion, 1);
        // Each check habit's share of days, by its column (e.g. "🧘 Meditation").
        // Notion's monthly summary names one differently: "⏰ Wake up at 7".
        for (const h of stats.habits.filter((x) => x.habit.kind === "check")) {
          const col = Object.keys(row).find((k) => k.includes(h.habit.name) || (h.habit.id === "h_wake-up-early" && k.includes("Wake up")));
          expect(col, h.habit.name).toBeDefined();
          expect(h.rate!, `${row.Month} ${h.habit.name}`).toBeCloseTo(pct(row[col!]), 1);
        }
      }
    });

    it("scores the year as Notion did", () => {
      const yearly = globSync(join(dir, "**/*Yearly*[0-9a-f].csv")).map(csvRows)[0]?.[0];
      const notion = pct(yearly?.["📈 Yearly Progress"]);
      if (Number.isNaN(notion)) return; // 2025's yearly export is empty
      expect(yearStats(t, EXPORTED).score!).toBeCloseTo(notion, 1);
    });
  });
}
