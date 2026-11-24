// Notes: every day's note, newest first, across every stored year, with a box to search them, for
// "when did I last…?". The words found are marked; the edit button changes a note in place, in any year that
// isn't closed, and a day opens in the Dashboard's day log.

import { signal, useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { YearData } from "../db";
import { longDate } from "../dates";
import { markedPieces, searchNotes } from "../notes";
import { firstDay, trackedOf } from "../score";
import { current, loadAllYears, openYear, years } from "../state";
import type { IsoDate } from "../types";
import { NoYear, openDay, plural } from "./common";
import { Help } from "./help";
import { IconButton } from "./icons";
import { NoteDialog, lockedReason } from "./note-dialog";

/** Notes shown at a time; buttons under the list show more or fewer. */
const PAGE = 30;

/** What's typed in the box: kept while the tab is open, so coming back from a day finds the same list. */
const query = signal("");
/** How many of the matching notes are shown, newest first: kept with the search, and back to PAGE when it changes. */
const shown = signal(PAGE);

/** Open a day of any year in the day log. */
async function open(date: IsoDate): Promise<void> {
  const year = Number(date.slice(0, 4));
  if (current.value?.setup.year !== year) await openYear(year);
  openDay(date);
}

/** A new search starts again from the first PAGE notes. */
function search(text: string): void {
  query.value = text;
  shown.value = PAGE;
}

export function NotesView() {
  const all = useSignal<YearData[] | null>(null);
  // The day whose note is open in the dialog, if any.
  const editing = useSignal<IsoDate | null>(null);
  // Reloaded when a year is added, removed or changed, so the list is never behind.
  useEffect(() => {
    let live = true;
    loadAllYears().then((d) => live && (all.value = d));
    return () => void (live = false);
  }, [years.value, current.value]);

  if (!years.value.length) return <NoYear />;
  const days = all.value?.flatMap((y) => y.days) ?? [];
  const noted = days.filter((d) => d.note).length;
  const hits = searchNotes(days, query.value);
  const searching = query.value.trim() !== "";
  const multiYear = (all.value?.length ?? 0) > 1;
  /** Why a day's note can't be changed (its year is closed), or null. */
  const lockOf = (date: IsoDate): string | null => {
    const y = all.value?.find((d) => d.setup.year === Number(date.slice(0, 4)));
    return y ? lockedReason(date, firstDay(trackedOf(y)), !!y.setup.closed, y.setup.year) : null;
  };

  return (
    <section class="panel notes-page">
      <div class="notes-head">
        <h2>📝 Notes</h2>
        <Help label="About searching notes">
          Every word typed must be in the note, in any order; capitals and accents don't matter.
          Put words in "quotes" to find them together. ✎ changes a note here; click a day to open it.
        </Help>
      </div>
      <input type="search" class="notes-search" value={query.value} autoFocus
        placeholder={multiYear ? "Search the notes of every year" : "Search the notes"} aria-label="Search the notes"
        onInput={(e) => search(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Escape" && search("")} />
      {!all.value ? (
        <p class="muted">Loading…</p>
      ) : !noted ? (
        <p class="muted">No notes yet. Write one under the habits in the Dashboard's day log, or with 📝 in its Week view.</p>
      ) : (
        <>
          <p class="muted small notes-count" role="status">
            {searching
              ? hits.length ? `${plural(hits.length, "day")} of ${noted} with notes` : `No note has all of “${query.value.trim()}”.`
              : `${plural(noted, "day")} with notes, newest first`}
          </p>
          <ul class="notes-list">
            {hits.slice(0, shown.value).map((h) => (
              <li key={h.date}>
                <button type="button" class="link notes-day" onClick={() => open(h.date).catch(() => undefined)}
                  title="Open the day">{longDate(h.date)}</button>
                <p class="notes-text">
                  {markedPieces(h.note, h.marks).map((p) => (p.marked ? <mark>{p.text}</mark> : p.text))}
                </p>
                {lockOf(h.date) ? (
                  <span class="notes-locked muted small" title={lockOf(h.date)!}>🔒</span>
                ) : (
                  <IconButton icon="edit" label={`Edit the note for ${longDate(h.date)}`} title="Edit the note"
                    onClick={() => (editing.value = h.date)} />
                )}
              </li>
            ))}
          </ul>
          {hits.length > PAGE && (
            <div class="more-rows">
              <span class="muted">Showing {Math.min(shown.value, hits.length)} of {hits.length}</span>
              {shown.value > PAGE && (
                <button type="button" onClick={() => (shown.value = Math.max(PAGE, shown.value - PAGE))}>Show {PAGE} fewer</button>
              )}
              {shown.value < hits.length && (
                <button type="button" onClick={() => (shown.value += PAGE)}>
                  Show {Math.min(PAGE, hits.length - shown.value)} more
                </button>
              )}
            </div>
          )}
        </>
      )}
      {editing.value && (
        <NoteDialog key={editing.value} date={editing.value} note={days.find((d) => d.date === editing.value)?.note ?? ""}
          locked={lockOf(editing.value)} onClose={() => (editing.value = null)} />
      )}
    </section>
  );
}
