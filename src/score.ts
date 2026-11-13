// Scores, streaks and reports, all worked out from the habits and the day logs.
//
// A day's score is the share of the habits counting that day which were met, out of 100: six of
// nine is 66.67. A day with nothing logged scores 0, once it has come. A month's or a year's score
// is the average of its days' scores, from the day tracking starts up to today. A perfect day
// meets every habit. These are the Notion tracker's own rules, so imported years score the same.

import { activeOn, isActive, metOn } from "./habits";
import { dateRange, daysInMonth, weekday } from "./dates";
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
  /** Days with a score: those with a habit counting. */
  scored: number;
  perfect: number;
  habits: HabitStats[];
}

/** How the days from `from` to `to` (both included, only those come) went. */
export function periodStats(t: Tracked, today: IsoDate, from?: IsoDate, to?: IsoDate): PeriodStats {
  return statsOf(t, countedDays(t, today, from, to));
}

/** How some days went: a period's, or every Monday's. */
function statsOf(t: Tracked, dates: IsoDate[]): PeriodStats {
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
  return { days: dates.length, score: scored ? sum / scored : null, scored, perfect, habits };
}

export function monthStats(t: Tracked, month: number, today: IsoDate): PeriodStats {
  const mm = String(month).padStart(2, "0");
  return periodStats(t, today, `${t.year}-${mm}-01`, `${t.year}-${mm}-${daysInMonth(t.year, month)}`);
}

/**
 * How much of a month has gone by, 0 to 100: all of it once it's over, today's share of it now, and
 * none before it starts. The calendar's, not the tracking's: Notion's "Days Already Passed".
 */
export function monthPassed(year: number, month: number, today: IsoDate): number {
  const mm = String(month).padStart(2, "0");
  const first = `${year}-${mm}-01`;
  const days = daysInMonth(year, month);
  if (today < first) return 0;
  if (today > `${year}-${mm}-${days}`) return 100;
  return (Number(today.slice(8, 10)) / days) * 100;
}

export function yearStats(t: Tracked, today: IsoDate): PeriodStats {
  return periodStats(t, today);
}

export interface Streak {
  /** Days in a row up to today, or up to yesterday while today isn't met yet. */
  current: number;
  /** The longest run, counting one carried in from an earlier year. */
  best: number;
  /** Whether today is already met. */
  today: boolean;
}

/**
 * What a streak counts in one year: the days it applies to, whether each was a success, and whether
 * a run can come in from the year before (the habit counts from the year's first day). Null: it
 * doesn't exist that year.
 */
type StreakTest = { applies: (d: IsoDate) => boolean; passed: (d: IsoDate) => boolean; carries: boolean; carried: number } | null;

/**
 * Days in a row a test was passed, through a run of years, oldest first. Days the test doesn't
 * apply to are skipped: they neither add to a run nor break it. A run goes on from December 31 into
 * January 1 only when both years are here, the later one is tracked from January 1, and the test
 * exists in both. Otherwise a year starts from its carried-in streak (kept when the year before was
 * closed), or from 0.
 */
function chainRun(chain: Tracked[], today: IsoDate, testOf: (t: Tracked) => StreakTest): Streak {
  let run = 0;
  let best = 0;
  let current = 0;
  let todayPassed = false;
  chain.forEach((t, i) => {
    const test = testOf(t);
    const prev = chain[i - 1];
    if (!test) {
      run = current = 0;
      return;
    }
    const joined = test.carries && prev !== undefined && prev.year === t.year - 1 && firstDay(t) === `${t.year}-01-01` && testOf(prev) !== null;
    if (!joined) run = test.carries ? test.carried : 0;
    if (run > best) best = run;
    let beforeToday = run;
    const dates = countedDays(t, today);
    for (const d of dates) {
      if (!test.applies(d)) continue;
      if (d === today) beforeToday = run;
      if (test.passed(d)) {
        run++;
        if (d === today) todayPassed = true;
      } else run = 0;
      if (run > best) best = run;
    }
    const lastIsToday = dates.length > 0 && dates[dates.length - 1] === today && test.applies(today);
    // Today isn't over: not done yet doesn't end the run.
    current = lastIsToday && !todayPassed ? beforeToday : run;
  });
  return { current, best, today: todayPassed };
}

function habitTest(id: string): (t: Tracked) => StreakTest {
  return (t) => {
    const habit = t.habits.find((h) => h.id === id);
    if (!habit) return null;
    // A streak goes on from the year before only if the habit counts from the year's first day.
    const carries = habit.from === undefined || habit.from <= firstDay(t);
    return { applies: (d) => isActive(habit, d), passed: (d) => metOn(habit, t.days.get(d)), carries, carried: t.streaksIn?.[id] ?? 0 };
  };
}

function perfectTest(t: Tracked): StreakTest {
  return { applies: (d) => activeOn(t.habits, d).length > 0, passed: (d) => isPerfect(dayScore(t, d)), carries: true, carried: t.streaksIn?.perfect ?? 0 };
}

/** A habit's streak in one year: days in a row it was met. */
export function habitStreak(t: Tracked, habit: Habit, today: IsoDate): Streak {
  return chainRun([t], today, habitTest(habit.id));
}

/** The perfect-day streak in one year: days in a row every habit was met. */
export function perfectStreak(t: Tracked, today: IsoDate): Streak {
  return chainRun([t], today, perfectTest);
}

/**
 * A habit's streak through every stored year up to the last in `chain` (oldest first): a run
 * carries on over New Year, and the best is the longest in any of them.
 */
export function habitStreakAcross(chain: Tracked[], id: string, today: IsoDate): Streak {
  return chainRun(chain, today, habitTest(id));
}

/** The perfect-day streak through every stored year up to the last in `chain` (oldest first). */
export function perfectStreakAcross(chain: Tracked[], today: IsoDate): Streak {
  return chainRun(chain, today, perfectTest);
}

/** The streaks running at the end of December 31 of the last year in `chain`, to carry into the next year. */
export function closingStreaks(chain: Tracked[]): Record<string, number> {
  const t = chain[chain.length - 1]!;
  const end = `${t.year}-12-31`;
  // Seen from the next day: December 31 is over, so not met then ends a streak.
  const after = `${t.year + 1}-01-01`;
  const out: Record<string, number> = {};
  for (const h of t.habits) {
    if (h.to !== undefined && h.to < end) continue;
    const s = habitStreakAcross(chain, h.id, after);
    if (s.current) out[h.id] = s.current;
  }
  const p = perfectStreakAcross(chain, after);
  if (p.current) out.perfect = p.current;
  return out;
}

/**
 * Each weekday's stats (0 Sunday to 6 Saturday) over the year so far, counted as a month's are:
 * for a time or number habit, the average of the values logged on that weekday.
 */
export function weekdayStats(t: Tracked, today: IsoDate): PeriodStats[] {
  const dates = countedDays(t, today);
  return [0, 1, 2, 3, 4, 5, 6].map((w) => statsOf(t, dates.filter((d) => weekday(d) === w)));
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

/**
 * The score out of 100, rounded: Notion's "Monthly score: 70". With `digits`, to that many places,
 * kept even when they are zeros ("70.0"), so a row of them lines up.
 */
export function points(score: number | null, digits = 0): string {
  if (score === null) return "–";
  const scale = 10 ** digits;
  return (Math.round(score * scale) / scale).toFixed(digits);
}

/**
 * A chart's score as its tooltip shows it, "64.3 / 100"; a missing one as a dash. ECharts hands a
 * tooltip null, undefined or "-" for a bar with no value, which Number() would make 0 or NaN.
 */
export function outOf100(value: unknown): string {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? `${points(n, 1)} / 100` : "–";
}

/**
 * The best and the hardest of some periods (weekdays, months), by score: the first of them wins a tie.
 * Null with fewer than two scored, or when they all score the same: there is nothing to compare.
 */
export function bestAndHardest<K>(keys: K[], scoreOf: (key: K) => number | null): { best: K; hardest: K } | null {
  const scored = keys.filter((k) => scoreOf(k) !== null);
  if (scored.length < 2) return null;
  let best = scored[0] as K;
  let hardest = scored[0] as K;
  for (const k of scored) {
    if (scoreOf(k)! > scoreOf(best)!) best = k;
    if (scoreOf(k)! < scoreOf(hardest)!) hardest = k;
  }
  // All alike: one period would be both the best and the hardest, so there is nothing to say.
  if (scoreOf(best) === scoreOf(hardest)) return null;
  return { best, hardest };
}
