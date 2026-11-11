// Habits: the open year's habits. Add one, change it, move it up or down, stop it (it no longer
// counts from the next day) or delete it with everything logged for it. Also the day tracking starts.

import { useSignal } from "@preact/signals";
import { longDate } from "../dates";
import { formatMinutes, goalText, habitId, label, parseCount, parseDuration } from "../habits";
import { firstDay } from "../score";
import { SetupError, valueCounts } from "../setup";
import { current, moveHabit, readOnly, removeHabit, saveHabit, setStart, today } from "../state";
import type { Goal, Habit, HabitKind } from "../types";
import { NoYear, plural } from "./common";
import { IconButton } from "./icons";

const KIND_NAMES: Record<HabitKind, string> = { check: "Done / not done", duration: "Time (h:mm)", number: "Number" };
const EMOJIS = ["⏰", "🧘", "🏋️", "🏃", "🚶", "🚴", "🏊", "❄️", "📖", "🎓", "✍️", "🎸", "💧", "🥗", "🍎", "💊", "🚭", "🚫", "🍺", "☕", "💤", "📱", "💻", "🧹", "💰", "🙏", "🌞", "🦷"];

export function HabitsView() {
  const data = current.value;
  const editing = useSignal<Habit | "new" | null>(null);
  const asking = useSignal<string | null>(null);
  if (!data) return <NoYear />;
  const { setup } = data;
  const counts = valueCounts(data.days);
  const locked = readOnly.value;
  const inYear = today.value.startsWith(`${setup.year}-`);

  async function stop(h: Habit) {
    try {
      await saveHabit({ ...h, to: today.value });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }
  async function resume(h: Habit) {
    const { to: _to, ...rest } = h;
    await saveHabit(rest);
  }

  return (
    <div class="stack">
      <section class="card">
        <div class="card-head">
          <div>
            <h3>Habits in {setup.year}</h3>
            <p class="muted small">Each day's score is the share of these habits met that day. The order here is the order on Today.</p>
          </div>
          {!locked && editing.value !== "new" && <button type="button" class="primary" onClick={() => (editing.value = "new")}>+ Add habit</button>}
        </div>
        {locked && <p class="muted">{setup.year} is closed, so its habits can't change. Reopen it on the Settings page to change them.</p>}
        {editing.value === "new" && <HabitForm onDone={() => (editing.value = null)} />}
        {setup.habits.length === 0 && editing.value !== "new" && <p class="muted">No habits yet. Add the first one.</p>}
        <ul class="habit-list">
          {setup.habits.map((h, i) => (
            <li class={h.to && h.to < today.value ? "stopped" : ""}>
              {editing.value !== "new" && editing.value?.id === h.id ? (
                <HabitForm habit={h} onDone={() => (editing.value = null)} />
              ) : (
                <div class="habit-row">
                  <span class="hr-emoji" aria-hidden="true">{h.emoji}</span>
                  <span class="hr-main">
                    <span class="hr-name">{h.name}</span>
                    <span class="muted small">
                      {[
                        h.kind === "check" ? "Done / not done" : h.goal ? goalText(h) : KIND_NAMES[h.kind],
                        h.from ? `from ${longDate(h.from)}` : "",
                        h.to ? `${h.to < today.value ? "stopped after" : "until"} ${longDate(h.to)}` : "",
                        plural(counts.get(h.id) ?? 0, "day") + " logged",
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {!locked && (
                    asking.value === h.id ? (
                      <span class="row-actions asking">
                        <span>Delete {h.name}{counts.get(h.id) ? ` and its ${plural(counts.get(h.id)!, "logged day")}` : ""}?</span>
                        <button type="button" class="danger-solid" onClick={() => { asking.value = null; removeHabit(h.id); }}>Delete</button>
                        <button type="button" onClick={() => (asking.value = null)}>Cancel</button>
                      </span>
                    ) : (
                      <span class="row-actions">
                        <IconButton icon="up" label={`Move ${h.name} up`} onClick={() => i > 0 && moveHabit(h.id, -1)} />
                        <IconButton icon="down" label={`Move ${h.name} down`} onClick={() => i < setup.habits.length - 1 && moveHabit(h.id, 1)} />
                        <IconButton icon="edit" label={`Change ${h.name}`} onClick={() => (editing.value = h)} />
                        {h.to ? (
                          <IconButton icon="resume" label={`Count ${h.name} again`} title={`Count ${h.name} again, to the end of the year`} onClick={() => resume(h)} />
                        ) : inYear && (
                          <IconButton icon="stop" label={`Stop ${h.name}`} title={`Stop ${h.name} after today: later days don't count it`} onClick={() => stop(h)} />
                        )}
                        <IconButton icon="delete" danger label={`Delete ${h.name}`} title={`Delete ${h.name} and everything logged for it`} onClick={() => (asking.value = h.id)} />
                      </span>
                    )
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        <p class="muted small">
          Stop a habit you're giving up: its days so far keep counting, later days don't. Delete it only to
          remove it with everything logged for it.
        </p>
      </section>
      <StartCard />
    </div>
  );
}

/** Add a habit (no `habit`) or change one. */
function HabitForm(props: { habit?: Habit; onDone: () => void }) {
  const data = current.value!;
  const old = props.habit;
  const emoji = useSignal(old?.emoji ?? "");
  const name = useSignal(old?.name ?? "");
  const kind = useSignal<HabitKind>(old?.kind ?? "check");
  const op = useSignal<Goal["op"]>(old?.goal?.op ?? "atLeast");
  const goal = useSignal(old?.goal ? (old.kind === "duration" ? formatMinutes(old.goal.value) : String(old.goal.value)) : "");
  const unit = useSignal(old?.unit ?? "");
  // A habit added once days are logged counts from today, so it doesn't lower the days before.
  const start = firstDay(data.setup);
  const defaultFrom = !old && data.days.length > 0 && today.value > start && today.value.startsWith(`${data.setup.year}-`) ? today.value : "";
  const from = useSignal(old?.from ?? defaultFrom);
  const to = useSignal(old?.to ?? "");
  const error = useSignal<string | null>(null);
  const logged = old ? valueCounts(data.days).get(old.id) ?? 0 : 0;

  async function submit(e: Event) {
    e.preventDefault();
    let g: Goal | undefined;
    if (kind.value !== "check" && goal.value.trim()) {
      const value = kind.value === "duration" ? parseDuration(goal.value) : parseCount(goal.value);
      if (value === null) {
        error.value = kind.value === "duration" ? "Type the goal as a time, like 7:30." : "Type the goal as a number.";
        return;
      }
      g = { op: op.value, value };
    }
    const id = old?.id ?? habitId(name.value, (x) => data.setup.habits.some((h) => h.id === x));
    try {
      await saveHabit({
        id, name: name.value, emoji: emoji.value, kind: kind.value,
        ...(g ? { goal: g } : {}), ...(unit.value.trim() ? { unit: unit.value } : {}),
        ...(from.value ? { from: from.value } : {}), ...(to.value ? { to: to.value } : {}),
      });
      props.onDone();
    } catch (err) {
      error.value = err instanceof SetupError || err instanceof Error ? err.message : String(err);
    }
  }

  const y = data.setup.year;
  return (
    <form class="habit-form" onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && props.onDone()}>
      <div class="fields">
        <label class="field w-emoji">
          <span class="field-label">Emoji</span>
          <input type="text" value={emoji.value} maxLength={8} onInput={(e) => (emoji.value = e.currentTarget.value)} />
        </label>
        <label class="field w-name">
          <span class="field-label">Name</span>
          <input type="text" value={name.value} required autofocus placeholder="e.g. Meditation" onInput={(e) => (name.value = e.currentTarget.value)} />
        </label>
        <label class="field">
          <span class="field-label">Logged as</span>
          <select value={kind.value} disabled={logged > 0} title={logged > 0 ? "It has days logged, so it stays as it is." : undefined}
            onChange={(e) => (kind.value = e.currentTarget.value as HabitKind)}>
            {(Object.keys(KIND_NAMES) as HabitKind[]).map((k) => <option value={k}>{KIND_NAMES[k]}</option>)}
          </select>
        </label>
        {kind.value !== "check" && (
          <>
            <label class="field">
              <span class="field-label">Met when it's</span>
              <select value={op.value} onChange={(e) => (op.value = e.currentTarget.value as Goal["op"])}>
                <option value="atLeast">at least</option>
                <option value="atMost">at most</option>
              </select>
            </label>
            <label class="field w-goal">
              <span class="field-label">Goal</span>
              <input type="text" inputMode={kind.value === "number" ? "decimal" : "text"} value={goal.value}
                placeholder={kind.value === "duration" ? "7:30" : "8"} onInput={(e) => (goal.value = e.currentTarget.value)} />
            </label>
            {kind.value === "number" && (
              <label class="field w-unit">
                <span class="field-label">Unit</span>
                <input type="text" value={unit.value} placeholder="glasses" onInput={(e) => (unit.value = e.currentTarget.value)} />
              </label>
            )}
          </>
        )}
        <label class="field">
          <span class="field-label">Counts from</span>
          <input type="date" value={from.value} min={`${y}-01-01`} max={`${y}-12-31`} onChange={(e) => (from.value = e.currentTarget.value)} />
        </label>
        <label class="field">
          <span class="field-label">Counts until</span>
          <input type="date" value={to.value} min={`${y}-01-01`} max={`${y}-12-31`} onChange={(e) => (to.value = e.currentTarget.value)} />
        </label>
      </div>
      <div class="emoji-picks" role="group" aria-label="Pick an emoji">
        {EMOJIS.map((x) => <button type="button" class={emoji.value === x ? "active" : ""} onClick={() => (emoji.value = x)}>{x}</button>)}
      </div>
      <p class="muted small">
        {kind.value === "check" ? "Tick it on the days you do it." : `Type the day's ${kind.value === "duration" ? "time as h:mm" : "number"}; without a goal, any value logged counts as met.`}
        {" "}Leave both days empty to count it all year; days outside them neither score it nor break its streak.
      </p>
      {error.value && <p class="form-error" role="alert">{error.value}</p>}
      <div class="form-actions">
        <button type="submit" class="primary">{old ? "Save" : `Add ${label({ emoji: emoji.value, name: name.value || "habit" })}`}</button>
        <button type="button" onClick={props.onDone}>Cancel</button>
      </div>
    </form>
  );
}

/** When tracking starts this year: January 1, or a later day for a year begun partway. */
function StartCard() {
  const data = current.value!;
  const error = useSignal<string | null>(null);
  const { setup } = data;
  return (
    <section class="card">
      <h3>Tracking starts</h3>
      <p class="muted small">Days before it don't count toward any score. Most years start on January 1.</p>
      <div class="setting-row">
        <input type="date" aria-label="Tracking starts on" value={firstDay(setup)} min={`${setup.year}-01-01`} max={`${setup.year}-12-31`}
          disabled={readOnly.value}
          onChange={async (e) => {
            try {
              error.value = null;
              await setStart(e.currentTarget.value || null);
            } catch (err) {
              error.value = err instanceof Error ? err.message : String(err);
              e.currentTarget.value = firstDay(current.value!.setup);
            }
          }} />
        {setup.start && !readOnly.value && <button type="button" onClick={() => setStart(null)}>From January 1</button>}
      </div>
      {error.value && <p class="form-error" role="alert">{error.value}</p>}
    </section>
  );
}
