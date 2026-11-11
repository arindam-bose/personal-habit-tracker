import { expect, it } from "vitest";
import { validateYearFile } from "../src/validate";
import { yearFile } from "./helpers";

it("accepts a good file and sorts its days", () => {
  const r = validateYearFile(yearFile([{ date: "2026-02-02", values: { h_med: true } }, { date: "2026-01-02", values: { h_sleep: 400 } }]));
  expect(r.ok && r.file.days.map((d) => d.date)).toEqual(["2026-01-02", "2026-02-02"]);
});

it("lists every problem", () => {
  const r = validateYearFile(yearFile([
    { date: "2025-12-31", values: {} },
    { date: "2026-01-02", values: { h_med: 3, h_nope: true } as never },
    { date: "2026-01-03", values: { h_sleep: 2000 } },
  ]));
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors).toHaveLength(4);
});

it("knows a Money Tracker file", () => {
  const r = validateYearFile({ app: "money-tracker" });
  expect(!r.ok && r.errors[0]).toContain("Money Tracker");
});
