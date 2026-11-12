// Over the years: every stored year side by side. Each year's score and perfect days, and each
// habit's share of days met, followed from year to year by its id. The year still under way is marked *.
// Loaded only when opened: it brings in the charting library.

import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { YearData } from "../db";
import { label } from "../habits";
import { firstDay, habitStreak, lastDay, percent, perfectStreak, points, trackedOf, yearStats } from "../score";
import { loadAllYears, today, years } from "../state";
import { theme } from "../theme";
import type { Habit } from "../types";
import { Chart, axisStyle, baseOption, percentAxis, seriesColors, token, type ChartOption } from "./chart";

export function YearsView() {
  const all = useSignal<YearData[] | null>(null);
  useEffect(() => {
    loadAllYears().then((d) => (all.value = d));
  }, [years.value]);
  if (!all.value) return <p class="muted">Loading…</p>;
  void theme.value;

  const rows = all.value.map((d) => {
    const t = trackedOf(d);
    const ref = lastDay(t, today.value) ?? firstDay(t);
    return { t, ref, stats: yearStats(t, ref), perfect: perfectStreak(t, ref), ongoing: ref < `${t.year}-12-31` };
  }).filter((r) => r.stats.days > 0);
  if (rows.length < 2) return <section class="panel empty-state"><p>Over the years compares two or more years. Import or start another year on the Settings page.</p></section>;

  // Every habit in any year, by id, in the order of the newest year that has it.
  const habits = new Map<string, Habit>();
  for (const r of [...rows].reverse()) for (const h of r.t.habits) if (!habits.has(h.id)) habits.set(h.id, h);
  const name = (r: (typeof rows)[number]) => `${r.t.year}${r.ongoing ? "*" : ""}`;
  const colors = seriesColors(10);
  const blue = token("--series-1");

  const scoreOption: ChartOption = {
    ...baseOption(),
    legend: { show: false },
    tooltip: { ...(baseOption().tooltip as object), trigger: "axis", valueFormatter: (v: unknown) => `${points(Number(v))} / 100` },
    xAxis: { type: "category", data: rows.map(name), ...axisStyle(), splitLine: { show: false } },
    yAxis: { ...percentAxis(), axisLabel: { color: token("--muted") } },
    series: [{ name: "Yearly score", type: "bar", barMaxWidth: 48, data: rows.map((r) => r.stats.score), itemStyle: { color: blue, borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: "top", color: token("--muted"), formatter: (p: { value: number }) => points(p.value) } }],
  };

  // Habits in two or more years, each its own colour, at most ten.
  const shared = [...habits.values()].filter((h) => rows.filter((r) => r.t.habits.some((x) => x.id === h.id)).length > 1).slice(0, 10);
  const habitOption: ChartOption = {
    ...baseOption(),
    tooltip: { ...(baseOption().tooltip as object), trigger: "axis", valueFormatter: (v: unknown) => (v === null || v === undefined ? "–" : percent(Number(v), 1)) },
    xAxis: { type: "category", data: rows.map(name), ...axisStyle(), splitLine: { show: false } },
    yAxis: percentAxis(),
    series: shared.map((h, i) => ({
      name: label(h), type: "line", symbolSize: 8, lineStyle: { width: 2, color: colors[i] }, itemStyle: { color: colors[i] },
      data: rows.map((r) => r.stats.habits.find((x) => x.habit.id === h.id)?.rate ?? null), connectNulls: false,
    })),
  };

  return (
    <div class="stack">
      <div class="columns">
        <section class="card">
          <h3 class="card-title">Yearly score</h3>
          <Chart option={scoreOption} height={240} label="Each year's score out of 100" />
        </section>
        {shared.length > 0 && (
          <section class="card">
            <h3 class="card-title">Habits kept from year to year</h3>
            <Chart option={habitOption} height={240} label="Each habit's share of days met, year by year" />
          </section>
        )}
      </div>
      <section class="card">
        <h3 class="card-title">All figures</h3>
        <div class="table-scroll">
          <table class="data-table all-figures">
            <thead>
              <tr>
                <th scope="col" />
                {rows.map((r) => <th scope="col" class="num">{name(r)}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr><th scope="row">Days tracked</th>{rows.map((r) => <td class="num">{r.stats.days}</td>)}</tr>
              <tr><th scope="row">💯 Score</th>{rows.map((r) => <td class="num">{points(r.stats.score)}</td>)}</tr>
              <tr><th scope="row">🎉 Perfect days</th>{rows.map((r) => <td class="num">{r.stats.perfect} ({percent((r.stats.perfect / r.stats.days) * 100, 1)})</td>)}</tr>
              <tr><th scope="row">Most perfect days in a row</th>{rows.map((r) => <td class="num">{r.perfect.best}</td>)}</tr>
              {[...habits.values()].map((h) => (
                <tr>
                  <th scope="row">{label(h)}</th>
                  {rows.map((r) => {
                    const x = r.stats.habits.find((s) => s.habit.id === h.id);
                    const best = x ? habitStreak(r.t, x.habit, r.ref).best : 0;
                    return <td class="num" title={x ? `Longest streak: ${best} days` : undefined}>{x && x.days ? percent(x.rate, 1) : "–"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="muted small">Each habit's share of the days it counted. * The year is still under way.</p>
      </section>
    </div>
  );
}
