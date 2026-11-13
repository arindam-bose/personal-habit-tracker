// Heatmaps: the year day by day. One for the day score, then one for each habit, shaded on the
// days it was met. Click a day to open it in the Dashboard's day log.

import { formatValue, goalText, isActive, label, meets } from "../habits";
import { percent, yearStats } from "../score";
import { tracked, weekStart } from "../state";
import { HeatLegend, Heatmap, dayCell, NoYear, plural, refDay } from "./common";

export function HeatmapsView() {
  const t = tracked.value;
  if (!t) return <NoYear />;
  const ref = refDay(t);
  const stats = ref ? yearStats(t, ref) : null;
  return (
    <div class="stack">
      <section class="card">
        <h3 class="card-title">📈 Day score</h3>
        <Heatmap t={t} weekStart={weekStart.value} label={`Day scores in ${t.year}`} cell={dayCell(t)} />
        <HeatLegend />
      </section>
      <div class="habit-maps">
        {t.habits.map((h) => {
          const hs = stats?.habits.find((x) => x.habit.id === h.id);
          return (
            <section class="card">
              <div class="card-head">
                <h3>{label(h)}{h.goal && <span class="muted small"> {goalText(h)}</span>}</h3>
                {hs && hs.days > 0 && <span class="muted small">{plural(hs.met, "day")} of {hs.days} ({percent(hs.rate)})</span>}
              </div>
              <Heatmap t={t} weekStart={weekStart.value} compact label={`${h.name} in ${t.year}`} cell={(d) => {
                if (!isActive(h, d)) return { level: null, text: `${h.name} didn't count` };
                const v = t.days.get(d)?.values[h.id];
                const met = meets(h, v);
                if (!t.days.has(d)) return { level: null, text: "nothing logged" };
                const shown = v === undefined ? "not done" : h.kind === "check" ? "done" : formatValue(h, v);
                return { level: met ? 5 : 0, text: `${h.name}: ${shown}${h.kind !== "check" && v !== undefined ? (met ? " (met)" : " (missed)") : ""}` };
              }} />
            </section>
          );
        })}
      </div>
      <p class="muted small">In the habit maps, a dark day met the habit and a pale one didn't.</p>
    </div>
  );
}
