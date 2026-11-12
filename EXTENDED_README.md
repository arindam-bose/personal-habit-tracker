# Habit Tracker: extended README

How the tracker is built and why: the stack, the data model, how every score and
streak is worked out, storage and backups, the Notion importer, and the tests. For
what the tracker is and how to use it, start with the [README](README.md).

A static site: Vite + Preact (with signals) + TypeScript, built to plain files. All
data lives in the browser's IndexedDB; a JSON file per year is the backup. There is
no server. It is built the same way as the
[Money Tracker](https://github.com/arindam-bose/personal-money-tracker), and keeps
its conventions and wording where the two meet.

## Running it

Needs Node 22 (`nvm use` picks it up from `.nvmrc`).

```sh
npm install
npm run dev        # dev server with hot reload
npm test           # unit tests (Vitest)
npm run typecheck  # app and tests (two tsconfigs, see below)
npm run build      # typecheck, then the static site in dist/
npm run preview    # serve dist/ locally
```

`vite.config.ts` sets `base: "./"`, so `dist/` works from any sub-folder of a
website.

**Deploying.** `.github/workflows/deploy.yml` runs the tests, builds, and publishes
`dist/` to GitHub Pages on every push to `main`. Pages must be set to deploy from
**GitHub Actions** (Settings > Pages > Source), not from the branch: the branch holds
the source, whose `index.html` loads `/src/main.tsx`, which browsers can't run.

The app's version is `version` in `package.json`, shown in the header after the
name. It reads `vX.0.Y`: X is the major release, Y counts the updates in between.
Bump Y with every committed change, and keep `package-lock.json` and the README's
"**Version X.0.Y**" line in step (`tests/readme.test.ts` fails if the README
drifts, which stops the deploy). Set `released` in `package.json` to that day
("YYYY-MM-DD") too: the About card on the Settings page shows the version and date
from the two.

Versions: Preact is held on 10.x, as in the Money Tracker. TypeScript is strict,
including `noUncheckedIndexedAccess`.

## Layout

| Path | What it holds |
|---|---|
| `src/types.ts` | The data model. Read this first. |
| `src/dates.ts` | `YYYY-MM-DD` dates: ranges, weeks, months, and how they read. All arithmetic in UTC. |
| `src/habits.ts` | What a habit is: when a value meets its goal, reading typed times and numbers, how values read, new ids, the starter habits. |
| `src/score.ts` | Every score, streak and report figure. Plain functions, no UI. |
| `src/setup.ts` | Changing a year's habits and start day, and what the next year starts with when one is closed. Pure functions. |
| `src/validate.ts` | Checks an imported file before anything is stored. |
| `src/db.ts` | IndexedDB storage. |
| `src/backup.ts` | JSON import and export, and backup file names. |
| `src/storage.ts` | Asking the browser to keep the data; when to remind about a backup; "Last updated". |
| `src/state.ts` | The open year as Preact signals, and the actions that change it. |
| `src/demo.ts` | The demo file on the Settings page. |
| `src/device.ts` | The browser and system, for backup file names. |
| `src/theme.ts` | Light or dark: the Settings choice, or following the device. |
| `src/offline.ts`, `src/service-worker.js` | The offline copy: registering it, its status, checking for updates. |
| `src/install.ts` | Putting the tracker on the home screen. |
| `src/views/` | One Preact view per page, plus `today.tsx` (the day log at the top of the Dashboard), `chart.tsx` (the ECharts wrapper), `common.tsx` (the no-year notice, the score bar, the year heatmap), `icons.tsx`, `about.tsx` (the About card) and `hooks.ts` (closing a menu). |
| `tools/notion_import.py` | Python: a Notion Habit Tracker export to a year file. |
| `tests/` | Vitest. `helpers.ts` builds small synthetic years. |
| `data/` | Your own Notion exports. Git-ignored; never commit it. |

## Data model

One year is one `YearFile` (`src/types.ts`): its **habits** and its **days**. Users
log days; habits are set up once and changed now and then.

- **A habit** has an id, a name, an emoji (may be empty) and a kind:
  - `check`: done or not. A day holds `true`, or nothing.
  - `duration`: a time in **whole minutes** (0 to 1440), typed as h:mm. Its goal is
    `{ op: "atLeast" | "atMost", value }` in minutes.
  - `number`: a count, whole or decimal, with an optional unit ("glasses") and a goal.
  A time or number habit without a goal is met by any value logged.
- **A day** (`DayLog`) is stored only when it holds something: `values` by habit id,
  and an optional note. A habit left out of `values` wasn't done. A day emptied of
  everything is deleted, not kept empty.
- **Ids are stable across years.** A habit's id comes from its name when it is
  added (`habitId`: "h_cold-shower", or "h_cold-shower-2" if taken), and never
  changes on a rename. Over the years and the streaks follow habits by id, and the
  Notion importer makes the same ids from the same names, so one habit in two
  years lines up.
- **`from` and `to`** are a habit's first and last days, for one added or stopped
  partway through the year. Days outside them neither score the habit nor break its
  streak. A `from` on or before the year's start is dropped, as is a `to` of
  December 31.
- **Dates are `YYYY-MM-DD` strings**, and every day is inside its year, on or after
  its `start`.
- **Nothing computed is stored.** Scores, streaks and reports are worked out from the
  days each time (a year is at most 366 small rows; this is fast).

A habit's kind can't change once it has days logged (`withHabit` refuses, and says
to stop it and add a new one), and two habits can't share a name.

## How the scores are worked out

`src/score.ts`, on a `Tracked` year (the setup and its days in a map by date). These
are the Notion tracker's rules, so imported years score exactly as they did there;
`tests/real-data.test.ts` holds them to it.

- **The days that count** run from the year's first day (`start`, or January 1) to
  its last day come: today, or December 31 for a past year (`countedDays`). Days
  still to come never count.
- **A day's score** is the share of the habits counting that day which were met, out
  of 100: six of nine is 66.67 (`dayScore`). A day with nothing logged scores 0 once
  it has come. A day with no habit counting has no score.
- **A month's or year's score** is the average of its days' scores (`periodStats`,
  `monthStats`, `yearStats`). Shown as a percentage ("66.67%", `percent`) or, as
  Notion did, rounded out of 100 (`points`).
- **A perfect day** meets every habit counting that day.
- **A habit's rate** is the share of the days it counted on that it was met; time
  and number habits also get the sum and average of the days with a value.
- **The heatmap's shade** (`level`) is 0 for nothing met, 1 to 4 in quarters, 5 for
  a perfect day.

### Streaks

A streak is the days in a row a habit was met (or, for the perfect-day streak, days
in a row that were perfect), worked out by `chainRun`:

- Days the habit doesn't count on are skipped: they neither add to a run nor break it.
- **Today doesn't break a streak** until it's over: not done yet, the current streak
  is the run up to yesterday.
- **Across years**: `state.ts` loads every stored year before the open one
  (`earlier`, `chain`), so a run on December 31 carries on into January 1, and the
  best is the longest in any stored year. It joins only when both years are stored,
  the later one is tracked from January 1, and the habit counts from its first day.
- **Carried in**: closing a year stores the streaks running on December 31 in the
  next year's `streaksIn` (`closingStreaks`; `perfect` for the perfect-day streak).
  Where the year before isn't stored (a new device, or it was deleted), the run
  starts from that number instead of 0.

## Storage

`src/db.ts`. One IndexedDB database, `habit-tracker`, with three stores:

- `years`: one `YearSetup` per year (habits, start day, `closed`, the carried-in
  streaks, the change times and `lastBackupAt`), keyed by year.
- `days`: one `DayLog` per logged day, keyed by `[year, date]`.
- `settings`: app-wide values (the year last opened, the first day of the week).

Replacing a year on import runs in one transaction: if anything fails, the old data
stays. Saving a setup with days (deleting a habit takes its values off every day)
is one transaction too (`putChange`). The app calls `navigator.storage.persist()` on
start so the browser doesn't clear the data under storage pressure; the Settings
page shows whether it agreed.

### Offline copy

`src/service-worker.js` is the service worker. It is plain JavaScript outside the
bundle: the `serviceWorker` plugin in `vite.config.ts` fills in the version and the
list of built files, and writes it as `dist/sw.js`. Built files carry content
hashes, so all of them are cached on install and served from the cache; only the
page itself goes to the network first. The cache is named `habit-tracker-v<version>`,
and a new build makes a new `sw.js`, so every deploy reaches people as an update: it
downloads by itself, and the top bar offers **Reload**. **Check for updates** on the
Settings page asks for it straight away. There is no service worker in development
(`npm run dev`), so edits always show.

### Light and dark

`src/theme.ts` holds the choice from the Settings page: System (the default), Light
or Dark. It lives in `localStorage` under `habit-tracker-theme`, on this device only,
so backups and Erase everything leave it alone. The page shows the result as
`data-theme="light" | "dark"` on `<html>`, and `style.css` swaps every colour token
under it. A small inline script in `index.html` sets it before the first paint, so
there is no flash of the wrong theme. Charts read the tokens and redraw when `theme`
changes. The Dashboard's Day or Week choice is kept per tab, in `sessionStorage`.

### State changes

`src/state.ts` holds the open year in a signal (`current`). Every change goes
through an action that writes to IndexedDB first, then updates the signal.
**Actions run one at a time** (`inTurn`), each reading the latest state when its
turn comes, so ticking habits quickly can't have one save overwrite another. A closed year refuses every change, as does
a day before the start or still to come. A save that lands after the year picker
moved to another year is stored but not shown.

### Starting partway through a year

A year can start on any day: `start` in the year file (left out, it is January 1).
Days before it can't be logged, and don't count in any score. The start can be moved
on the Habits page (`withStart`), but not past a day already logged. A year started
late doesn't join streaks from the year before; it starts from the carried-in ones.

### Backups

A backup is the year's `YearFile`, downloaded from the Settings page or the top bar's
**Backup** button, which is there for the open year on every page but Over the years
(just its icon on a phone). Both go through `backUpYear` in `state.ts`, in turn with
the changes being saved. The button turns into a red reminder for an open year with
days logged that was never backed up, or that changed since a backup at least 7 days
old, in its days or its setup (`backupDue` in `storage.ts`). Importing a file counts
as a backup made at its `exportedAt` time. JSON keys are written in a fixed order and
days oldest first, so two backups of the same year diff cleanly.

Backups are named `habit-tracker-<year>_<date>_<time>_<browser>_<system>.json`
(`backupFileName` in `backup.ts`, `src/device.ts`), e.g.
`habit-tracker-2026_2026-11-11_21-30-05_chrome_linux.json`: local time, to the
second, so backups from different days and devices sit side by side.

A backup holds everything needed to rebuild the year on a clean device:

- `start`, when the year was started partway through.
- `lastChangedAt`, when a day's log last changed, and `setupChangedAt`, when the
  habits or the start day last changed. "Last updated", in the strip under the top
  bar, is the later of the two (`lastUpdatedAt`). Left out until the first change.
- `closed: true` for a closed year, so it comes back read-only.
- `streaksIn`, the streaks carried in from the year before.
- `settings.weekStart`, the first day of the week. It is app-wide, so importing
  applies it only to a device that has none saved yet.

All of these are optional on import, so older backups still import. Left out on
purpose: `lastBackupAt` (an import counts as a backup at `exportedAt`), the year last
opened, the theme and the Day or Week choice.

`validate.ts` checks every file before anything is stored and lists every problem in
words, so a hand-edited file can be fixed: unknown habit kinds, values of the wrong
type, days outside the year or before the start, values for habits that aren't
there, duplicate days or ids. A Money Tracker file is recognised and turned away by
name.

### Closing a year

`closeYear` makes the year read-only and starts the next one (`nextYearFile` in
`setup.ts`): the habits still counting on December 31, each for the whole year (their
first and last days don't carry), the streaks running on December 31, and no days. If
the next year already exists, only its carried-in streaks are updated. The Settings
page downloads the year's backup first. A closed year can be reopened.

## Pages

| Page | File | Notes |
|---|---|---|
| Dashboard | `views/dashboard.tsx`, `views/today.tsx` | The main page. The day log on top (Day or Week view), the year at a glance below. Old `#/today` links open it. |
| Calendar | `views/calendar.tsx` | A heatmap of the day score, then one per habit. Clicking a day opens it on the Dashboard (`selectedDay`). |
| Reports | `views/reports.tsx` | Loaded on demand (see Charts). Overview, report cards for every month and the year, habits month by month, times and numbers against their goals. |
| Habits | `views/habits.tsx` | Add, change, reorder, stop and delete habits; the day tracking starts. |
| Over the years | `views/years.tsx` | In the menu only with two or more years; the year picker shows "All years" there. Loads every year (`loadAllYears`). The year still under way is marked *. Loaded on demand with the charts. |
| Settings | `views/settings.tsx`, `views/about.tsx` | Your data (back up, close, reopen, delete years), import, start a year, the demo file, the first day of the week, appearance, offline, the home screen, erase everything, About. |

Routing is by URL hash (`#/reports`), which works on any static host.

### Keyboard

On the Dashboard: <kbd>←</kbd> / <kbd>→</kbd> the day before or after,
<kbd>T</kbd> today; in a time or number box, <kbd>Enter</kbd> saves and
<kbd>Esc</kbd> puts back what was there. The About card lists them too.

## Charts

`views/chart.tsx` wraps ECharts 6 and registers only the parts used (bar, line;
grid, legend, mark line, tooltip; SVG renderer). A chart type or component used
without being registered draws nothing, silently: register it there first. The
Reports and Over the years pages are separate chunks loaded when first opened
(`chartPage` in `app.tsx`), so ECharts never slows the rest of the app; a tab left
open across a release offers **Reload** if the old chunk is gone.

Chart colours are CSS tokens (`--series-1` … `--series-10` in `style.css`), with
separate light and dark steps. The score is always `--series-1`; Over the years gives
habits `seriesColors(10)`. The heatmaps shade one hue (`--heat`) by `level`. Every
chart has its numbers as a table under it. Animation is off under
`prefers-reduced-motion`.

## The Notion importer

`tools/notion_import.py` turns a Notion Habit Tracker export into a `YearFile`:

```sh
python3 -I tools/notion_import.py data/notion/2026 2026 habit-tracker-2026.json
```

It reads the entries database, one row per day: `*Entries*_all.csv` (2026) or
`*Habits Database*_all.csv` (2025). Notion exports `_all` files (every row) next to
filtered views; only those are read. Keep each year's export in
`data/notion/<year>/`.

- Every Yes/No column becomes a check habit, except Notion's own formula columns
  ("Sleep Time OK", "Screen Time OK", "Perfect Score OK").
- "Sleep Time (hh:mm)" and "Screen Time (hh:mm)" become time habits. Their goals come
  from Notion's OK columns: Sleep Time's is at least the shortest sleep Notion called
  OK, Screen Time's at most the longest screen time it called OK.
- Habits keep the order of the database's main view, and their ids come from their
  names, as in the app.
- Days with nothing ticked, no time and no note are left out: they score 0 either way.

Import every year, then close the earlier one so its streaks carry into the later.

## Tests

`npm test` runs everything; `npm run typecheck` checks app and tests (the tests have
their own `tests/tsconfig.json` so Node's types stay out of the app).

- **Unit tests** (`score`, `habits`, `validate`, `demo`) run on small synthetic years
  from `tests/helpers.ts`, with expected numbers worked out by hand.
- **Storage tests** (`state.test.ts`) use `fake-indexeddb` (`tests/setup.ts`): logging
  and clearing a day, refusing days to come, deleting a habit with its values,
  streaks across stored years, a save landing after the year switched, closing a year.
- **README test**: the README names the version in `package.json`.
- **Real-data tests** (`tests/real-data.test.ts`) run for each `data/notion/<year>/`
  present, and are skipped when there is none (as on GitHub): the importer's file is
  valid, and every month's score, every habit's share of days and the year's score
  match Notion's own summaries. The import runs in `beforeAll`, since vitest runs a
  skipped `describe`'s body too.

No real figure is ever written into a test: expected values are read from Notion's
export at test time, so the repository can be public.

## Privacy

- `data/` is in `.gitignore`. Real data never goes into the repository; tests that
  need it read it locally.
- The app makes no network requests of its own: code and charts are bundled, and
  text uses the system's fonts. There are no analytics. The README promises users
  their data "is never sent anywhere"; anything that changes that (a font or script
  from another site, analytics, a sync feature) must update that promise too.
