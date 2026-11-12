// The About card on the Settings page: what the tool is, how to use it, which release this is,
// and where its code and issues live.

import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import { released, version } from "../../package.json";

const REPO = "https://github.com/arindam-bose/personal-habit-tracker";

/** A "YYYY-MM-DD" day as the reader writes dates, e.g. "11 Nov 2026". */
function day(iso: string): string {
  const at = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** A fact whose term opens a dialog of words. */
function DialogFact(props: { term: string; title: string; children: ComponentChildren }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <div>
      <dt>
        <button type="button" class="link fact-open" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>{props.term}</button>
      </dt>
      <dd />
      <dialog ref={dialog} class="guide" aria-label={props.title} onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        <div class="guide-body">
          <h2 tabIndex={-1} autofocus>{props.title}</h2>
          {props.children}
          <div class="form-actions">
            <button type="button" class="primary" onClick={() => dialog.current?.close()}>Close</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

function LinkFact(props: { term: string; href: string }) {
  return (
    <div>
      <dt>{props.term}</dt>
      <dd><a href={props.href} target="_blank" rel="noopener noreferrer">On GitHub</a></dd>
    </div>
  );
}

export function AboutCard() {
  return (
    <section class="card">
      <h3 class="card-title">About</h3>
      <dl class="facts">
        <DialogFact term="About this tool" title="About Habit Tracker">
          <p>Track your daily habits for a year, January to December, and see how you're doing.</p>
          <p>
            Each day you tick off what you did, and type in times or numbers (sleep, screen time, glasses
            of water). The tracker works out the rest: each day's score, your streaks, heatmaps, and
            monthly and yearly reports.
          </p>
          <h3>Your data stays with you</h3>
          <p>
            There is no account and no server. Everything you log is stored in your own browser, on your
            own device, and is never sent anywhere. It works without a signal, too.
          </p>
          <p>
            That also means <b>you are the backup</b>. Download a copy of each year now and then with
            <b> Backup</b> in the top bar (it turns red after a week). If you clear your browser data or
            switch devices, import that file to get everything back.
          </p>
        </DialogFact>
        <DialogFact term="How to use this tool" title="How to use Habit Tracker">
          <h3>Getting started</h3>
          <ol>
            <li>On this <b>Settings</b> page, start a year (with a starter set of habits, or the same habits
              as last year), or import a backup.</li>
            <li>Add, change or reorder your habits on the <b>Habits</b> page.</li>
            <li>Log each day at the top of the <b>Dashboard</b>.</li>
          </ol>
          <h3>Habits</h3>
          <ul>
            <li><b>Done / not done</b>: tick it on the days you do it (Meditation, No smoking).</li>
            <li><b>Time</b>: type the day's time as h:mm, with a goal of at least or at most
              (Sleep at least 7:30, Screen time at most 6:00).</li>
            <li><b>Number</b>: type the day's count, with a goal (Water at least 8 glasses).</li>
          </ul>
          <p>
            A habit added partway through the year counts from the day it's added, so earlier days don't
            score lower. <b>Stop</b> a habit you're giving up: later days don't count it.
          </p>
          <h3>Scores and streaks</h3>
          <p>
            A day's score is the share of its habits met: six of nine is 66.67%. A day with nothing logged
            scores 0 once it has come. A month's or a year's score is the average of its days, out of 100.
            A <b>perfect day</b> meets every habit.
          </p>
          <p>
            A <b>streak</b> is the days in a row a habit was met. Today doesn't break it until the day is
            over. When you close a year, the streaks running on December 31 carry into the next one.
          </p>
          <h3>The pages</h3>
          <ul>
            <li><b>Dashboard</b>: at the top, log a day, or switch to <b>Week</b> to fill in a whole week as a table.
              Below it: today, this week, this month and the year, your streaks, and the year as a heatmap.</li>
            <li><b>Calendar</b>: a heatmap for the day score and one for each habit. Click a day to open it on the Dashboard.</li>
            <li><b>Reports</b>: each month and the year in words and charts, habits month by month, times against
              their goals, and which weekdays go best.</li>
            <li><b>Over the years</b>: once two or more years are stored, each year side by side.</li>
            <li><b>Settings</b>: start, import, back up, close, reopen and delete years; the first day of the week;
              light or dark; the offline copy; and the home screen.</li>
          </ul>
          <h3>Handy keys on the Dashboard</h3>
          <table class="data-table keys">
            <tbody>
              <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>The day before or after</td></tr>
              <tr><td><kbd>T</kbd></td><td>Today</td></tr>
              <tr><td><kbd>Enter</kbd></td><td>Save a time or number</td></tr>
              <tr><td><kbd>Esc</kbd></td><td>Undo what's typed in a box</td></tr>
            </tbody>
          </table>
        </DialogFact>
        <div>
          <dt>Tool version</dt>
          <dd>v{version}, updated {day(released)}</dd>
        </div>
        <LinkFact term="Source code" href={REPO} />
        <LinkFact term="Log issues and request features" href={`${REPO}/issues`} />
      </dl>
    </section>
  );
}
