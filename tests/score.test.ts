import { describe, expect, it } from "vitest";
import { closingStreaks, dayScore, habitStreak, level, monthStats, perfectStreak, trackedOf, yearStats } from "../src/score";
import { HABITS, yearFile } from "./helpers";
import type { DayLog } from "../src/types";

const all = (date: string): DayLog => ({ date, values: { h_med: true, h_sleep: 480, h_screen: 200 } });
const t = (days: DayLog[], extra = {}) => { const f = yearFile(days, extra); return trackedOf({ setup: f, days: f.days }); };

describe("day scores", () => {
  it("is the share of habits met", () => {
    const tr = t([{ date: "2026-03-01", values: { h_med: true, h_sleep: 400, h_screen: 300 } }]);
    expect(dayScore(tr, "2026-03-01")).toEqual({ met: 2, total: 3, score: (2 / 3) * 100 });
    expect(dayScore(tr, "2026-03-02")!.score).toBe(0);
  });

  it("counts a habit only from its first day", () => {
    const tr = t([{ date: "2026-03-01", values: { h_med: true } }], { habits: [HABITS[0]!, { ...HABITS[1]!, from: "2026-03-02" }] });
    expect(dayScore(tr, "2026-03-01")!.score).toBe(100);
    expect(dayScore(tr, "2026-03-02")!.total).toBe(2);
  });
});

describe("periods", () => {
  it("averages the days come, unlogged ones as 0", () => {
    const tr = t([all("2026-02-01"), all("2026-02-02")]);
    const feb = monthStats(tr, 2, "2026-02-04");
    expect(feb.days).toBe(4);
    expect(feb.score).toBe(50);
    expect(feb.perfect).toBe(2);
    expect(feb.habits[1]!.average).toBe(480);
  });

  it("starts at the start day", () => {
    const tr = t([all("2026-06-10")], { start: "2026-06-10" });
    expect(yearStats(tr, "2026-06-10")).toMatchObject({ days: 1, score: 100 });
  });

  it("has nothing before the year comes", () => {
    expect(yearStats(t([]), "2025-12-31").score).toBeNull();
  });
});

describe("streaks", () => {
  const days = [all("2026-01-01"), all("2026-01-02"), all("2026-01-04"), all("2026-01-05"), all("2026-01-06")];

  it("runs up to today, or yesterday while today isn't done", () => {
    expect(habitStreak(t(days), HABITS[0]!, "2026-01-06")).toEqual({ current: 3, best: 3, today: true });
    expect(habitStreak(t(days), HABITS[0]!, "2026-01-07")).toEqual({ current: 3, best: 3, today: false });
    expect(habitStreak(t(days), HABITS[0]!, "2026-01-08").current).toBe(0);
  });

  it("carries in last year's streak", () => {
    const tr = t(days, { streaksIn: { h_med: 10, perfect: 4 } });
    expect(habitStreak(tr, HABITS[0]!, "2026-01-03")).toMatchObject({ current: 12, best: 12 });
    expect(habitStreak(tr, HABITS[0]!, "2026-01-04")).toMatchObject({ current: 1, best: 12 });
    expect(perfectStreak(tr, "2026-01-02").current).toBe(6);
  });

  it("skips days the habit didn't count", () => {
    const h = { ...HABITS[0]!, to: "2026-01-02" };
    expect(habitStreak(t(days, { habits: [h] }), h, "2026-01-06").current).toBe(2);
  });

  it("hands the streaks running on December 31 to the next year", () => {
    const end: DayLog[] = [all("2026-12-30"), { date: "2026-12-31", values: { h_med: true } }];
    expect(closingStreaks(t(end))).toEqual({ h_med: 2 });
  });
});

it("shades the heatmap in quarters", () => {
  expect([null, 0, 10, 25, 26, 66.67, 99, 100].map(level)).toEqual([null, 0, 1, 1, 2, 3, 4, 5]);
});
