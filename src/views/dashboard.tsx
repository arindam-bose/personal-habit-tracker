// Dashboard, the main page. At the top, the day to log (see today.tsx); below it, the year at a
// glance: scores for the day, the week, the month and the year, every habit's streak, the year as
// a heatmap, the year month by month, and how each habit went in the month of the day open above.

import { MONTHS, longDate, monthOf, shortDate, weekOf, addDays } from "../dates";
import { formatMinutes, formatValue, goalShort, goalText, isActive, label, meets } from "../habits";
import { dayScore, firstDay, habitStreakAcross, isPerfect, monthPassed, monthStats, yearPassed, percent, perfectStreakAcross, periodStats, points, yearStats, type PeriodStats, type Tracked } from "../score";
import { chain, selectedDay, tracked, weekStart, today } from "../state";
import { HeatLegend, Heatmap, dayCell, NoYear, ScoreBar, openDay, plural, refDay } from "./common";
import type { Habit } from "../types";
import { CardTitle } from "./help";
import { TodayView } from "./today";

export function DashboardView() {
  if (!tracked.value) return <NoYear />;
  return (
    <>
      <TodayView />
      <hr class="section-sep" />
      <Overview />
    </>
  );
}

/** The year at a glance, under the day being logged. */
function Overview() {
  const t = tracked.value!;
  const ref = refDay(t);
  if (ref === null) {
    return <section class="panel empty-state"><p>{t.year} hasn't started yet. Its figures fill in from {longDate(t.start ?? `${t.year}-01-01`)}.</p></section>;
  }
  // Today already says how to add the first habits.
  if (!t.habits.length) return null;
  // The first tile is the day open in the log above: today, or another day picked there.
  const picked = selectedDay.value >= firstDay(t) && selectedDay.value <= ref ? selectedDay.value : ref;
  const pickedLabel = picked === today.value ? "Today" : shortDate(picked);
  const day = dayScore(t, picked);
  const week = weekOf(ref, weekStart.value);
  const weekStats = periodStats(t, ref, week, addDays(week, 6));
  const month = monthOf(ref);
  const m = monthStats(t, month, ref);
  const y = yearStats(t, ref);
  // By habit follows the month of the day open in the log above, like the first tile.
  const shownMonth = monthOf(picked);
  const shown = shownMonth === month ? m : monthStats(t, shownMonth, ref);
  const shownName = MONTHS[shownMonth - 1];
  // Streaks run on from earlier stored years, and the best is the longest in any of them.
  const perfect = perfectStreakAcross(chain.value, ref);
  const streaks = t.habits.filter((h) => h.to === undefined || h.to >= ref).map((h) => ({ h, s: habitStreakAcross(chain.value, h.id, ref) }));
  const since = chain.value[0]?.year ?? t.year;

  return (
    <div class="stack">
      <div class="tiles">
        <button type="button" class="card tile tile-link" onClick={() => openDay(picked)}>
          <span class="tile-label">{pickedLabel}</span>
          <span class="tile-value"><OutOf100 score={day?.score ?? null} /></span>
          <ScoreBar score={day?.score ?? null} />
          <span class="tile-detail">{day ? `${day.met} of ${plural(day.total, "habit")} met${isPerfect(day) ? " · Perfect day 🎉" : ""}` : ""}</span>
        </button>
        <div class="card tile">
          <span class="tile-label">This week</span>
          <span class="tile-value"><OutOf100 score={weekStats.score} /></span>
          <ScoreBar score={weekStats.score} />
          <span class="tile-detail">{plural(weekStats.days, "day")} from {shortDate(week)} · {plural(weekStats.perfect, "perfect day")}</span>
        </div>
        <div class="card tile">
          <span class="tile-label">{MONTHS[month - 1]}</span>
          <span class="tile-value"><OutOf100 score={m.score} /></span>
          <ScoreBar score={m.score} />
          <span class="tile-detail">{plural(m.days, "day")} · {plural(m.perfect, "perfect day")}</span>
        </div>
        <div class="card tile">
          <span class="tile-label">{t.year}</span>
          <span class="tile-value"><OutOf100 score={y.score} /></span>
          <ScoreBar score={y.score} />
          <span class="tile-detail">{plural(y.days, "day")} · {plural(y.perfect, "perfect day")}</span>
        </div>
      </div>

      <section class="card">
        <h3 class="card-title">{t.year}, day by day</h3>
        <Heatmap t={t} weekStart={weekStart.value} label={`Day scores in ${t.year}`} cell={dayCell(t)} />
        <HeatLegend />
      </section>

      <MonthByMonth t={t} ref_={ref} />

      <div class="columns">
        <section class="card">
          <CardTitle title="Streaks">
            Days in a row each habit was met{since < t.year ? `, counting every year stored from ${since}: a streak carries on over New Year` : ""}.
            Today doesn't break a streak until it's over.
          </CardTitle>
          <table class="data-table streak-table">
            <thead>
              <tr>
                <th scope="col">Habit</th>
                <th scope="col" class="num">Now</th>
                <th scope="col" class="num">Best</th>
                {/* The day open in the log above, like the first tile. */}
                <th scope="col" class="num">{pickedLabel}</th>
              </tr>
            </thead>
            <tbody>
              {streaks.map(({ h, s }) => {
                const v = t.days.get(picked)?.values[h.id];
                return (
                  <tr>
                    <td>{label(h)}</td>
                    <td class="num">{s.current ? `🔥 ${s.current}` : "0"}</td>
                    <td class="num">{s.best}</td>
                    <td class="num">
                      {!isActive(h, picked) ? <span class="muted" title={`${h.name} didn't count that day`}>·</span>
                        : meets(h, v) ? "✓"
                        : v !== undefined && v !== true ? <span class="muted">{formatValue(h, v)}</span>
                        : <span class="muted">–</span>}
                    </td>
                  </tr>
                );
              })}
              <tr class="total">
                <td>🎉 Perfect days</td>
                <td class="num">{perfect.current ? `🔥 ${perfect.current}` : "0"}</td>
                <td class="num">{perfect.best}</td>
                <td class="num">{isPerfect(day) ? "✓" : <span class="muted">–</span>}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="card">
          <CardTitle title={`${shownName} by habit`}>
            Days met in {shownName}{shownMonth === monthOf(ref) && ref === today.value ? " so far" : ""}; the mark is the share for the whole year.
          </CardTitle>
          <ul class="hbars">
            {shown.habits.filter((x) => x.days > 0).map((x) => {
              const yearRate = y.habits.find((yh) => yh.habit.id === x.habit.id)?.rate ?? null;
              return (
                <li>
                  <span class="hbar-name">{label(x.habit)}{x.habit.goal ? <span class="muted small"> {goalText(x.habit)}</span> : null}</span>
                  <span class="hbar-track" title={`${shownName}: ${percent(x.rate)} · ${t.year}: ${percent(yearRate)}`}>
                    <span class="hbar-fill" style={{ width: `${x.rate ?? 0}%` }} />
                    {yearRate !== null && <span class="hbar-mark" style={{ left: `${yearRate}%` }} />}
                  </span>
                  <span class="hbar-share num">{x.met}/{x.days}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** A tile's score, as all four read: "65 / 100", rounded to the nearest whole point; a dash with none. */
function OutOf100(props: { score: number | null }) {
  if (props.score === null) return <>–</>;
  return <>{points(props.score)} <span class="tile-unit">/ 100</span></>;
}

/** A column of the month table: a habit, and whether it has an average column too. */
type Col = { h: Habit; i: number; measure: boolean };

/**
 * A row of the month table: a month, or the year so far. `stats` is null for a month still to
 * come, which shows only how much of it has gone by (none).
 */
function PeriodRow(props: { name: string; what?: string; passed: number; stats: PeriodStats | null; cols: Col[]; class: string }) {
  const { name, passed, stats, cols } = props;
  const what = props.what ?? name;
  return (
    <tr class={props.class}>
      <th scope="row" title={props.what}>{name}</th>
      <td class="passed">
        <span class="bar-line">
          <span class="num">{Math.round(passed)}%</span>
          <ScoreBar score={passed} label={`${what}: ${Math.round(passed)}% gone by`} />
        </span>
      </td>
      {cols.map(({ h, i, measure }) => {
        const x = stats?.habits[i];
        const counted = x !== undefined && x.days > 0;
        return (
          <>
            <td class="num" title={counted ? `${x.met} of ${plural(x.days, "day")} met · ${percent(x.rate)}` : stats ? `${h.name} didn't count in ${what}` : undefined}>
              {!stats ? null : counted ? <span class="rate">{Math.round(x.rate!)}%<Ring value={x.rate!} /></span> : <span class="muted">·</span>}
            </td>
            {measure && (
              <td class="num" title={counted && x.average !== null ? `Average of ${plural(x.logged, "day")} logged` : undefined}>
                {!stats ? null : counted && x.average !== null ? averageText(h, x.average) : <span class="muted">{counted ? "–" : "·"}</span>}
              </td>
            )}
          </>
        );
      })}
      <td>
        {stats && stats.score !== null && (
          <span class="bar-line">
            <span class="num">{points(stats.score, 1)}</span>
            <ScoreBar score={stats.score} label={`${what} score: ${points(stats.score, 1)} out of 100`} />
          </span>
        )}
      </td>
    </tr>
  );
}

/** A share out of 100 as a small ring, filled clockwise from the top. */
function Ring(props: { value: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, props.value));
  return (
    <svg class="ring" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <circle cx="9" cy="9" r={r} class="ring-track" />
      {v > 0 && <circle cx="9" cy="9" r={r} class="ring-fill" stroke-dasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 9 9)" />}
    </svg>
  );
}

/** A time or number habit's average, as its values read: "7:09", "8.2". */
function averageText(h: Habit, average: number): string {
  return h.kind === "duration" ? formatMinutes(average) : (Math.round(average * 10) / 10).toLocaleString();
}

/**
 * The year a row per month, as the Notion tracker's Monthly Progress: how much of the month has
 * gone by, the share of days each habit was met, a time or number habit's average, and the score.
 */
function MonthByMonth(props: { t: Tracked; ref_: string }) {
  const { t, ref_ } = props;
  const current = monthOf(ref_);
  const rows = MONTHS.map((_, i) => {
    const month = i + 1;
    const passed = monthPassed(t.year, month, ref_);
    return { month, passed, stats: passed ? monthStats(t, month, ref_) : null };
  });
  // A column per habit; a time or number habit has a second, its average.
  const cols: Col[] = t.habits.map((h, i) => ({ h, i, measure: h.kind !== "check" }));
  return (
    <section class="card">
      <CardTitle title={`${t.year}, month by month`}>
        How much of each month has gone by, the share of its days each habit was met, the average
        time or number logged, and the month's score. Overall is the year so far, every day counted
        together, as the {t.year} tile above. A dot means the habit didn't count that month.
      </CardTitle>
      <div class="table-scroll">
        <table class="data-table month-table">
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Passed</th>
              {cols.map(({ h, measure }) => (
                <>
                  <th scope="col" class="num" title={h.name}>{label(h)}</th>
                  {measure && <th scope="col" class="num" title={`${h.name}: average${h.goal ? `, goal ${goalText(h)}` : ""}`}>{h.emoji ? `${h.emoji} ` : ""}Avg{h.goal ? <span class="goal">{goalShort(h)}</span> : null}</th>}
                </>
              ))}
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ month, passed, stats }) => (
              <PeriodRow name={MONTHS[month - 1]!} passed={passed} stats={stats} cols={cols} class={month === current ? "current" : ""} />
            ))}
            {/* The year so far, as the 2026 tile counts it: every day pooled, not the months averaged. */}
            <PeriodRow name="Overall" what={`${t.year} so far`} passed={yearPassed(t.year, ref_)} stats={yearStats(t, ref_)} cols={cols} class="total" />
          </tbody>
        </table>
      </div>
    </section>
  );
}
