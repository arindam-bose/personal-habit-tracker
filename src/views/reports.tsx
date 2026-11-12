// Reports: the year in charts and words. Overview (the day score through the year, each month's
// score, and how each weekday goes), a report card for every month and the year, and habits month
// by month, with times and numbers against their goals.
// Loaded only when opened: it brings in the charting library.

import { useSignal } from "@preact/signals";
import { MONTHS, MONTHS_SHORT, WEEKDAYS, WEEKDAYS_SHORT, longDate } from "../dates";
import { durationWords, formatMinutes, goalText, label } from "../habits";
import {
  dailyScores, habitStreak, monthStats, percent, perfectStreak, points, rollingAverage, weekdayScores, yearStats,
  type HabitStats, type PeriodStats, type Tracked,
} from "../score";
import { tracked, weekStart } from "../state";
import { theme } from "../theme";
import type { Habit } from "../types";
import { Chart, axisStyle, baseOption, percentAxis, token, type ChartOption } from "./chart";
import { NoYear, openDay, plural, refDay } from "./common";

type Tab = "overview" | "months" | "year" | "habits";
const TABS: [Tab, string][] = [["overview", "Overview"], ["months", "Monthly reports"], ["year", "Yearly report"], ["habits", "Habits by month"]];

export function ReportsView() {
  const tab = useSignal<Tab>("overview");
  const t = tracked.value;
  if (!t) return <NoYear />;
  const ref = refDay(t);
  if (ref === null) return <section class="panel empty-state"><p>{t.year} hasn't started yet: its reports fill in as the days come.</p></section>;
  void theme.value; // charts redraw in the new colours on a switch
  const months = Array.from({ length: Number(ref.slice(5, 7)) }, (_, i) => i + 1);
  const stats = months.map((m) => monthStats(t, m, ref));

  return (
    <div class="reports">
      <div class="tab-bar" role="tablist">
        {TABS.map(([id, name]) => (
          <button type="button" role="tab" aria-selected={tab.value === id} class={tab.value === id ? "active" : ""} onClick={() => (tab.value = id)}>{name}</button>
        ))}
      </div>
      <div class="tab-panel" role="tabpanel">
        {tab.value === "overview" && <Overview t={t} ref_={ref} months={months} stats={stats} />}
        {tab.value === "months" && (
          <div class="report-cards">
            {[...months].reverse().map((m) => {
              const s = stats[m - 1]!;
              return s.days ? <ReportCard title={`📅 ${MONTHS[m - 1]}`} stats={s} scoreName="Monthly score" /> : null;
            })}
          </div>
        )}
        {tab.value === "year" && <YearReport t={t} ref_={ref} />}
        {tab.value === "habits" && <HabitsByMonth t={t} months={months} stats={stats} />}
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

function Overview(props: { t: Tracked; ref_: string; months: number[]; stats: PeriodStats[] }) {
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

  const monthOption: ChartOption = {
    ...baseOption(),
    legend: { show: false },
    tooltip: { ...(baseOption().tooltip as object), trigger: "axis", valueFormatter: (v: unknown) => `${points(Number(v))} / 100` },
    xAxis: { type: "category", data: months.map((m) => MONTHS_SHORT[m - 1]), ...axisStyle(), splitLine: { show: false } },
    yAxis: { ...percentAxis(), axisLabel: { color: token("--muted") } },
    series: [{ name: "Monthly score", type: "bar", data: stats.map((s) => (s.score === null ? null : Math.round(s.score * 10) / 10)), barMaxWidth: 36,
      itemStyle: { color: blue, borderRadius: [4, 4, 0, 0] }, label: { show: true, position: "top", color: token("--muted"), formatter: (p: { value: number }) => points(p.value) } }],
  };

  const wd = weekdayScores(t, ref_);
  const order = [0, 1, 2, 3, 4, 5, 6].map((i) => (i + weekStart.value) % 7);
  const weekdayOption: ChartOption = {
    ...baseOption(),
    legend: { show: false },
    tooltip: { ...(baseOption().tooltip as object), trigger: "axis", valueFormatter: (v: unknown) => percent(Number(v), 1) },
    xAxis: { type: "category", data: order.map((d) => WEEKDAYS_SHORT[d]), ...axisStyle(), splitLine: { show: false } },
    yAxis: percentAxis(),
    series: [{ name: "Average day score", type: "bar", data: order.map((d) => wd[d]!.score), barMaxWidth: 36, itemStyle: { color: blue, borderRadius: [4, 4, 0, 0] } }],
  };
  const best = order.filter((d) => wd[d]!.score !== null).sort((a, b) => wd[b]!.score! - wd[a]!.score!);

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
          <TableView head={["Month", "Score", "Perfect days", "Days"]} rows={months.map((m, i) => [MONTHS[m - 1]!, points(stats[i]!.score), stats[i]!.perfect, stats[i]!.days])} />
        </section>
        <section class="card">
          <h3 class="card-title">By weekday</h3>
          <Chart option={weekdayOption} height={240} label="The average day score for each weekday" />
          {best.length > 1 && (
            <p class="muted small">Best on {WEEKDAYS[best[0]!]}s ({percent(wd[best[0]!]!.score, 1)}), hardest on {WEEKDAYS[best[best.length - 1]!]}s ({percent(wd[best[best.length - 1]!]!.score, 1)}).</p>
          )}
          <TableView head={["Weekday", "Average score", "Days"]} rows={order.map((d) => [WEEKDAYS[d]!, percent(wd[d]!.score, 1), wd[d]!.days])} />
        </section>
      </div>
    </>
  );
}

/** One habit's line in a report card: "🧘 Meditation: 31 days (100%)". */
function HabitLine({ h, of }: { h: HabitStats; of: number }) {
  const { habit } = h;
  if (!h.days) return null;
  const share = <span class="pill">{percent(h.rate)}</span>;
  if (habit.kind === "check") {
    return <li>{label(habit)}: <b>{plural(h.met, "day")}</b>{h.days < of ? ` of ${h.days}` : ""} {share}</li>;
  }
  const avg = h.average === null ? "–" : habit.kind === "duration" ? formatMinutes(h.average) : h.average.toFixed(1).replace(/\.0$/, "");
  const total = habit.kind === "duration" ? durationWords(h.total) : `${h.total.toLocaleString()}${habit.unit ? ` ${habit.unit}` : ""}`;
  return (
    <li>
      {label(habit)}: {habit.goal ? <>{goalText(habit)} on <b>{plural(h.met, "day")}</b> {share}</> : <b>{plural(h.logged, "day")} logged</b>}
      {h.logged > 0 && <span class="muted rl-sub">{total} in all, {avg} a day on average</span>}
    </li>
  );
}

function ReportCard(props: { title: string; stats: PeriodStats; scoreName: string; extra?: preact.ComponentChildren }) {
  const s = props.stats;
  return (
    <section class="card report-card">
      <h3 class="card-title">{props.title}</h3>
      <p class="small">Days: <b>{s.days}</b></p>
      <ul class="report-lines small">
        {s.habits.map((h) => <HabitLine h={h} of={s.days} />)}
      </ul>
      <p class="small">{s.perfect ? "🎉" : "💔"} Perfect days: <b>{s.perfect}</b> <span class="pill">{percent(s.days ? (s.perfect / s.days) * 100 : null)}</span></p>
      {props.extra}
      <p class="report-score">💯 {props.scoreName}: <b>{points(s.score)}</b></p>
    </section>
  );
}

function YearReport({ t, ref_ }: { t: Tracked; ref_: string }) {
  const y = yearStats(t, ref_);
  const perfect = perfectStreak(t, ref_);
  const streaks = t.habits.map((h) => ({ h, s: habitStreak(t, h, ref_) })).filter((x) => x.s.best > 0).sort((a, b) => b.s.best - a.s.best);
  return (
    <div class="report-cards one">
      <ReportCard title={`📅 ${t.year}${ref_ < `${t.year}-12-31` ? ` so far (to ${longDate(ref_)})` : ""}`} stats={y} scoreName="Yearly score"
        extra={
          <div class="small">
            <p>🔥 Longest streaks in {t.year}:</p>
            <ul class="report-lines">
              {streaks.map(({ h, s }) => <li>{label(h)}: <b>{plural(s.best, "day")}</b></li>)}
              <li>🎉 Perfect days: <b>{plural(perfect.best, "day")}</b> in a row</li>
            </ul>
          </div>
        } />
    </div>
  );
}

/** A month's share of days for a habit, shaded in the heatmap's blue. */
function shade(rate: number | null): Record<string, string> {
  if (rate === null) return {};
  return { background: `rgba(var(--heat), ${(0.08 + (rate / 100) * 0.82).toFixed(2)})`, color: rate > 55 ? "var(--on-heat)" : "inherit" };
}

function HabitsByMonth(props: { t: Tracked; months: number[]; stats: PeriodStats[] }) {
  const { t, months, stats } = props;
  const measures = t.habits.filter((h) => h.kind !== "check");
  return (
    <>
      <section class="card">
        <h3 class="card-title">Share of days each habit was met</h3>
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
        <p class="muted small">Percent of the month's days; darker is more. A dot means the habit didn't count that month.</p>
      </section>
      {measures.length > 0 && (
        <div class="columns">
          {measures.map((h) => <MeasureChart habit={h} index={t.habits.indexOf(h)} months={months} stats={stats} />)}
        </div>
      )}
    </>
  );
}

/** A time or number habit's monthly average, with its goal as a dashed line. One axis, one series. */
function MeasureChart(props: { habit: Habit; index: number; months: number[]; stats: PeriodStats[] }) {
  const { habit, months, stats } = props;
  const duration = habit.kind === "duration";
  const values = stats.map((s) => s.habits[props.index]!.average);
  const show = (v: unknown) => (v === null || v === undefined ? "–" : duration ? formatMinutes(Number(v)) : Number(v).toFixed(1).replace(/\.0$/, ""));
  const color = token("--series-1");
  const option: ChartOption = {
    ...baseOption(),
    legend: { show: false },
    tooltip: { ...(baseOption().tooltip as object), trigger: "axis", valueFormatter: show },
    xAxis: { type: "category", data: months.map((m) => MONTHS_SHORT[m - 1]), ...axisStyle(), splitLine: { show: false } },
    yAxis: {
      type: "value", ...axisStyle(), axisLine: { show: false }, min: 0,
      // Whole hours: the top rounds up to the next hour, so every label is one.
      ...(duration ? { interval: 60, max: (e: { max: number }) => Math.ceil(e.max / 60) * 60, axisLabel: { color: token("--muted"), formatter: (v: number) => `${v / 60}h` } } : {}),
    },
    series: [{
      name: `Average ${habit.name}`, type: "bar", data: values.map((v) => (v === null ? null : Math.round(v * 10) / 10)), barMaxWidth: 32,
      itemStyle: { color, borderRadius: [4, 4, 0, 0] },
      ...(habit.goal ? {
        markLine: {
          symbol: "none", silent: true,
          lineStyle: { type: "dashed", color: token("--text"), width: 1 },
          label: { formatter: `Goal ${show(habit.goal.value)}`, color: token("--muted"), position: "insideEndTop" },
          data: [{ yAxis: habit.goal.value }],
        },
      } : {}),
    }],
  };
  return (
    <section class="card">
      <h3 class="card-title">{label(habit)}: monthly average{habit.goal ? <span class="muted small"> (goal: {goalText(habit)})</span> : null}</h3>
      <Chart option={option} height={220} label={`${habit.name}'s average each month${habit.goal ? `, against its goal of ${goalText(habit)}` : ""}`} />
      <TableView head={["Month", "Average", "Goal met"]} rows={months.map((m, i) => {
        const x = stats[i]!.habits[props.index]!;
        return [MONTHS[m - 1]!, show(x.average), x.days ? `${x.met} of ${x.days} days` : "–"];
      })} />
    </section>
  );
}
