// Small pieces the pages share: the notice when no year is stored, a score bar, and the year heatmap.

import { signal, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { MONTHS_SHORT, WEEKDAYS_SHORT, addDays, dateRange, longDate, weekOf } from "../dates";
import { firstDay, lastDay, percent, type Tracked } from "../score";
import { selectedDay, today, years } from "../state";
import type { IsoDate } from "../types";

/** Shown on every page but Settings until a year is started or imported. */
export function NoYear() {
  return (
    <section class="panel empty-state">
      <h2>Welcome to Habit Tracker</h2>
      <p>
        Track your daily habits for a year, January to December: tick them off each day, and see your
        scores, streaks, heatmaps and monthly reports.
      </p>
      <p>
        {years.value.length ? "Pick a year in the top bar, or " : ""}
        <a href="#/settings">start a year or import a backup on the Settings page</a>.
      </p>
    </section>
  );
}

// The day log's Day or Week view (at the top of the Dashboard).
const MODE_KEY = "habit-tracker-today-mode";
const savedMode = (): "day" | "week" => {
  try {
    return sessionStorage.getItem(MODE_KEY) === "week" ? "week" : "day";
  } catch {
    return "day";
  }
};

/** Day or Week: lasts until the tab is closed. */
export const mode = signal<"day" | "week">(savedMode());

export function setMode(m: "day" | "week") {
  mode.value = m;
  try {
    sessionStorage.setItem(MODE_KEY, m);
  } catch {
    // Not kept; it still applies until the tab closes.
  }
}

/** The day the open year's figures go up to: today, December 31 for a past year, null for a year to come. */
export function refDay(t: Tracked): IsoDate | null {
  return lastDay(t, today.value);
}

/** Open a day in the log at the top of the Dashboard. */
export function openDay(date: IsoDate): void {
  selectedDay.value = date;
  setMode("day");
  // From the Dashboard itself the address doesn't change, so scroll up here too.
  if (location.hash === "#/dashboard" || location.hash === "#/" || location.hash === "") window.scrollTo(0, 0);
  else location.hash = "#/dashboard";
}

/** A thin bar filled to a score out of 100. */
export function ScoreBar(props: { score: number | null; label?: string }) {
  const s = props.score ?? 0;
  return (
    <span class={`score-bar ${s >= 100 ? "full" : ""}`} role="img" aria-label={props.label ?? `${percent(props.score)}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, s))}%` }} />
    </span>
  );
}

export interface Cell {
  /** 0 to 5 (see score.level), or null for a day with nothing to show. */
  level: number | null;
  /** What the day holds, in words, for the line under the map and screen readers. */
  text: string;
}

const CELL = 12;
const GAP = 3;
const LEFT = 28;
const TOP = 16;

/**
 * A year as a grid of days: a column per week, a row per weekday, each day shaded by `cell`.
 * Pointing at (or tabbing to) a day says what it holds under the map; clicking opens it in the day log.
 */
export function Heatmap(props: { t: Tracked; weekStart: 0 | 1; cell: (date: IsoDate) => Cell; label: string; compact?: boolean }) {
  const { t, weekStart } = props;
  const hover = useSignal<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const first = `${t.year}-01-01`;
  const gridStart = weekOf(first, weekStart);
  const end = `${t.year}-12-31`;
  const weeks = Math.ceil((dateRange(gridStart, end).length) / 7);
  const last = lastDay(t, today.value);
  const start = firstDay(t);
  const width = LEFT + weeks * (CELL + GAP);
  const height = TOP + 7 * (CELL + GAP);
  const rows = [0, 1, 2, 3, 4, 5, 6].map((r) => (r + weekStart) % 7);

  const cells: ComponentChildren[] = [];
  const monthLabels: ComponentChildren[] = [];
  for (let w = 0; w < weeks; w++) {
    for (let r = 0; r < 7; r++) {
      const date = addDays(gridStart, w * 7 + r);
      if (date < first || date > end) continue;
      if (date.endsWith("-01") && r < 7) {
        const m = Number(date.slice(5, 7)) - 1;
        // The label sits over the first full week of the month.
        const col = r === 0 ? w : w + 1;
        monthLabels.push(<text x={LEFT + col * (CELL + GAP)} y={10} class="hm-label">{MONTHS_SHORT[m]}</text>);
      }
      const tracked = date >= start && last !== null && date <= last;
      const c = tracked ? props.cell(date) : null;
      const lvl = c?.level ?? null;
      const text = c ? `${longDate(date)}: ${c.text}` : `${longDate(date)}: ${date > (last ?? "") ? "to come" : "not tracked"}`;
      cells.push(
        <rect x={LEFT + w * (CELL + GAP)} y={TOP + r * (CELL + GAP)} width={CELL} height={CELL} rx={2}
          class={`hm-cell ${lvl === null ? (tracked ? "hm-none" : "hm-off") : `hm-${lvl}`} ${date === today.value ? "hm-today" : ""}`}
          tabIndex={tracked ? 0 : -1} role={tracked ? "button" : undefined} aria-label={text}
          onMouseEnter={() => (hover.value = text)} onFocus={() => (hover.value = text)}
          onClick={() => tracked && openDay(date)}
          onKeyDown={(e) => tracked && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openDay(date))}>
          <title>{text}</title>
        </rect>,
      );
    }
  }

  // On a narrow screen the map scrolls sideways: start it at the latest day, not at January.
  useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth || last === null) return;
    const share = (dateRange(gridStart, last).length / 7 + 2) / weeks;
    el.scrollLeft = Math.max(0, share * el.scrollWidth - el.clientWidth);
  }, [t.year, last]);

  return (
    <div class={`heatmap ${props.compact ? "compact" : ""}`}>
      <div class="heatmap-scroll" ref={scroller}>
        <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={props.label} onMouseLeave={() => (hover.value = null)}>
          {monthLabels}
          {[1, 3, 5].map((r) => <text x={0} y={TOP + r * (CELL + GAP) + CELL - 2} class="hm-label">{WEEKDAYS_SHORT[rows[r]!]}</text>)}
          {cells}
        </svg>
      </div>
      <p class="heatmap-detail small muted" aria-live="polite">{hover.value ?? (props.compact ? "" : "Point at a day to see it; click it to open it.")}</p>
    </div>
  );
}

/** The heatmap's key: what each shade means. */
export function HeatLegend(props: { labels?: [string, string]; perfect?: string }) {
  return (
    <div class="heat-legend small muted" aria-hidden="true">
      <span>{props.labels?.[0] ?? "0%"}</span>
      {[0, 1, 2, 3, 4, 5].map((l) => <span class={`hm-key hm-${l}`} />)}
      <span>{props.labels?.[1] ?? "100%"}</span>
      <span class="hm-key hm-none" /> <span>Nothing logged</span>
    </div>
  );
}

/** "1 day", "12 days". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
