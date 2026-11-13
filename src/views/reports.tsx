// Reports: the year in charts and words. Overview (the day score through the year, each month's
// score, how each weekday goes, and the year's report card), a report card for every month, and
// habits month by month, with times and numbers against their goals.
// Loaded only when opened: it brings in the charting library.

import { useSignal } from "@preact/signals";
import { MONTHS, MONTHS_SHORT, WEEKDAYS, WEEKDAYS_SHORT, longDate, weekOrder } from "../dates";
import { durationWords, formatAverage, goalShort, goalText, label } from "../habits";
import {
  bestAndHardest, dailyScores, habitStreak, monthStats, outOf100, percent, perfectStreak, points, rollingAverage, weekdayStats, yearStats,
  type HabitStats, type PeriodStats, type Tracked,
} from "../score";
import { tracked, weekStart } from "../state";
import { theme } from "../theme";
import type { Habit } from "../types";
import { CardTitle } from "./help";
import { Chart, axisStyle, barLabels, levelLine, outsideLabelRoom, baseOption, percentAxis, token, type ChartOption } from "./chart";
import { NoYear, openDay, plural, refDay } from "./common";

type Tab = "overview" | "months" | "habits";
const TABS: [Tab, string][] = [["overview", "Overview"], ["months", "Monthly reports"], ["habits", "More on this"]];

export function ReportsView() {
  const tab = useSignal<Tab>("overview");
  const t = tracked.value;
  if (!t) return <NoYear />;
  const ref = refDay(t);
  if (ref === null) return <section class="panel empty-state"><p>{t.year} hasn't started yet: its reports fill in as the days come.</p></section>;
  void theme.value; // charts redraw in the new colours on a switch
  const months = Array.from({ length: Number(ref.slice(5, 7)) }, (_, i) => i + 1);
  const stats = months.map((m) => monthStats(t, m, ref));
  // Once a render: the Overview's average line and its year report card both read it.
  const year = yearStats(t, ref);

  return (
    <div class="reports">
      <div class="tab-bar" role="tablist">
        {TABS.map(([id, name]) => (
          <button type="button" role="tab" aria-selected={tab.value === id} class={tab.value === id ? "active" : ""} onClick={() => (tab.value = id)}>{name}</button>
        ))}
      </div>
      <div class="tab-panel" role="tabpanel">
        {tab.value === "overview" && <Overview t={t} ref_={ref} months={months} stats={stats} year={year} />}
        {tab.value === "months" && (
          <div class="report-cards">
            {[...months].reverse().map((m) => {
              const s = stats[m - 1]!;
              return s.days ? <ReportCard title={`📅 ${MONTHS[m - 1]}`} stats={s} scoreName="Monthly score" /> : null;
            })}
          </div>
        )}
        {tab.value === "habits" && <HabitsByMonth t={t} ref_={ref} months={months} stats={stats} />}
      </div>
    </div>
  );
}

/** A table under a chart with its numbers, for anyone who'd rather read them. */
function TableView(props: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details class="table-view">
      <summary>Show as a table</summary>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>{props.head.map((h, i) => <th scope="col" class={i ? "num" : ""}>{h}</th>)}</tr></thead>
          <tbody>{props.rows.map((r) => <tr>{r.map((c, i) => (i ? <td class="num">{c}</td> : <th scope="row">{c}</th>))}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

function Overview(props: { t: Tracked; ref_: string; months: number[]; stats: PeriodStats[]; year: PeriodStats }) {
  const { t, ref_, months, stats } = props;
  const daily = dailyScores(t, ref_);
  const smooth = rollingAverage(daily.map((d) => d.score), 7);
  const blue = token("--series-1");
  const dates = daily.map((d) => d.date);

  const dailyOption: ChartOption = {
    ...baseOption(),
    tooltip: { ...(baseOption().tooltip as object), trigger: "axis", valueFormatter: (v: unknown) => (v === null || v === undefined ? "–" : percent(Number(v), 1)) },
    xAxis: {
      type: "category", data: dates, ...axisStyle(), splitLine: { show: false },
      axisLabel: { color: token("--muted"), interval: (_i: number, v: string) => v.endsWith("-01"), formatter: (v: string) => MONTHS_SHORT[Number(v.slice(5, 7)) - 1] },
    },
    yAxis: percentAxis(),
    series: [
      { name: "Day score", type: "bar", data: daily.map((d) => d.score), barCategoryGap: "20%", itemStyle: { color: blue, opacity: 0.3 } },
      { name: "7-day average", type: "line", data: smooth, showSymbol: false, smooth: false, lineStyle: { width: 2, color: blue }, itemStyle: { color: blue } },
    ],
  };

  // The year so far, as its report card scores it: the average of every day counted, which is also
  // what the weekdays share out between them.
  const average = props.year.score;
  const averageName = average === null ? "" : `Average\n${points(average, 1)}`;
  const averageRoom = average === null ? {} : { grid: { ...(baseOption().grid as object), right: outsideLabelRoom(averageName) } };
  const averageLine = average === null ? {} : { markLine: levelLine(average, averageName) };
  const monthOption: ChartOption = {
    ...baseOption(),
    legend: { show: false },
    ...averageRoom,
    tooltip: { ...(baseOption().tooltip as object), trigger: "axis", valueFormatter: outOf100 },
    xAxis: { type: "category", data: months.map((m) => MONTHS_SHORT[m - 1]), ...axisStyle(), splitLine: { show: false } },
    yAxis: { ...percentAxis(), axisLabel: { color: token("--muted") } },
    series: [{ name: "Monthly score", type: "bar", data: stats.map((s) => s.score), barMaxWidth: 36,
      itemStyle: { color: blue, borderRadius: [4, 4, 0, 0] }, ...barLabels((v) => points(v, 1)), ...averageLine }],
  };
  const monthEnds = bestAndHardest(months.map((_, i) => i), (i) => stats[i]!.score);

  const wd = weekdayStats(t, ref_);
  const order = weekOrder(weekStart.value);
  const weekdayOption: ChartOption = {
    ...baseOption(),
    legend: { show: false },
    ...averageRoom,
    tooltip: { ...(baseOption().tooltip as object), trigger: "axis", valueFormatter: outOf100 },
    xAxis: { type: "category", data: order.map((d) => WEEKDAYS_SHORT[d]), ...axisStyle(), splitLine: { show: false } },
    // Out of 100, to one place, as Monthly score is beside it: the axis, the labels, the tooltip and the table.
    yAxis: { ...percentAxis(), axisLabel: { color: token("--muted") } },
    series: [{ name: "Average day score", type: "bar", data: order.map((d) => wd[d]!.score), barMaxWidth: 36, itemStyle: { color: blue, borderRadius: [4, 4, 0, 0] },
      ...barLabels((v) => points(v, 1)), ...averageLine }],
  };
  const dayEnds = bestAndHardest(order, (d) => wd[d]!.score);

  return (
    <>
      <section class="card">
        <h3 class="card-title">Day score through {t.year}</h3>
        <div class="wide-chart">
          <Chart option={dailyOption} height={280} label={`Each day's score in ${t.year}, with its 7-day average`}
            onPick={({ dataIndex }) => dates[dataIndex] && openDay(dates[dataIndex])} />
        </div>
        <p class="muted small">Click a day to open it.</p>
      </section>
      <div class="columns">
        <section class="card">
          <h3 class="card-title">Monthly score</h3>
          <Chart option={monthOption} height={240} label="Each month's score out of 100" />
          {monthEnds && (
            <p class="muted small">Best in {MONTHS[months[monthEnds.best]! - 1]} ({points(stats[monthEnds.best]!.score, 1)}), hardest in {MONTHS[months[monthEnds.hardest]! - 1]} ({points(stats[monthEnds.hardest]!.score, 1)}).</p>
          )}
          <TableView head={["Month", "Score", "Perfect days", "Days"]} rows={months.map((m, i) => [MONTHS[m - 1]!, points(stats[i]!.score, 1), stats[i]!.perfect, stats[i]!.days])} />
        </section>
        <section class="card">
          <h3 class="card-title">By weekday</h3>
          <Chart option={weekdayOption} height={240} label="The average day score for each weekday" />
          {dayEnds && (
            <p class="muted small">Best on {WEEKDAYS[dayEnds.best]}s ({points(wd[dayEnds.best]!.score, 1)}), hardest on {WEEKDAYS[dayEnds.hardest]}s ({points(wd[dayEnds.hardest]!.score, 1)}).</p>
          )}
          <TableView head={["Weekday", "Average score", "Days"]} rows={order.map((d) => [WEEKDAYS[d]!, points(wd[d]!.score, 1), wd[d]!.scored])} />
        </section>
      </div>
      <YearReport t={t} ref_={ref_} y={props.year} />
    </>
  );
}

/**
 * One row of a report card: the name on the left, its values right-aligned in two columns (the
 * share, then the count at the far right), so the numbers line up down the card. `sub` is a muted line under it,
 * right-aligned with the values, with its figures in bold.
 */
function ReportRow(props: { name: preact.ComponentChildren; value: preact.ComponentChildren; share?: number | null; sub?: preact.ComponentChildren; class?: string }) {
  return (
    <>
      <tr class={`${props.class ?? ""}${props.sub ? " rt-has-sub" : ""}`}>
        <th scope="row">{props.name}</th>
        <td class="num">{props.share !== undefined && <span class="pill">{percent(props.share)}</span>}</td>
        <td class="num"><b>{props.value}</b></td>
      </tr>
      {props.sub && <tr class="rt-sub"><td colSpan={3} class="muted">{props.sub}</td></tr>}
    </>
  );
}

/** A habit's row: "🧘 Meditation · 55% · 17 days", or for a time or number, the days its goal was met. */
function HabitRow({ h, of }: { h: HabitStats; of: number }) {
  const { habit } = h;
  if (!h.days) return null;
  // A habit that counted on fewer of the days (added or stopped partway) says out of how many.
  const days = (n: number) => (h.days < of ? `${n} of ${plural(h.days, "day")}` : plural(n, "day"));
  if (habit.kind === "check") return <ReportRow name={label(habit)} value={days(h.met)} share={h.rate} />;
  const avg = h.average === null ? "–" : formatAverage(habit, h.average);
  const total = habit.kind === "duration" ? durationWords(h.total) : `${h.total.toLocaleString()}${habit.unit ? ` ${habit.unit}` : ""}`;
  const sub = h.logged > 0 ? <><b>{total}</b> in all, <b>{avg}</b> a day on average</> : undefined;
  return habit.goal
    ? <ReportRow name={<>{label(habit)} <span class="muted">{goalText(habit)}</span></>} value={days(h.met)} share={h.rate} sub={sub} />
    : <ReportRow name={label(habit)} value={`${days(h.logged)} logged`} sub={sub} />;
}

function ReportCard(props: { title: string; stats: PeriodStats; scoreName: string; extra?: preact.ComponentChildren }) {
  const s = props.stats;
  return (
    <section class="card report-card">
      <h3 class="card-title">{props.title}</h3>
      <table class="report-table small">
        <tbody>
          <ReportRow class="rt-days" name="Days passed" value={s.days} />
          {s.habits.map((h) => <HabitRow h={h} of={s.days} />)}
          <ReportRow class="rt-gap" name={`${s.perfect ? "🎉" : "💔"} Perfect days`} value={s.perfect} share={s.days ? (s.perfect / s.days) * 100 : null} />
          {props.extra}
          <ReportRow class="rt-score" name={`💯 ${props.scoreName}`} value={points(s.score)} />
        </tbody>
      </table>
    </section>
  );
}

function YearReport({ t, ref_, y }: { t: Tracked; ref_: string; y: PeriodStats }) {
  const perfect = perfectStreak(t, ref_);
  const streaks = t.habits.map((h) => ({ h, s: habitStreak(t, h, ref_) })).filter((x) => x.s.best > 0).sort((a, b) => b.s.best - a.s.best);
  return (
    <ReportCard title={`📅 ${t.year}${ref_ < `${t.year}-12-31` ? ` so far (to ${longDate(ref_)})` : ""}`} stats={y} scoreName="Yearly score"
        extra={
          <>
            <tr class="rt-sep rt-head"><th scope="rowgroup" colSpan={3}>🔥 Longest streaks in {t.year}</th></tr>
            {streaks.map(({ h, s }) => <ReportRow name={label(h)} value={plural(s.best, "day")} />)}
            <ReportRow name="🎉 Perfect days in a row" value={plural(perfect.best, "day")} />
          </>
        } />
  );
}

/** A month's share of days for a habit, shaded in the heatmap's blue. */
function shade(rate: number | null): Record<string, string> {
  if (rate === null) return {};
  return { background: `rgba(var(--heat), ${(0.08 + (rate / 100) * 0.82).toFixed(2)})`, color: rate > 55 ? "var(--on-heat)" : "inherit" };
}

function HabitsByMonth(props: { t: Tracked; ref_: string; months: number[]; stats: PeriodStats[] }) {
  const { t, ref_, months, stats } = props;
  const measures = t.habits.filter((h) => h.kind !== "check");
  const byMonth: Along = { by: "month", short: months.map((m) => MONTHS_SHORT[m - 1]!), long: months.map((m) => MONTHS[m - 1]!), stats };
  // In the order the week starts on, as the Overview's By weekday is.
  const order = weekOrder(weekStart.value);
  const w = weekdayStats(t, ref_);
  const byWeekday: Along = { by: "weekday", short: order.map((d) => WEEKDAYS_SHORT[d]!), long: order.map((d) => WEEKDAYS[d]!), stats: order.map((d) => w[d]!) };
  return (
    <>
      <section class="card">
        <CardTitle title="Share of days each habit was met">
          Percent of the month's days; darker is more. A dot means the habit didn't count that month.
        </CardTitle>
        <div class="table-scroll">
          <table class="data-table month-grid">
            <thead>
              <tr>
                <th scope="col">Habit</th>
                {months.map((m) => <th scope="col" class="num">{MONTHS_SHORT[m - 1]}</th>)}
              </tr>
            </thead>
            <tbody>
              {t.habits.map((h, i) => (
                <tr>
                  <th scope="row">{label(h)}</th>
                  {stats.map((s) => {
                    const x = s.habits[i]!;
                    return <td class="num" style={shade(x.rate)} title={x.days ? `${x.met} of ${x.days} days` : "Didn't count"}>{x.days ? Math.round(x.rate!) : "·"}</td>;
                  })}
                </tr>
              ))}
              <tr class="total">
                <th scope="row">📈 Score</th>
                {stats.map((s) => <td class="num" style={shade(s.score)}>{points(s.score)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      {measures.length > 0 && (
        <div class="columns">
          {measures.map((h) => <MeasureChart habit={h} index={t.habits.indexOf(h)} along={byMonth} />)}
        </div>
      )}
      {measures.length > 0 && (
        <div class="columns">
          {measures.map((h) => <MeasureChart habit={h} index={t.habits.indexOf(h)} along={byWeekday} />)}
        </div>
      )}
    </>
  );
}

/** What a measure chart runs along: its bars' short names, their names in full, and their stats. */
interface Along {
  /** "month" or "weekday", for the title, the table and the screen reader's label. */
  by: "month" | "weekday";
  short: string[];
  long: string[];
  stats: PeriodStats[];
}

/**
 * A time or number habit's average each month, or on each weekday, with its goal as a dashed line.
 * One axis, one series. By weekday, it also names the best and hardest weekday, as the Overview does.
 */
function MeasureChart(props: { habit: Habit; index: number; along: Along }) {
  const { habit, along } = props;
  const { stats } = along;
  const duration = habit.kind === "duration";
  const values = stats.map((s) => s.habits[props.index]!.average);
  const show = (v: unknown) => (v === null || v === undefined ? "–" : formatAverage(habit, Number(v)));
  const color = token("--series-1");
  const goalValue = habit.goal?.value ?? 0;
  const goalName = `Goal\n${goalShort(habit)}`;
  const weekly = along.by === "weekday";
  const option: ChartOption = {
    ...baseOption(),
    legend: { show: false },
    ...(habit.goal ? { grid: { ...(baseOption().grid as object), right: outsideLabelRoom(goalName) } } : {}),
    tooltip: { ...(baseOption().tooltip as object), trigger: "axis", valueFormatter: show },
    xAxis: { type: "category", data: along.short, ...axisStyle(), splitLine: { show: false } },
    yAxis: {
      type: "value", ...axisStyle(), axisLine: { show: false }, min: 0,
      // Whole hours: the top rounds up to the next hour, so every label is one.
      // Tall enough for the goal line too, even when every bar falls short of it.
      ...(duration
        ? { interval: 60, max: (e: { max: number }) => Math.ceil(Math.max(e.max, goalValue) / 60) * 60, axisLabel: { color: token("--muted"), formatter: (v: number) => `${v / 60}h` } }
        : { max: (e: { max: number }) => (goalValue > e.max ? Math.ceil(goalValue * 1.1) : null) }),
    },
    series: [{
      // Unrounded: `show` rounds once, so a bar, its tooltip, the line under the chart and the table
      // all read the same (rounding here too turned 6:44.45 into 6:45 on the bar alone).
      name: `Average ${habit.name}`, type: "bar", data: values, barMaxWidth: weekly ? 36 : 32,
      // Each bar's average on top, as on the Overview's bars; so the goal is named past the line's
      // end, where it can't land on one.
      itemStyle: { color, borderRadius: [4, 4, 0, 0] }, ...barLabels(show, true),
      ...(habit.goal ? { markLine: levelLine(habit.goal.value, goalName) } : {}),
    }],
  };
  // The best weekday is the one nearest the goal's side: the most sleep, the least screen time.
  // Without a goal there is no better or worse, only the most and the least.
  const sign = habit.goal?.op === "atMost" ? -1 : 1;
  const ends = weekly ? bestAndHardest(values.map((_, i) => i), (i) => (values[i] === null ? null : sign * values[i]!)) : null;
  const [high, low] = habit.goal ? ["Best", "hardest"] : ["Most", "least"];
  const what = weekly ? "by weekday" : "monthly average";
  return (
    <section class="card">
      <h3 class="card-title">{label(habit)}: {what}{habit.goal ? <span class="muted small"> (goal: {goalText(habit)})</span> : null}</h3>
      <Chart option={option} height={220} label={`${habit.name}'s average ${weekly ? "on each weekday" : "each month"}${habit.goal ? `, against its goal of ${goalText(habit)}` : ""}`} />
      {ends && (
        <p class="muted small">{high} on {along.long[ends.best]}s ({show(values[ends.best])}), {low} on {along.long[ends.hardest]}s ({show(values[ends.hardest])}).</p>
      )}
      <TableView head={[weekly ? "Weekday" : "Month", "Average", "Goal met"]} rows={along.long.map((name, i) => {
        const x = stats[i]!.habits[props.index]!;
        return [name, show(x.average), x.days ? `${x.met} of ${x.days} days` : "–"];
      })} />
    </section>
  );
}
