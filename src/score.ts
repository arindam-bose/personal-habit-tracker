// Scores, streaks and reports, all worked out from the habits and the day logs.
//
// A day's score is the share of the habits counting that day which were met, out of 100: six of
// nine is 66.67. A day with nothing logged scores 0, once it has come. A month's or a year's score
// is the average of its days' scores, from the day tracking starts up to today. A perfect day
// meets every habit. These are the Notion tracker's own rules, so imported years score the same.

import { activeOn, isActive, metOn } from "./habits";
import { addDays, dateRange, daysInMonth, weekday } from "./dates";
import type { DayLog, Habit, IsoDate, YearSetup } from "./types";

/** A year as the calculations take it: its setup and its days by date. */
export interface Tracked {
  year: number;
  start?: IsoDate;
  habits: Habit[];
  days: Map<IsoDate, DayLog>;
  streaksIn?: Record<string, number>;
}

export function trackedOf(data: { setup: Pick<YearSetup, "year" | "start" | "habits" | "streaksIn">; days: DayLog[] }): Tracked {
  const { year, start, habits, streaksIn } = data.setup;
  return { year, start, habits, streaksIn, days: new Map(data.days.map((d) => [d.date, d])) };
}

/** The first day tracked: the start day, or January 1. */
export function firstDay(t: Pick<Tracked, "year" | "start">): IsoDate {
  return t.start ?? `${t.year}-01-01`;
}

/** The last day that has come: today, or December 31 for a past year. Null for a year not begun yet. */
export function lastDay(t: Pick<Tracked, "year" | "start">, today: IsoDate): IsoDate | null {
  const end = `${t.year}-12-31`;
  const last = today < end ? today : end;
  return last < firstDay(t) ? null : last;
}

/** The days that count between two dates (both included): only those tracked and come. */
export function countedDays(t: Pick<Tracked, "year" | "start">, today: IsoDate, from?: IsoDate, to?: IsoDate): IsoDate[] {
  const last = lastDay(t, today);
  if (last === null) return [];
  const a = from && from > firstDay(t) ? from : firstDay(t);
  const b = to && to < last ? to : last;
  return dateRange(a, b);
}

export interface DayScore {
  met: number;
  total: number;
  /** 0 to 100. */
  score: number;
}

/** How a day did, or null when no habit counts that day. */
export function dayScore(t: Pick<Tracked, "habits" | "days">, date: IsoDate): DayScore | null {
  const habits = activeOn(t.habits, date);
  if (!habits.length) return null;
  const day = t.days.get(date);
  const met = habits.filter((h) => metOn(h, day)).length;
  return { met, total: habits.length, score: (met / habits.length) * 100 };
}

export function isPerfect(s: DayScore | null): boolean {
  return s !== null && s.met === s.total;
}

export interface HabitStats {
  habit: Habit;
  /** Days the habit counted. */
  days: number;
  /** Days it was met. */
  met: number;
  /** met / days, 0 to 100; null when it didn't count on any day. */
  rate: number | null;
  /** Duration and number habits: days with a value logged, their sum and average. */
  logged: number;
  total: number;
  average: number | null;
}

export interface PeriodStats {
  /** Days come in the period. */
  days: number;
  /** The average day score, 0 to 100; null with no scored day. */
  score: number | null;
  perfect: number;
  habits: HabitStats[];
}

/** How the days from `from` to `to` (both included, only those come) went. */
export function periodStats(t: Tracked, today: IsoDate, from?: IsoDate, to?: IsoDate): PeriodStats {
  const dates = countedDays(t, today, from, to);
  let sum = 0;
  let scored = 0;
  let perfect = 0;
  const habits: HabitStats[] = t.habits.map((habit) => ({ habit, days: 0, met: 0, rate: null, logged: 0, total: 0, average: null }));
  for (const date of dates) {
    const s = dayScore(t, date);
    if (s) {
      sum += s.score;
      scored++;
      if (isPerfect(s)) perfect++;
    }
    const day = t.days.get(date);
    for (const h of habits) {
      if (!isActive(h.habit, date)) continue;
      h.days++;
      if (metOn(h.habit, day)) h.met++;
      const v = day?.values[h.habit.id];
      if (typeof v === "number") {
        h.logged++;
        h.total += v;
      }
    }
  }
  for (const h of habits) {
    h.rate = h.days ? (h.met / h.days) * 100 : null;
    h.average = h.logged ? h.total / h.logged : null;
  }
  return { days: dates.length, score: scored ? sum / scored : null, perfect, habits };
}

export function monthStats(t: Tracked, month: number, today: IsoDate): PeriodStats {
  const mm = String(month).padStart(2, "0");
  return periodStats(t, today, `${t.year}-${mm}-01`, `${t.year}-${mm}-${daysInMonth(t.year, month)}`);
}

export function yearStats(t: Tracked, today: IsoDate): PeriodStats {
  return periodStats(t, today);
}

export interface Streak {
  /** Days in a row up to today, or up to yesterday while today isn't met yet. */
  current: number;
  /** The longest run this year, counting one carried in from last year. */
  best: number;
  /** Whether today is already met. */
  today: boolean;
}

/**
 * Days in a row a test was passed, over the days the test applies to (others are skipped: they
 * neither add to a run nor break it). `carried` is a run brought in from the year before.
 */
function runOf(dates: IsoDate[], applies: (d: IsoDate) => boolean, passed: (d: IsoDate) => boolean, carried: number, today: IsoDate): Streak {
  let run = carried;
  let best = carried;
  let beforeToday = carried;
  let todayPassed = false;
  for (const d of dates) {
    if (!applies(d)) continue;
    if (d === today) beforeToday = run;
    if (passed(d)) {
      run++;
      if (d === today) todayPassed = true;
    } else run = 0;
    if (run > best) best = run;
  }
  const lastIsToday = dates.length > 0 && dates[dates.length - 1] === today && applies(today);
  // Today isn't over: not done yet doesn't end the run.
  const current = lastIsToday && !todayPassed ? beforeToday : run;
  return { current, best, today: todayPassed };
}

/** A habit's streak: days in a row it was met. */
export function habitStreak(t: Tracked, habit: Habit, today: IsoDate): Streak {
  const dates = countedDays(t, today);
  // A carried streak goes on only if the habit counts from the year's first day.
  const carried = habit.from === undefined || habit.from <= firstDay(t) ? t.streaksIn?.[habit.id] ?? 0 : 0;
  return runOf(dates, (d) => isActive(habit, d), (d) => metOn(habit, t.days.get(d)), carried, today);
}

/** The perfect-day streak: days in a row every habit was met. */
export function perfectStreak(t: Tracked, today: IsoDate): Streak {
  const dates = countedDays(t, today);
  return runOf(dates, (d) => activeOn(t.habits, d).length > 0, (d) => isPerfect(dayScore(t, d)), t.streaksIn?.perfect ?? 0, today);
}

/** The streaks running at the end of December 31, to carry into the next year. */
export function closingStreaks(t: Tracked): Record<string, number> {
  const end = `${t.year}-12-31`;
  // Seen from the next day: December 31 is over, so not met then ends a streak.
  const after = `${t.year + 1}-01-01`;
  const out: Record<string, number> = {};
  for (const h of t.habits) {
    if (h.to !== undefined && h.to < end) continue;
    const s = habitStreak(t, h, after);
    if (s.current) out[h.id] = s.current;
  }
  const p = perfectStreak(t, after);
  if (p.current) out.perfect = p.current;
  return out;
}

/** The average day score for each weekday (0 Sunday to 6 Saturday), and how many days each averages. */
export function weekdayScores(t: Tracked, today: IsoDate): { score: number | null; days: number }[] {
  const sums = Array.from({ length: 7 }, () => ({ sum: 0, days: 0 }));
  for (const date of countedDays(t, today)) {
    const s = dayScore(t, date);
    if (!s) continue;
    const w = sums[weekday(date)]!;
    w.sum += s.score;
    w.days++;
  }
  return sums.map((w) => ({ score: w.days ? w.sum / w.days : null, days: w.days }));
}

/** Every day come, with its score (null when no habit counted). */
export function dailyScores(t: Tracked, today: IsoDate): { date: IsoDate; score: number | null }[] {
  return countedDays(t, today).map((date) => ({ date, score: dayScore(t, date)?.score ?? null }));
}

/** The average of the scores in the `n` days up to each day, for a smoothed line. */
export function rollingAverage(scores: (number | null)[], n: number): (number | null)[] {
  return scores.map((_, i) => {
    const window = scores.slice(Math.max(0, i - n + 1), i + 1).filter((s): s is number => s !== null);
    return window.length ? window.reduce((a, b) => a + b, 0) / window.length : null;
  });
}

/**
 * The heatmap's shade for a score: 0 for nothing met, 1 to 4 in quarters, 5 for a perfect day.
 * Null for no score.
 */
export function level(score: number | null): number | null {
  if (score === null) return null;
  if (score >= 100) return 5;
  if (score <= 0) return 0;
  return Math.min(4, Math.ceil(score / 25));
}

/** A score as people read it: "66.67%". */
export function percent(score: number | null, digits = 2): string {
  return score === null ? "–" : `${score.toFixed(digits).replace(/\.?0+$/, "")}%`;
}

/** The score out of 100, rounded: Notion's "Monthly score: 70". */
export function points(score: number | null): string {
  return score === null ? "–" : String(Math.round(score));
}

/** The day after the last day in a log: where to pick up when catching up. */
export function nextUnlogged(t: Tracked, today: IsoDate): IsoDate | null {
  for (const d of countedDays(t, today)) if (!t.days.has(d)) return d;
  return null;
}

/** Yesterday, for "carry on from yesterday" checks. */
export const yesterday = (today: IsoDate) => addDays(today, -1);
