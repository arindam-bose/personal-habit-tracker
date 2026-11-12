# Habit Tracker

**Version 1.0.35** ·
[Use it online](https://arindambose.com/personal-habit-tracker/)

Track your daily habits for a year, January to December, and see how you're doing.

Each day you tick off what you did, and type in times or numbers (sleep, screen time, glasses of
water). The tracker works out the rest: each day's score, your streaks, heatmaps, and monthly and
yearly reports.

## Your data stays with you

There is no account and no server. Everything you log is stored in your own browser, on your own
computer, and is never sent anywhere.

If you say yes when the tracker first asks (or later, under **Cookie settings** in Settings' About
card), Google Analytics counts visits to the site. It never sees what you log, and nothing of
Google's loads unless you say yes.

That also means **you are the backup**. **Backup** in the top bar downloads the open year (an icon
on a phone), and turns red a week after your last backup, if anything changed since. If you clear
your browser data or switch computers, import that file on the Settings page to get everything back.

Once opened, the tracker keeps a copy of itself in your browser, so it works without a signal too.
New versions download by themselves; the top bar then offers **Reload**.

## Getting started

1. Open the **Settings** page.
2. **Start a year**: pick a starter set of habits, the same habits as last year, or none, and
   optionally the day you start. Or **import** a Habit Tracker file (`.json`).
3. Add, change or reorder habits on the **Habits** page.
4. Log each day at the top of the **Dashboard**.

Want to look around first? On the Settings page, **Download a demo file** and import it.

## Habits

- **Done / not done**: tick it on the days you do it (Meditation, No smoking).
- **Time**: the day's time as h:mm, met when it's at least or at most a goal
  (Sleep at least 7:30, Screen time at most 6:00). Typing 7:45, 7h45 or 7.75 all work.
- **Number**: the day's count, with a goal (Water at least 8 glasses).

A habit added partway through the year counts from the day it's added, so the days before don't
score lower. **Stop** a habit you're giving up: its days so far keep counting, later days don't.

## Scores and streaks

- A **day's score** is the share of its habits met: six of nine is 66.67%. A day with nothing logged
  scores 0 once it has come.
- A **month's or year's score** is the average of its days so far, out of 100.
- A **perfect day** meets every habit.
- A **streak** is the days in a row a habit was met. Today doesn't break it until it's over. With
  earlier years stored, a streak carries on over New Year, and the Dashboard's best is the longest
  in any stored year. Closing a year also keeps the streaks running on December 31 in the next
  year, so they carry on even on a device without the old year.

These are the same rules as the Notion tracker this replaces, so imported years score exactly as
they did there.

## What's in it

- **Dashboard**, the main page. At the top, the day to log: a card per habit to tick or fill in,
  the day's score, a note, and the week as a strip of days. **Week** shows the whole week as a
  table, for catching up on several days at once. Below it, the year at a glance: today, this week,
  this month and the year; every habit's streak, now and best; the year as a heatmap; and how each
  habit is going this month against the whole year.
- **Calendar**: a heatmap of the day score, and one for each habit. Click a day to open it on the Dashboard.
- **Reports**: the day score through the year, each month's score, the average by weekday, a report
  card for every month and for the year, habits month by month, and times and numbers against their
  goals. Every chart has its numbers as a table, too.
- **Habits**: add, change, reorder, stop or delete habits; and the day tracking starts.
- **Over the years**: once two or more years are stored, each year's score, perfect days and habits
  side by side. Habits are followed from year to year by their id.
- **Settings**: start, import, back up, close, reopen and delete years; the first day of the week;
  light or dark; the offline copy; putting it on your home screen; erasing everything; and About.

Closing a year downloads its backup, makes it read-only, and starts the next year with the habits
still counting on December 31 and the streaks running then. Add more habits there as you like.

## Handy keys on the Dashboard

| Key | Does |
|---|---|
| <kbd>←</kbd> / <kbd>→</kbd> | The day before or after |
| <kbd>T</kbd> | Today |
| <kbd>Enter</kbd> | Save a time or number |
| <kbd>Esc</kbd> | Undo what's typed in a box |

## Bringing in a Notion tracker

`tools/notion_import.py` turns a Notion Habit Tracker export into a file the tracker imports:

```sh
python3 -I tools/notion_import.py data/notion/2026 2026 habit-tracker-2026.json
```

Every Yes/No column becomes a habit, and the Sleep Time and Screen Time columns become time habits,
with goals read from Notion's own "OK" columns. Import each year on the Settings page, then close
the earlier year so its streaks carry into the later one.

## For developers

Vite, Preact with signals, TypeScript and IndexedDB; ECharts for the Reports and Over the years
charts, loaded only when those pages open.

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # unit tests; with data/notion present, also checks every score against Notion's
npm run build   # type-checks, then builds into dist/
```

The build is static: copy `dist/` to any web host, in any folder.

---

For how it's built, and how to run, test or change it, see the
[extended README](EXTENDED_README.md).
