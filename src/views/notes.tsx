// Notes: every day's note in the open year, newest or oldest first, with a box to search them, for "when did
// I last…?". The words found are marked; the pen changes a note in place (a lock shows instead when
// the year is closed), and a day opens in the Dashboard's day log.

import { signal, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { longDate } from "../dates";
import { noteChunks, searchNotes } from "../notes";
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
/** How many of the matching notes are shown: kept with the search, and back to PAGE when it changes. */
const shown = signal(PAGE);

// The order, as on the Money Tracker's Ledger: kept for the tab, newest first until changed.
const SORT_KEY = "habit-tracker-notes-sort";
const oldestFirst = signal(loadOldestFirst());

function loadOldestFirst(): boolean {
  try {
    return sessionStorage.getItem(SORT_KEY) === "oldest";
  } catch {
    return false;
  }
}

/** A mouse or trackpad leads, so focusing a box won't throw up an on-screen keyboard. */
const keyboardFirst = () => typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;

/** A new search starts again from the first PAGE notes. */
function search(text: string): void {
  query.value = text;
  shown.value = PAGE;
}

/** Another order starts again from the first PAGE notes, too. */
function sortBy(oldest: boolean): void {
  oldestFirst.value = oldest;
  shown.value = PAGE;
  try {
    sessionStorage.setItem(SORT_KEY, oldest ? "oldest" : "newest");
  } catch {
    // Not kept; the order still applies until the page is left.
  }
}

export function NotesView() {
  const t = tracked.value;
  const searchRef = useRef<HTMLInputElement>(null);
  // Arriving with a mouse or trackpad puts the cursor in the search, ready to type, as on the Money
  // Tracker's Ledger. Not with a finger: on a phone or tablet a focused box pops the keyboard up over the
  // page. Once per visit, when the box first appears (the year may still be loading).
  const searchFocused = useRef(false);
  useEffect(() => {
    if (searchFocused.current || !searchRef.current) return;
    searchFocused.current = true;
    if (keyboardFirst()) searchRef.current.focus({ preventScroll: true });
  }, [t === null]);
  // / jumps to the search from anywhere on the page, while not typing elsewhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return;
      // Nor on the cookie question, a ?, or a note open in its dialog: the keys belong there.
      if (el.closest(".consent, .help, dialog")) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
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
  const newest = searchNotes(days, query.value);
  const hits = oldestFirst.value ? newest.reverse() : newest;
  const searching = query.value.trim() !== "";
  /** Why a day's note can't be changed (the year is closed), or null. */
  const lockOf = (date: IsoDate) => lockedReason(date, firstDay(t), readOnly.value, t.year);

  return (
    <section class="panel notes-page">
      <div class="notes-head">
        <h2>📝 Notes</h2>
        <div class="notes-head-tools">
          <Help label="About searching notes">
            The notes of the year picked in the top bar. Every word typed must be in the note, in any order;
            capitals and accents don't matter. Put words in "quotes" to find them together. <kbd>/</kbd> jumps
            to the search. ✎ changes a note here; click a day to open it, or a web address to visit it.
          </Help>
          <select value={oldestFirst.value ? "oldest" : "newest"} aria-label="Sort"
            onChange={(e) => sortBy(e.currentTarget.value === "oldest")}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
      </div>
      {/* Esc clears the search; on an empty box it leaves it. Not while an input method is composing a
          word (Japanese, Chinese, Korean): that Esc only cancels the word. */}
      <input ref={searchRef} type="search" class="notes-search" value={query.value}
        placeholder={`Search the notes of ${t.year}…  /`} aria-label={`Search the notes of ${t.year}`}
        onInput={(e) => search(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape" || e.isComposing) return;
          e.preventDefault();
          if (e.currentTarget.value) search("");
          else e.currentTarget.blur();
        }} />
      {!noted ? (
        <p class="muted">
          No notes in {t.year} yet.{!readOnly.value && " Write one under the habits in the Dashboard's day log, or with 📝 in its Week view."}
        </p>
      ) : (
        <>
          <p class="muted small notes-count" role="status">
            {searching
              ? hits.length ? `${plural(hits.length, "day")} of ${noted} with notes in ${t.year}` : `No note in ${t.year} has all of “${query.value.trim()}”.`
              : `${plural(noted, "day")} with notes in ${t.year}`}
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
                    {/* Web addresses are links, opened in a new tab; the words found stay marked, in them too. */}
                    {noteChunks(h.note, h.marks).map((c) => {
                      const text = c.pieces.map((p) => (p.marked ? <mark>{p.text}</mark> : p.text));
                      return c.href ? <a href={c.href} target="_blank" rel="noopener noreferrer">{text}</a> : text;
                    })}
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
