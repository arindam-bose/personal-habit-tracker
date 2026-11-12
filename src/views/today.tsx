// The day log, at the top of the Dashboard: log a day. A card per habit (tap a check, type a time or a number), the day's score,
// a note, and a strip of the week to move between days. The Week view is a table of the whole
// week, for catching up on several days at once.

import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { WEEKDAYS_SHORT, addDays, longDate, shortDate, weekOf, weekday } from "../dates";
import { formatMinutes, formatValue, goalShort, goalText, isActive, label, meets, parseCount, parseDuration } from "../habits";
import { dayScore, firstDay, habitStreakAcross, level, percent } from "../score";
import { chain, current, readOnly, selectedDay, setNote, setValue, today, tracked, weekStart } from "../state";
import type { Habit, IsoDate } from "../types";
import { NoYear, ScoreBar, mode, setMode } from "./common";
import { Help } from "./help";
import { Icon } from "./icons";

/** Why a day can't be logged, or null when it can. */
function lockedReason(date: IsoDate, start: IsoDate, closed: boolean, year: number): string | null {
  if (closed) return `${year} is closed, so it can only be looked at. Reopen it on the Settings page to change it.`;
  if (date < start) return `Tracking starts on ${longDate(start)}.`;
  if (date > today.value) return "This day hasn't come yet.";
  return null;
}

/** Report a save that failed, in words. */
function failed(err: unknown): void {
  alert(err instanceof Error ? err.message : String(err));
}

export function TodayView() {
  const data = current.value;
  const t = tracked.value;

  // Keys: ← → move a day, T goes to today.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || mode.value !== "day") return;
      const el = e.target as HTMLElement;
      // Not while typing, in a dialog, on the cookie question or on a ?: the keys belong there.
      if (el.closest("input, textarea, select, dialog, .consent, .help")) return;
      const t = tracked.value;
      if (!t) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const next = addDays(selectedDay.value, e.key === "ArrowLeft" ? -1 : 1);
        if (next.startsWith(`${t.year}-`)) selectedDay.value = next;
        e.preventDefault();
      } else if (e.key === "t" || e.key === "T") {
        if (today.value.startsWith(`${t.year}-`)) selectedDay.value = today.value;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!data || !t) return <NoYear />;
  const { year } = data.setup;
  // Keep the day inside the open year.
  let date = selectedDay.value;
  if (!date.startsWith(`${year}-`)) date = today.value.startsWith(`${year}-`) ? today.value : `${year}-12-31`;

  const inYear = (d: IsoDate) => d.startsWith(`${year}-`);
  // A week that runs over New Year moves to the year's first or last day, not outside the year.
  const go = (d: IsoDate) => (selectedDay.value = d < `${year}-01-01` ? `${year}-01-01` : d > `${year}-12-31` ? `${year}-12-31` : d);
  const week = weekOf(date, weekStart.value);

  return (
    <div class="today">
      <div class="day-nav">
        <button type="button" class="icon-action" aria-label={mode.value === "day" ? "The day before" : "The week before"}
          disabled={!inYear(addDays(mode.value === "day" ? date : week, -1))}
          onClick={() => go(addDays(date, mode.value === "day" ? -1 : -7))}><Icon name="left" /></button>
        <h2 class="day-title">
          {mode.value === "day" ? longDate(date) : `Week of ${shortDate(week)}`}
          {date === today.value && mode.value === "day" && <span class="badge today-badge">Today</span>}
        </h2>
        <button type="button" class="icon-action" aria-label={mode.value === "day" ? "The day after" : "The week after"}
          disabled={!inYear(addDays(mode.value === "day" ? date : addDays(week, 6), 1))}
          onClick={() => go(addDays(date, mode.value === "day" ? 1 : 7))}><Icon name="right" /></button>
        <input type="date" aria-label="Go to a day" value={date} min={`${year}-01-01`} max={`${year}-12-31`}
          onChange={(e) => e.currentTarget.value && go(e.currentTarget.value)} />
        {date !== today.value && inYear(today.value) && (
          <button type="button" onClick={() => go(today.value)}>Today</button>
        )}
        {/* The ? rides with the Day/Week switch, at the row's right end, so its tip opens on screen. */}
        <div class="day-nav-end">
          <div class="segmented view-mode" role="group" aria-label="View">
            <button type="button" class={mode.value === "day" ? "active" : ""} aria-pressed={mode.value === "day"} onClick={() => setMode("day")}>Day</button>
            <button type="button" class={mode.value === "week" ? "active" : ""} aria-pressed={mode.value === "week"} onClick={() => setMode("week")}>Week</button>
          </div>
          <Help label="About the day log">Times are typed as h:mm (7:45). Leaving a box saves it.</Help>
        </div>
      </div>
      <WeekStrip date={date} week={week} year={year} onPick={go} />
      {mode.value === "day" ? <DayCard date={date} /> : <WeekTable week={week} />}
    </div>
  );
}

/** The seven days of the week, each shaded by its score; the chosen one is outlined. */
function WeekStrip(props: { date: IsoDate; week: IsoDate; year: number; onPick: (d: IsoDate) => void }) {
  const t = tracked.value!;
  const start = firstDay(t);
  return (
    <div class="week-strip" role="group" aria-label="This week">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const d = addDays(props.week, i);
        const out = !d.startsWith(`${props.year}-`);
        const come = d <= today.value && d >= start && !out;
        const s = come ? dayScore(t, d) : null;
        const logged = t.days.has(d);
        const lvl = come && logged ? level(s?.score ?? null) : null;
        return (
          <button type="button" class={`week-day ${d === props.date ? "chosen" : ""} ${d === today.value ? "is-today" : ""}`}
            disabled={out} aria-pressed={d === props.date}
            aria-label={`${longDate(d)}${come ? `: ${logged && s ? percent(s.score) : "nothing logged"}` : ""}`}
            onClick={() => props.onPick(d)}>
            <span class="wd-name">{WEEKDAYS_SHORT[(i + weekStart.value) % 7]}</span>
            <span class="wd-num">{Number(d.slice(8))}</span>
            <span class={`wd-dot ${lvl === null ? "hm-none" : `hm-${lvl}`}`} />
          </button>
        );
      })}
    </div>
  );
}

function DayCard({ date }: { date: IsoDate }) {
  const data = current.value!;
  const t = tracked.value!;
  const habits = t.habits.filter((h) => isActive(h, date));
  const day = t.days.get(date);
  const locked = lockedReason(date, firstDay(t), readOnly.value, t.year);
  const isToday = date === today.value;

  if (!data.setup.habits.length) {
    return (
      <section class="panel empty-state">
        <p>{data.setup.year} has no habits yet. <a href="#/habits">Add your habits on the Habits page</a>.</p>
      </section>
    );
  }

  return (
    <div class="day-card">
      {/* The day's score is the first tile below the separator. */}
      {locked && <p class="muted small locked">{locked}</p>}
      <ul class="habit-cards">
        {habits.map((h) => (
          <HabitCard key={`${date}-${h.id}`} habit={h} date={date} value={day?.values[h.id]} locked={!!locked}
            streak={isToday ? habitStreakAcross(chain.value, h.id, date).current : null} />
        ))}
      </ul>
      <NoteField key={date} date={date} note={day?.note ?? ""} locked={!!locked} />
    </div>
  );
}

function HabitCard(props: { habit: Habit; date: IsoDate; value: true | number | undefined; locked: boolean; streak: number | null }) {
  const { habit, date, value, locked } = props;
  const met = meets(habit, value);
  const streak = props.streak ? <span class="streak" title={`${props.streak} days in a row`}>🔥 {props.streak}</span> : null;

  if (habit.kind === "check") {
    return (
      <li>
        <button type="button" class={`habit-card check ${met ? "met" : ""}`} aria-pressed={met} disabled={locked}
          onClick={() => setValue(date, habit.id, met ? null : true).catch(failed)}>
          <span class="hc-emoji" aria-hidden="true">{habit.emoji}</span>
          <span class="hc-name">{habit.name}</span>
          {streak}
          <span class="hc-tick" aria-hidden="true">{met ? "✓" : ""}</span>
        </button>
      </li>
    );
  }
  return (
    <li>
      <div class={`habit-card measure ${met ? "met" : value !== undefined ? "missed" : ""} ${locked ? "locked" : ""}`} aria-disabled={locked || undefined}>
        <span class="hc-emoji" aria-hidden="true">{habit.emoji}</span>
        <span class="hc-name">
          {habit.name}
          {habit.goal && <span class="hc-goal">{goalText(habit)}</span>}
        </span>
        {streak}
        <ValueInput habit={habit} date={date} value={value} locked={locked} />
        <span class="hc-tick" aria-hidden="true">{met ? "✓" : value !== undefined ? "✗" : ""}</span>
      </div>
    </li>
  );
}

/** A time or number box. Saves on Enter or on leaving it; empty clears the day's value. */
function ValueInput(props: { habit: Habit; date: IsoDate; value: true | number | undefined; locked: boolean; compact?: boolean }) {
  const { habit, date, value } = props;
  const shown = typeof value === "number" ? (habit.kind === "duration" ? formatMinutes(value) : String(value)) : "";
  const text = useSignal(shown);
  const bad = useSignal(false);
  // A save elsewhere (or another day) shows here.
  useEffect(() => {
    text.value = shown;
    bad.value = false;
  }, [shown]);

  function save() {
    const raw = text.value.trim();
    if (raw === shown) return;
    const parsed = raw === "" ? null : habit.kind === "duration" ? parseDuration(raw) : parseCount(raw);
    if (raw !== "" && parsed === null) {
      bad.value = true;
      return;
    }
    bad.value = false;
    setValue(date, habit.id, parsed).catch(failed);
  }

  const hint = habit.kind === "duration" ? "h:mm" : habit.unit ?? "";
  return (
    <input type="text" inputMode={habit.kind === "duration" ? "text" : "decimal"} class={`value-input ${bad.value ? "invalid" : ""}`}
      aria-label={`${label(habit)}${habit.goal ? `, ${goalText(habit)}` : ""}`} aria-invalid={bad.value}
      title={bad.value ? (habit.kind === "duration" ? "Type a time like 7:45, 7h45 or 7.75" : "Type a number") : undefined}
      placeholder={props.compact ? "" : hint} value={text.value} disabled={props.locked}
      onInput={(e) => (text.value = e.currentTarget.value)} onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          text.value = shown;
          bad.value = false;
        }
      }} />
  );
}

function NoteField(props: { date: IsoDate; note: string; locked: boolean }) {
  const text = useSignal(props.note);
  useEffect(() => void (text.value = props.note), [props.note]);
  return (
    <label class="note-field">
      <span class="field-label">📝 Notes</span>
      <textarea rows={2} value={text.value} disabled={props.locked} placeholder={props.locked ? "" : "Anything worth remembering about the day"}
        onInput={(e) => (text.value = e.currentTarget.value)}
        onBlur={() => text.value.trim() !== props.note && setNote(props.date, text.value).catch(failed)} />
    </label>
  );
}

/** The week as a table: a row per day, a column per habit, like a paper tracker. */
function WeekTable({ week }: { week: IsoDate }) {
  const t = tracked.value!;
  const start = firstDay(t);
  const dates = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(week, i)).filter((d) => d.startsWith(`${t.year}-`));
  const habits = t.habits.filter((h) => dates.some((d) => isActive(h, d)));
  if (!habits.length) return <section class="panel empty-state"><p>No habits count this week. <a href="#/habits">Add your habits</a>.</p></section>;
  return (
    <section class="panel week-table-panel">
      <div class="table-scroll">
        <table class="week-table">
          <thead>
            <tr>
              <th scope="col">Day</th>
              {habits.map((h) => (
                <th scope="col" title={`${h.name}${h.goal ? ` (${goalText(h)})` : ""}`}>
                  <span class="wt-emoji">{h.emoji || h.name.slice(0, 2)}</span>
                  <span class="wt-name">{h.name}</span>
                  {h.goal && <span class="wt-goal">{goalShort(h)}</span>}
                </th>
              ))}
              <th scope="col" class="num">Score</th>
            </tr>
          </thead>
          <tbody>
            {dates.map((d) => {
              const locked = lockedReason(d, start, readOnly.value, t.year);
              const day = t.days.get(d);
              const s = d <= today.value && d >= start ? dayScore(t, d) : null;
              return (
                <tr class={d === today.value ? "is-today" : ""}>
                  <th scope="row">
                    <button type="button" class="link" onClick={() => {
                      selectedDay.value = d;
                      setMode("day");
                    }} title={day?.note ? `Note: ${day.note}` : "Open the day"}>
                      {WEEKDAYS_SHORT[weekday(d)]} {Number(d.slice(8))}
                    </button>
                    {day?.note && <span class="wt-note" title={day.note} aria-label={`Note: ${day.note}`}>📝</span>}
                  </th>
                  {habits.map((h) => {
                    if (!isActive(h, d)) return <td class="wt-off" aria-label="Doesn't count this day">·</td>;
                    const v = day?.values[h.id];
                    const met = meets(h, v);
                    return (
                      <td class={met ? "met" : v !== undefined ? "missed" : ""}>
                        {h.kind === "check" ? (
                          <input type="checkbox" checked={v === true} disabled={!!locked} aria-label={`${h.name}, ${longDate(d)}`}
                            onChange={(e) => setValue(d, h.id, e.currentTarget.checked ? true : null).catch(failed)} />
                        ) : locked && v !== undefined ? (
                          <span>{formatValue(h, v)}</span>
                        ) : (
                          <ValueInput habit={h} date={d} value={v} locked={!!locked} compact />
                        )}
                      </td>
                    );
                  })}
                  <td class="num">
                    {s && <><span class="wt-score">{percent(s.score)}</span><ScoreBar score={s.score} /></>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
