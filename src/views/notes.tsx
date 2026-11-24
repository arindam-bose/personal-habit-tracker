// Notes: every day's note in the open year, newest first, with a box to search them, for "when did
// I last…?". The words found are marked; the pen changes a note in place (a lock shows instead when
// the year is closed), and a day opens in the Dashboard's day log.

import { signal, useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { longDate } from "../dates";
import { markedPieces, searchNotes } from "../notes";
import { firstDay } from "../score";
import { readOnly, tracked } from "../state";
import type { IsoDate } from "../types";
import { NoYear, openDay, plural } from "./common";
import { Help } from "./help";
import { Icon, IconButton } from "./icons";
import { NoteDialog, lockedReason } from "./note-dialog";

/** Notes shown at a time; buttons under the list show more or fewer. */
const PAGE = 30;

/** What's typed in the box: kept while the tab is open, so coming back from a day finds the same list. */
const query = signal("");
/** How many of the matching notes are shown, newest first: kept with the search, and back to PAGE when it changes. */
const shown = signal(PAGE);

/** A new search starts again from the first PAGE notes. */
function search(text: string): void {
  query.value = text;
  shown.value = PAGE;
}

export function NotesView() {
  const t = tracked.value;
  // The day whose note is open in the dialog, if any.
  const editing = useSignal<IsoDate | null>(null);
  // Another year starts again from the first PAGE notes; the search stays.
  const year = t?.year;
  const seen = useSignal(year);
  useEffect(() => {
    if (seen.value !== year) shown.value = PAGE;
    seen.value = year;
  }, [year]);

  if (!t) return <NoYear />;
  const days = [...t.days.values()];
  const noted = days.filter((d) => d.note).length;
  const hits = searchNotes(days, query.value);
  const searching = query.value.trim() !== "";
  /** Why a day's note can't be changed (the year is closed), or null. */
  const lockOf = (date: IsoDate) => lockedReason(date, firstDay(t), readOnly.value, t.year);

  return (
    <section class="panel notes-page">
      <div class="notes-head">
        <h2>📝 Notes</h2>
        <Help label="About searching notes">
          The notes of the year picked in the top bar. Every word typed must be in the note, in any order;
          capitals and accents don't matter. Put words in "quotes" to find them together. ✎ changes a note
          here; click a day to open it.
        </Help>
      </div>
      <input type="search" class="notes-search" value={query.value} autoFocus
        placeholder={`Search the notes of ${t.year}`} aria-label={`Search the notes of ${t.year}`}
        onInput={(e) => search(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Escape" && search("")} />
      {!noted ? (
        <p class="muted">
          No notes in {t.year} yet.{!readOnly.value && " Write one under the habits in the Dashboard's day log, or with 📝 in its Week view."}
        </p>
      ) : (
        <>
          <p class="muted small notes-count" role="status">
            {searching
              ? hits.length ? `${plural(hits.length, "day")} of ${noted} with notes in ${t.year}` : `No note in ${t.year} has all of “${query.value.trim()}”.`
              : `${plural(noted, "day")} with notes in ${t.year}, newest first`}
          </p>
          <ul class="notes-list">
            {hits.slice(0, shown.value).map((h) => {
              const locked = lockOf(h.date);
              return (
                <li key={h.date}>
                  <button type="button" class="link notes-day" onClick={() => openDay(h.date)} title="Open the day">
                    {longDate(h.date)}
                  </button>
                  <p class="notes-text">
                    {markedPieces(h.note, h.marks).map((p) => (p.marked ? <mark>{p.text}</mark> : p.text))}
                  </p>
                  {locked ? (
                    // The pen's size, so a closed year's rows are as tall as an open one's.
                    <span class="notes-lock" role="img" aria-label="Can't be changed" title={locked}><Icon name="close" /></span>
                  ) : (
                    <IconButton icon="edit" label={`Edit the note for ${longDate(h.date)}`} title="Edit the note"
                      onClick={() => (editing.value = h.date)} />
                  )}
                </li>
              );
            })}
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
        <NoteDialog key={editing.value} date={editing.value} note={t.days.get(editing.value)?.note ?? ""}
          locked={lockOf(editing.value)} onClose={() => (editing.value = null)} />
      )}
    </section>
  );
}
