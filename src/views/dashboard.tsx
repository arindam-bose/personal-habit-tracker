// Dashboard, the main page. At the top, the day to log (see today.tsx); below it, the year at a
// glance: scores for the day, the week, the month and the year, every habit's streak, the year as
// a heatmap, and how each habit is going this month.

import { MONTHS, longDate, monthOf, shortDate, weekOf, addDays } from "../dates";
import { formatValue, goalText, isActive, label, meets } from "../habits";
import { dayScore, firstDay, habitStreakAcross, isPerfect, level, monthStats, percent, perfectStreakAcross, periodStats, points, yearStats } from "../score";
import { chain, selectedDay, tracked, weekStart, today } from "../state";
import { HeatLegend, Heatmap, NoYear, ScoreBar, openDay, plural, refDay } from "./common";
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
  // Streaks run on from earlier stored years, and the best is the longest in any of them.
  const perfect = perfectStreakAcross(chain.value, ref);
  const streaks = t.habits.filter((h) => h.to === undefined || h.to >= ref).map((h) => ({ h, s: habitStreakAcross(chain.value, h.id, ref) }));
  const since = chain.value[0]?.year ?? t.year;

  return (
    <div class="stack">
      <div class="tiles">
        <button type="button" class="card tile tile-link" onClick={() => openDay(picked)}>
          <span class="tile-label">{pickedLabel}</span>
          <span class="tile-value">{day ? percent(day.score) : "–"}</span>
          <ScoreBar score={day?.score ?? null} />
          <span class="tile-detail">{day ? `${day.met} of ${plural(day.total, "habit")} met${isPerfect(day) ? " · Perfect day 🎉" : ""}` : ""}</span>
        </button>
        <div class="card tile">
          <span class="tile-label">This week</span>
          <span class="tile-value">{percent(weekStats.score)}</span>
          <ScoreBar score={weekStats.score} />
          <span class="tile-detail">{plural(weekStats.days, "day")} from {shortDate(week)} · {plural(weekStats.perfect, "perfect day")}</span>
        </div>
        <div class="card tile">
          <span class="tile-label">{MONTHS[month - 1]}</span>
          <span class="tile-value">{points(m.score)} <span class="tile-unit">/ 100</span></span>
          <ScoreBar score={m.score} />
          <span class="tile-detail">{plural(m.days, "day")} · {plural(m.perfect, "perfect day")}</span>
        </div>
        <div class="card tile">
          <span class="tile-label">{t.year}</span>
          <span class="tile-value">{points(y.score)} <span class="tile-unit">/ 100</span></span>
          <ScoreBar score={y.score} />
          <span class="tile-detail">{plural(y.days, "day")} · {plural(y.perfect, "perfect day")}</span>
        </div>
      </div>

      <section class="card">
        <h3 class="card-title">{t.year}, day by day</h3>
        <Heatmap t={t} weekStart={weekStart.value} label={`Day scores in ${t.year}`} cell={(d) => {
          const s = dayScore(t, d);
          if (!t.days.has(d)) return { level: null, text: "nothing logged" };
          return { level: level(s?.score ?? null), text: s ? `${percent(s.score)} (${s.met} of ${s.total})` : "no habits" };
        }} />
        <HeatLegend />
      </section>

      <div class="columns">
        <section class="card">
          <h3 class="card-title">Streaks</h3>
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
          <p class="muted small">
            Days in a row each habit was met{since < t.year ? `, counting every year stored from ${since}: a streak carries on over New Year` : ""}.
            Today doesn't break a streak until it's over.
          </p>
        </section>

        <section class="card">
          <h3 class="card-title">{MONTHS[month - 1]} by habit</h3>
          <ul class="hbars">
            {m.habits.filter((x) => x.days > 0).map((x) => {
              const yearRate = y.habits.find((yh) => yh.habit.id === x.habit.id)?.rate ?? null;
              return (
                <li>
                  <span class="hbar-name">{label(x.habit)}{x.habit.goal ? <span class="muted small"> {goalText(x.habit)}</span> : null}</span>
                  <span class="hbar-track" title={`${MONTHS[month - 1]}: ${percent(x.rate)} · ${t.year}: ${percent(yearRate)}`}>
                    <span class="hbar-fill" style={{ width: `${x.rate ?? 0}%` }} />
                    {yearRate !== null && <span class="hbar-mark" style={{ left: `${yearRate}%` }} />}
                  </span>
                  <span class="hbar-share num">{x.met}/{x.days}</span>
                </li>
              );
            })}
          </ul>
          <p class="muted small">Days met this month; the mark is the share for the whole year.</p>
        </section>
      </div>
    </div>
  );
}
