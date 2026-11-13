import { describe, expect, it } from "vitest";
import { bestAndHardest, closingStreaks, dayScore, habitStreak, habitStreakAcross, level, monthPassed, monthStats, perfectStreak, perfectStreakAcross, outOf100, points, trackedOf, weekdayStats, yearStats } from "../src/score";
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
    expect(closingStreaks([t(end)])).toEqual({ h_med: 2 });
  });
});

describe("streaks across years", () => {
  const y2025 = (days: DayLog[], extra = {}) => { const f = yearFile(days, { year: 2025, ...extra }); return trackedOf({ setup: f, days: f.days }); };
  const lastWeek2025 = ["2025-12-26", "2025-12-27", "2025-12-28", "2025-12-29", "2025-12-30", "2025-12-31"].map(all);
  const firstDays2026 = [all("2026-01-01"), all("2026-01-02")];

  it("carries on over New Year when last year is stored", () => {
    const s = habitStreakAcross([y2025(lastWeek2025), t(firstDays2026)], "h_med", "2026-01-02");
    expect(s).toEqual({ current: 8, best: 8, today: true });
  });

  it("keeps the best from an earlier year", () => {
    const long = Array.from({ length: 20 }, (_, i) => all(`2025-03-${String(i + 1).padStart(2, "0")}`));
    expect(habitStreakAcross([y2025(long), t(firstDays2026)], "h_med", "2026-01-02")).toMatchObject({ current: 2, best: 20 });
  });

  it("counts a stored year's own days over what was carried in", () => {
    const s = habitStreakAcross([y2025(lastWeek2025), t(firstDays2026, { streaksIn: { h_med: 99 } })], "h_med", "2026-01-02");
    expect(s.current).toBe(8);
  });

  it("starts from the carried streak when last year isn't stored", () => {
    expect(habitStreakAcross([t(firstDays2026, { streaksIn: { h_med: 6 } })], "h_med", "2026-01-02").current).toBe(8);
  });

  it("breaks over a missing year, a year without the habit, and a year begun partway", () => {
    const y2024 = (() => { const f = yearFile([all("2024-12-31")], { year: 2024 }); return trackedOf({ setup: f, days: f.days }); })();
    expect(habitStreakAcross([y2024, t(firstDays2026)], "h_med", "2026-01-02").current).toBe(2);
    const without = y2025(lastWeek2025.map((d) => ({ date: d.date, values: { h_sleep: 480 } })), { habits: HABITS.slice(1) });
    expect(habitStreakAcross([without, t(firstDays2026)], "h_med", "2026-01-02").current).toBe(2);
    expect(habitStreakAcross([y2025(lastWeek2025), t(firstDays2026)], "h_med", "2026-01-02").current).toBe(8);
    const late = t([all("2026-01-02")], { start: "2026-01-02" });
    expect(habitStreakAcross([y2025(lastWeek2025), late], "h_med", "2026-01-02").current).toBe(1);
  });

  it("doesn't run on into a year where the habit starts later", () => {
    const later = t(firstDays2026, { habits: [{ ...HABITS[0]!, from: "2026-01-02" }, ...HABITS.slice(1)], streaksIn: { h_med: 6 } });
    // The same with last year stored as without it: the run starts again.
    expect(habitStreakAcross([y2025(lastWeek2025), later], "h_med", "2026-01-02").current).toBe(1);
    expect(habitStreakAcross([later], "h_med", "2026-01-02").current).toBe(1);
  });

  it("runs the perfect-day streak over New Year too, and hands it on when closing", () => {
    const chain = [y2025(lastWeek2025), t(firstDays2026)];
    expect(perfectStreakAcross(chain, "2026-01-02").current).toBe(8);
    expect(closingStreaks([y2025(lastWeek2025)])).toEqual({ h_med: 6, h_sleep: 6, h_screen: 6, perfect: 6 });
  });
});

it("shades the heatmap in quarters", () => {
  expect([null, 0, 10, 25, 26, 66.67, 99, 100].map(level)).toEqual([null, 0, 1, 1, 2, 3, 4, 5]);
});

describe("formatting and comparing scores", () => {
  it("rounds to the whole point by default, as Notion does, or to the places asked for", () => {
    expect(points(69.6)).toBe("70");
    expect(points(69.64, 1)).toBe("69.6");
    expect(points(69.65, 1)).toBe("69.7");
    expect(points(70, 1)).toBe("70.0");
    expect(points(null, 1)).toBe("–");
  });

  it("finds the best and the hardest, skipping periods without a score", () => {
    const scores: Record<string, number | null> = { Jan: 70.2, Feb: null, Mar: 64.1, Apr: 73.4 };
    expect(bestAndHardest(Object.keys(scores), (k) => scores[k]!)).toEqual({ best: "Apr", hardest: "Mar" });
  });

  it("keeps the first of a tie, and says nothing with fewer than two scored", () => {
    expect(bestAndHardest([0, 1, 2], (i) => [50, 50, 40][i]!)).toEqual({ best: 0, hardest: 2 });
    expect(bestAndHardest([0, 1], (i) => [80, null][i]!)).toBeNull();
  });
});

describe("weekday stats", () => {
  // 2026-03-01 is a Sunday, so the 2nd and 9th are Mondays and the 3rd a Tuesday.
  const tr = t([
    { date: "2026-03-01", values: { h_sleep: 480 } },
    { date: "2026-03-02", values: { h_sleep: 400, h_screen: 300 } },
    { date: "2026-03-09", values: { h_sleep: 500, h_screen: 420 } },
  ]);
  const w = weekdayStats(tr, "2026-03-10");
  const sleep = (d: number) => w[d]!.habits[1]!;
  const screen = (d: number) => w[d]!.habits[2]!;

  it("averages a time habit over the values logged on each weekday", () => {
    expect(sleep(1)).toMatchObject({ logged: 2, total: 900, average: 450 });
    expect(screen(1)).toMatchObject({ logged: 2, average: 360 });
    expect(sleep(0)).toMatchObject({ logged: 1, average: 480 });
  });

  it("counts every Monday so far, and the goal met on those logged", () => {
    // January 5 to March 9: ten Mondays; sleep met (at least 7:30) only on the 9th.
    expect(sleep(1)).toMatchObject({ days: 10, met: 1 });
    expect(screen(1)!.met).toBe(1); // 5:00 is under the 6:00 limit; 7:00 isn't
  });

  it("has no average on a weekday with nothing logged", () => {
    expect(sleep(2)).toMatchObject({ logged: 0, average: null });
  });

  it("scores each weekday as the average of its days, and counts the days scored", () => {
    // The ten Mondays from January 5 all count, with all three habits: nothing met until March 2,
    // then 1 of 3 on the 2nd (screen under its limit) and 1 of 3 on the 9th (sleep over its goal).
    const mondays = w[1]!;
    expect(mondays.scored).toBe(10);
    expect(mondays.score).toBeCloseTo(((1 / 3) * 100 + (1 / 3) * 100) / 10, 10);
  });
});

describe("EoD review fixes", () => {
  it("names no best or hardest when every period scores the same", () => {
    expect(bestAndHardest([0, 1, 2], () => 100)).toBeNull();
    expect(bestAndHardest([0, 1, 2], (i) => [8, null, 8][i]!)).toBeNull();
  });

  it("formats a chart's score out of 100, and a missing one as a dash, never 0.0 or NaN", () => {
    expect(outOf100(64.25)).toBe("64.3 / 100");
    expect(outOf100(null)).toBe("–");
    expect(outOf100(undefined)).toBe("–");
    expect(outOf100("-")).toBe("–"); // ECharts' own placeholder for a missing value
  });
});

describe("monthPassed", () => {
  it("is the share of the month's days come, by the calendar", () => {
    expect(monthPassed(2026, 10, "2026-11-13")).toBe(100);
    expect(monthPassed(2026, 11, "2026-11-13")).toBeCloseTo((13 / 30) * 100);
    expect(monthPassed(2026, 12, "2026-11-13")).toBe(0);
    expect(monthPassed(2026, 11, "2026-11-30")).toBe(100);
    expect(monthPassed(2024, 2, "2024-02-29")).toBe(100);
    // A past year is over.
    expect(monthPassed(2025, 12, "2026-11-13")).toBe(100);
  });
});
