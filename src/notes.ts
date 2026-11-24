// Searching the days' notes, for the Notes page: which days' notes hold every word typed, and where
// in each note, so the page can mark them. Case and accents don't matter ("cafe" finds "Café"), the
// words can come in any order, and "quoted words" must appear together, as typed.

import type { IsoDate } from "./types";

/** A note that matches, with the stretches of it to mark, as [start, end) in the note's own text. */
export interface NoteHit {
  date: IsoDate;
  note: string;
  marks: [number, number][];
}

/** The words of a search: each word on its own, and "quoted words" as one, folded for comparing. */
export function searchTerms(query: string): string[] {
  const terms: string[] = [];
  for (const m of query.matchAll(/"([^"]*)"?|(\S+)/g)) {
    const term = fold(m[1] ?? m[2] ?? "").text.replace(/\s+/g, " ").trim();
    if (term) terms.push(term);
  }
  return terms;
}

/**
 * Text folded for comparing (lower case, accents dropped), with, for each folded character, where
 * it came from in the original: folding can change the length ("ß" is one character, "ﬁ" is too).
 */
function fold(text: string): { text: string; from: number[] } {
  let out = "";
  const from: number[] = [];
  let i = 0;
  for (const ch of text) {
    const folded = ch.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
    for (let k = 0; k < folded.length; k++) from.push(i);
    out += folded;
    i += ch.length;
  }
  from.push(i);
  return { text: out, from };
}

/** Where every term appears in a note, merged and in order; null if any term is missing. */
export function matchNote(note: string, terms: string[]): [number, number][] | null {
  const f = fold(note);
  const spans: [number, number][] = [];
  for (const term of terms) {
    let at = f.text.indexOf(term);
    if (at < 0) return null;
    while (at >= 0) {
      // Back to the original: from the first folded character's source to just past the last one's.
      const start = f.from[at]!;
      const lastFrom = f.from[at + term.length - 1]!;
      const end = f.from.find((x, k) => k >= at + term.length && x > lastFrom) ?? note.length;
      spans.push([start, end]);
      at = f.text.indexOf(term, at + term.length);
    }
  }
  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  return merged;
}

/**
 * The days whose notes match, newest first. With no words typed, every day with a note, unmarked.
 * Days may come from several years, in any order.
 */
export function searchNotes(days: Iterable<{ date: IsoDate; note?: string }>, query: string): NoteHit[] {
  const terms = searchTerms(query);
  const hits: NoteHit[] = [];
  for (const d of days) {
    if (!d.note) continue;
    const marks = terms.length ? matchNote(d.note, terms) : [];
    if (marks) hits.push({ date: d.date, note: d.note, marks });
  }
  return hits.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** A note cut into plain and marked pieces, for showing. */
export function markedPieces(note: string, marks: [number, number][]): { text: string; marked: boolean }[] {
  const pieces: { text: string; marked: boolean }[] = [];
  let at = 0;
  for (const [s, e] of marks) {
    if (s > at) pieces.push({ text: note.slice(at, s), marked: false });
    pieces.push({ text: note.slice(s, e), marked: true });
    at = e;
  }
  if (at < note.length) pieces.push({ text: note.slice(at), marked: false });
  return pieces;
}
