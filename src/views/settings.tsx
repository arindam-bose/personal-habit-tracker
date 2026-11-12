// Settings: your data, a year per row (back up, close, reopen, delete; the year picker in the top
// bar opens one), importing a backup, starting a year, a demo file, the first day of the week,
// light or dark, the offline copy, erasing everything, the home screen, Support, and About.

import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { importYear, readJsonFile, saveYearFile } from "../backup";
import { dateTime } from "../dates";
import { demoFileName, demoYear } from "../demo";
import { detectDevice } from "../device";
import { STARTER_HABITS, label } from "../habits";
import { installState, installSteps, promptInstall, type InstallState } from "../install";
import { checkForUpdates, offlineChanged, offlineStatus, updateReady } from "../offline";
import {
  backUpYear, closeYear, current, eraseEverything, openYear, persistState, removeYear, reopenYear,
  saveWeekStart, startYear, today, weekStart, years, type YearSummary,
} from "../state";
import { backupText, lastUpdatedAt, requestPersistence } from "../storage";
import { setTheme, themeChoice, type ThemeChoice } from "../theme";
import type { Habit, YearFile } from "../types";
import { validateYearFile } from "../validate";
import { AboutCard } from "./about";
import { plural } from "./common";
import { IconButton } from "./icons";
import { Modal } from "./modal";
import { SupportCard } from "./support";

const MAY_CLEAR = "This browser may clear your data on its own - if the site goes unvisited for a while, or space runs low - so keep a backup.";
const PERSIST_TEXT = {
  persisted: "This browser has agreed to keep your data until you clear it yourself.",
  "not-persisted": MAY_CLEAR,
  unsupported: MAY_CLEAR,
};

/** An import waiting on "Replace?": the file, as read and checked, the year it would replace, and the answer to give. */
interface PendingReplace {
  /** Counts the questions, so each one gets a dialog of its own. */
  id: number;
  fileName: string;
  file: YearFile;
  stored: YearSummary;
  answer: (replace: boolean) => void;
}

/**
 * The question before an import replaces a stored year: what is here now and what the file holds,
 * side by side, with the rows that differ highlighted. Esc, Cancel or a click on the backdrop keeps
 * the stored year. As in the Money Tracker.
 */
function ReplaceDialog(props: { pending: PendingReplace }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const { fileName, file, stored, answer } = props.pending;
  const at = new Date(file.exportedAt);
  const exported = Number.isNaN(at.getTime())
    ? "No export date"
    : `Exported ${at.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
  // The latest change of either kind, days or setup, as the strip under the top bar shows it.
  // A file without one was saved before any change, so anything changed here is newer.
  const here = lastUpdatedAt(stored.setup);
  const there = lastUpdatedAt(file);
  // To the second, as the table shows them: a warning under a row that reads the same would confuse.
  const newerHere = here !== undefined && (there === undefined || toSecond(here) > toSecond(there));
  const rows: { label: string; now: string; inFile: string; compare: boolean }[] = [
    { label: "Days logged", now: stored.days.toLocaleString(), inFile: file.days.length.toLocaleString(), compare: true },
    { label: "Habits", now: stored.setup.habits.length.toLocaleString(), inFile: file.habits.length.toLocaleString(), compare: true },
    { label: "Last updated", now: updatedText(here), inFile: updatedText(there), compare: true },
    // A backup and an export are different events, so this row is context, never a difference.
    { label: "Backup", now: backupText(stored.setup.lastBackupAt), inFile: exported, compare: false },
  ];
  // Answered once, however the dialog closes: Replace answers yes, and the close that follows is ignored.
  const answered = useRef(false);
  const reply = (replace: boolean) => {
    if (answered.current) return;
    answered.current = true;
    answer(replace);
  };
  // Leaving the page with the question open removes the dialog without a close event: that
  // counts as Cancel, or the import waiting on the answer would never go on.
  useEffect(() => () => reply(false), []);
  return (
    <Modal dialogRef={dialog} title={`Replace your ${file.year} data?`} onClose={() => reply(false)}>
      <p>"{fileName}" holds {file.year} too. Importing it replaces everything the tracker has for {file.year}.</p>
      <table class="compare">
        <thead>
          <tr>
            <th></th>
            <th>In the tracker</th>
            <th>In the file</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} class={r.compare && r.now !== r.inFile ? "differs" : undefined}>
              <th scope="row">{r.label}</th>
              <td>{r.now}</td>
              <td>{r.inFile}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {newerHere && <p class="warn">The tracker has newer changes than this file: replacing it loses them.</p>}
      <p class="muted">This can't be undone.</p>
      <div class="form-actions">
        <button type="button" onClick={() => dialog.current?.close()}>Cancel</button>
        <button type="button" class="danger-solid" onClick={() => reply(true)}>Replace {file.year}</button>
      </div>
    </Modal>
  );
}

let asked = 0;

const toSecond = (iso: string) => Math.floor(Date.parse(iso) / 1000);

/** With seconds: two backups taken minutes apart must still read differently. */
function updatedText(iso: string | undefined): string {
  return iso ? dateTime(iso, true) : "Unknown";
}

export function SettingsView() {
  const message = useSignal<string | null>(null);
  const errors = useSignal<string[]>([]);
  /** An import asking whether to replace a stored year. */
  const replacing = useSignal<PendingReplace | null>(null);

  /** Set when the page is left: an import still going stops asking, and stops. */
  const left = useRef(false);
  useEffect(() => () => void (left.current = true), []);

  /** Ask in the dialog; resolves with the answer once it closes, or no once the page is left. */
  function askReplace(fileName: string, stored: YearSummary, file: YearFile): Promise<boolean> {
    return new Promise((resolve) => {
      if (left.current) return resolve(false);
      replacing.value = { id: ++asked, fileName, stored, file, answer: (yes) => { replacing.value = null; resolve(yes); } };
    });
  }

  async function onImport(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = "";
    message.value = null;
    errors.value = [];
    const done: string[] = [];
    for (const f of files) {
      if (left.current) break;
      try {
        const data = await readJsonFile(f);
        const check = validateYearFile(data);
        if (!check.ok) {
          errors.value = [...errors.value, `${f.name}:`, ...check.errors];
          continue;
        }
        const stored = years.value.find((y) => y.setup.year === check.file.year);
        if (stored && !(await askReplace(f.name, stored, check.file))) continue;
        const r = await importYear(data);
        if (r.ok) done.push(`${r.file.year} (${plural(r.file.days.length, "day")} logged)`);
        await openYear(check.file.year);
      } catch (err) {
        errors.value = [...errors.value, err instanceof Error ? err.message : String(err)];
      }
    }
    if (done.length) message.value = `Imported ${done.join(", ")}.`;
  }

  return (
    <div class="stack settings">
      <section class="card">
        <h3 class="card-title">Your data</h3>
        {years.value.length ? <YearsTable /> : <p class="muted">Nothing stored yet. Start a year below, or import a backup.</p>}
        <div class="setting-row">
          <label class="button file-button">
            Import JSON
            <input type="file" accept=".json,application/json" multiple class="sr-only" onChange={onImport} />
          </label>
        </div>
        <DemoNote />
        {message.value && <p class="saved" role="status">{message.value}</p>}
        {errors.value.length > 0 && <ul class="errors" role="alert">{errors.value.map((x) => <li>{x}</li>)}</ul>}
      </section>
      {replacing.value && <ReplaceDialog key={replacing.value.id} pending={replacing.value} />}

      <StartYearCard />

      <section class="card">
        <h3 class="card-title">Weeks start on</h3>
        <div class="segmented" role="group" aria-label="Weeks start on">
          {([[1, "Monday"], [0, "Sunday"]] as const).map(([v, name]) => (
            <button type="button" class={weekStart.value === v ? "active" : ""} aria-pressed={weekStart.value === v} onClick={() => saveWeekStart(v)}>{name}</button>
          ))}
        </div>
        <p class="muted small">For the week strip and This week on the Dashboard, and the heatmaps' rows.</p>
      </section>

      <section class="card">
        <h3 class="card-title">Appearance</h3>
        <div class="segmented" role="group" aria-label="Appearance">
          {([["system", "System"], ["light", "Light"], ["dark", "Dark"]] as [ThemeChoice, string][]).map(([v, name]) => (
            <button type="button" class={themeChoice.value === v ? "active" : ""} aria-pressed={themeChoice.value === v} onClick={() => setTheme(v)}>{name}</button>
          ))}
        </div>
      </section>

      <OfflineCard />
      <EraseCard />
      <InstallCard />
      <SupportCard />
      <AboutCard />
    </div>
  );
}

/** The demo, offered inside a sentence that says what's in it. */
function DemoNote() {
  const year = Number(today.value.slice(0, 4));
  const have = years.value.some((y) => y.setup.year === year);
  return (
    <p class="muted small demo-download">
      New here?{" "}
      <button type="button" class="link demo-link" onClick={() => saveYearFile(demoYear(), demoFileName(year))}>Download a demo file</button>{" "}
      and import it to look around: this year so far, with eight habits to tick or fill in (sleep and screen
      time against their goals, and glasses of water added in April), good and bad stretches, and a few notes.
      {have && <> It is a {year} file, so importing it would replace your own {year} (you'll be asked first).</>}
    </p>
  );
}

function YearsTable() {
  const closing = useSignal<number | null>(null);
  const asking = useSignal<number | null>(null);
  return (
    <>
      <table class="years data-table">
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Logged</th>
            <th scope="col">Habits</th>
            <th scope="col">Backup</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {years.value.map((y) => {
            const { year, closed, habits, lastBackupAt } = y.setup;
            return (
              <tr>
                <td class="y-year">
                  {year}
                  {closed && <span class="badge">closed</span>}
                </td>
                <td class="y-count" data-label="Logged">{plural(y.days, "day")}</td>
                <td class="y-count" data-label="Habits">{habits.length}</td>
                <td class="y-backup">{backupText(lastBackupAt)}</td>
                <td class="y-actions">
                  {asking.value === year ? (
                    <span class="row-actions asking">
                      <span>Delete {year} and all {plural(y.days, "day")} logged? Import its backup to bring it back.</span>
                      <button type="button" class="danger-solid" onClick={() => { asking.value = null; removeYear(year); }}>Delete</button>
                      <button type="button" onClick={() => (asking.value = null)}>Cancel</button>
                    </span>
                  ) : (
                    <span class="row-actions">
                      <IconButton icon="export" label={`Back up ${year}`} title={`Download ${year} as a JSON file`} onClick={() => backUpYear(year)} />
                      {closed ? (
                        <IconButton icon="reopen" label={`Reopen ${year}`} title={`Reopen ${year}, to change it again`} onClick={() => reopenYear(year)} />
                      ) : (
                        <IconButton icon="close" label={`Close ${year}`} title={`Close ${year} and start ${year + 1}`} onClick={() => (closing.value = year)} />
                      )}
                      <IconButton icon="delete" danger label={`Delete ${year}`} onClick={() => (asking.value = year)} />
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {closing.value !== null && <ClosePanel year={closing.value} onDone={() => (closing.value = null)} />}
    </>
  );
}

/** Closing a year: what happens, then back up and close. */
function ClosePanel(props: { year: number; onDone: () => void }) {
  const { year } = props;
  const busy = useSignal(false);
  const error = useSignal<string | null>(null);
  const next = years.value.find((y) => y.setup.year === year + 1);
  const early = today.value < `${year}-12-31`;

  async function close() {
    busy.value = true;
    error.value = null;
    try {
      if (current.value?.setup.year !== year) await openYear(year);
      await backUpYear(year);
      await closeYear();
      props.onDone();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      busy.value = false;
    }
  }

  return (
    <div class="close-panel">
      <h3>Close {year}</h3>
      <ol>
        <li>{year} is downloaded as a backup.</li>
        <li>It becomes read-only: you can still look at it, and reopen it if you need to.</li>
        <li>
          {next
            ? `${year + 1} is already here: it keeps its habits and days, and takes the streaks running on December 31.`
            : `${year + 1} starts with the habits still counting on December 31, and the streaks running then carry on into it. Add more habits there on the Habits page.`}
        </li>
      </ol>
      {early && (
        <p class="warn">
          {year} isn't over yet: days after today can't be logged once it's closed, so they count as missed,
          and no streak carries into {year + 1}.
        </p>
      )}
      {error.value && <p class="form-error" role="alert">{error.value}</p>}
      <div class="form-actions">
        <button type="button" class="primary" disabled={busy.value} onClick={close}>Back up and close {year}</button>
        <button type="button" onClick={props.onDone}>Cancel</button>
      </div>
    </div>
  );
}

/** Start a year: which year, from which day, and with which habits. */
function StartYearCard() {
  const thisYear = Number(today.value.slice(0, 4));
  const stored = years.value.map((y) => y.setup.year);
  // Offered first: this year, then next year, then last year, whichever isn't stored yet.
  const preferred = [thisYear, thisYear + 1, thisYear - 1].filter((y) => !stored.includes(y));
  const choices = [...preferred].sort((a, b) => a - b);
  const year = useSignal<number | null>(null);
  const chosen = year.value !== null && choices.includes(year.value) ? year.value : preferred[0] ?? null;
  const source = years.value[0];
  // Until the user picks, these follow what's stored: the same habits as the newest year if there is one.
  const fromPick = useSignal<"copy" | "starter" | "none" | null>(null);
  const from = fromPick.value === "copy" && !source ? "starter" : fromPick.value ?? (source ? "copy" : "starter");
  const picked = useSignal<Set<string>>(new Set(STARTER_HABITS.map((h) => h.id)));
  const start = useSignal("");
  const error = useSignal<string | null>(null);
  // Open by itself only while nothing is stored; otherwise it waits for Start.
  const openPick = useSignal<boolean | null>(null);
  const open = openPick.value ?? years.value.length === 0;

  if (chosen === null) return null;
  if (!open) {
    return (
      <section class="card">
        <h3 class="card-title">Start a year</h3>
        <p class="muted">
          Track another year, from January 1 or any day you pick. It can begin with {source ? `the same habits as ${source.setup.year}, ` : ""}a
          starter set{source ? "," : ""} or none, and you can add, change and stop habits any time after.
        </p>
        <div class="setting-row">
          <button type="button" class="striped" onClick={() => (openPick.value = true)}>Start {chosen}…</button>
        </div>
      </section>
    );
  }

  const copyable = source?.setup.habits.filter((h) => h.to === undefined || h.to >= `${source.setup.year}-12-31`) ?? [];
  async function submit(e: Event) {
    e.preventDefault();
    error.value = null;
    const habits: Habit[] = from === "copy" ? copyable : from === "starter" ? STARTER_HABITS.filter((h) => picked.value.has(h.id)) : [];
    try {
      await startYear(chosen!, habits, start.value || null);
      openPick.value = null;
      location.hash = habits.length ? "#/dashboard" : "#/habits";
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <section class="card">
      <h3 class="card-title">Start a year</h3>
      <form class="start-form" onSubmit={submit}>
        <div class="fields">
          <label class="field">
            <span class="field-label">Year</span>
            <select value={chosen} onChange={(e) => (year.value = Number(e.currentTarget.value))}>
              {choices.map((y) => <option value={y}>{y}</option>)}
            </select>
          </label>
          <label class="field">
            <span class="field-label">Starting on (optional)</span>
            <input type="date" value={start.value} min={`${chosen}-01-01`} max={`${chosen}-12-31`} onChange={(e) => (start.value = e.currentTarget.value)} />
          </label>
        </div>
        <p class="muted small">Starting partway through the year? Pick the day you start: days before it don't count.</p>
        <fieldset class="choices">
          <legend class="field-label">Habits</legend>
          {source && (
            <label class="choice">
              <input type="radio" name="from" checked={from === "copy"} onChange={() => (fromPick.value = "copy")} />
              The same as {source.setup.year}: {copyable.map(label).join(", ") || "none"}
            </label>
          )}
          <label class="choice">
            <input type="radio" name="from" checked={from === "starter"} onChange={() => (fromPick.value = "starter")} />
            Pick from a starter set
          </label>
          {from === "starter" && (
            <div class="starter-picks">
              {STARTER_HABITS.map((h) => (
                <label class="check-row">
                  <input type="checkbox" checked={picked.value.has(h.id)} onChange={(e) => {
                    const next = new Set(picked.value);
                    if (e.currentTarget.checked) next.add(h.id);
                    else next.delete(h.id);
                    picked.value = next;
                  }} />
                  {label(h)}
                </label>
              ))}
            </div>
          )}
          <label class="choice">
            <input type="radio" name="from" checked={from === "none"} onChange={() => (fromPick.value = "none")} />
            None yet: I'll add them on the Habits page
          </label>
        </fieldset>
        <p class="muted small">You can add, change and stop habits any time on the Habits page.</p>
        {error.value && <p class="form-error" role="alert">{error.value}</p>}
        <div class="form-actions">
          <button type="submit" class="primary">Start {chosen}</button>
          {years.value.length > 0 && <button type="button" onClick={() => (openPick.value = false)}>Cancel</button>}
        </div>
      </form>
    </section>
  );
}

/** The offline copy and whether the browser keeps the data, as in the Money Tracker. */
function OfflineCard() {
  const status = useSignal("Checking…");
  const note = useSignal<string | null>(null);
  const checking = useSignal(false);
  // Asked again whenever the service worker says the offline copy changed.
  const changed = offlineChanged.value;
  useEffect(() => {
    offlineStatus().then((s) => (status.value = s));
  }, [changed]);

  async function onCheck() {
    checking.value = true;
    try {
      note.value = await checkForUpdates();
    } finally {
      checking.value = false;
    }
  }

  return (
    <section class="card">
      <h3 class="card-title">Offline</h3>
      <p class="muted">{status.value}</p>
      {persistState.value && (
        <p class="muted">
          {PERSIST_TEXT[persistState.value]}{" "}
          {persistState.value === "not-persisted" && (
            <button type="button" class="link" onClick={async () => (persistState.value = await requestPersistence())}>
              Ask again
            </button>
          )}
        </p>
      )}
      <div class="setting-row">
        <button type="button" class="striped" disabled={checking.value} onClick={onCheck}>
          {checking.value ? "Checking…" : "Check for updates"}
        </button>
        {/* Once a newer version is in, that's the news, whatever the check last said. */}
        {updateReady.value ? (
          <>
            <span class="muted" role="status">v{updateReady.value} is ready.</span>
            <button type="button" class="primary" onClick={() => location.reload()}>Reload</button>
          </>
        ) : note.value && <span class="muted" role="status">{note.value}</span>}
      </div>
    </section>
  );
}

/**
 * On the home screen: a real Install button where the browser lends its prompt, and that
 * browser's own steps where it doesn't. The prompt can arrive after the page is drawn, so the
 * card follows installState. As in the Money Tracker.
 */
function InstallCard() {
  /** What came of the last Install, and the state it was said in: it is shown only while that holds. */
  const said = useSignal<{ text: string; in: InstallState } | null>(null);
  const now = installState.value;
  // A note about the steps stops being true once the browser offers its prompt again.
  const note = said.value?.in === now ? said.value.text : null;

  async function onInstall() {
    const outcome = await promptInstall();
    const text = outcome === "dismissed" ? "Not installed. The steps are here if you change your mind."
      : outcome === "unavailable" ? "The browser wouldn't install it from here. Try the steps instead."
      : null;
    said.value = text ? { text, in: installState.value } : null;
  }

  return (
    <section class="card">
      <h3 class="card-title">On your home screen</h3>
      <p class="muted">
        Installed, it opens from its own icon in a window of its own, with or without a signal,
        with no address to type.
      </p>
      <p class="muted">
        {now === "running" ? "You are using the installed tracker."
          : now === "installed" ? "Installed. From now on, open it from its icon."
          : now === "prompt" ? "This browser can install it in one tap."
          : installSteps(detectDevice()).map((s) => (typeof s === "string" ? s : <b>{s.b}</b>))}
      </p>
      {(now === "prompt" || note) && (
        <div class="setting-row">
          {now === "prompt" && <button type="button" class="primary" onClick={onInstall}>Install</button>}
          {note && <span class="muted" role="status">{note}</span>}
        </div>
      )}
    </section>
  );
}

function EraseCard() {
  const asking = useSignal(false);
  return (
    <section class="card danger-zone">
      <h3 class="card-title">Erase everything</h3>
      <p class="muted">
        Removes every habit entry you have, with every year's data and settings. This cannot be undone -
        download a copy first.
      </p>
      <div class="setting-row">
        {asking.value ? (
          <>
            <span class="small">Erase every year, every day logged and every setting from this browser? Only a backup can bring them back.</span>
            <button type="button" class="danger-solid" onClick={async () => { asking.value = false; await eraseEverything(); }}>Erase everything</button>
            <button type="button" onClick={() => (asking.value = false)}>Cancel</button>
          </>
        ) : (
          <button type="button" class="danger" onClick={() => (asking.value = true)}>Erase everything…</button>
        )}
      </div>
    </section>
  );
}

