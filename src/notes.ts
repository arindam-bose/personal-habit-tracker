// Searching the days' notes, for the Notes page: which days' notes hold every word typed, and where
// in each note, so the page can mark them. Case and accents don't matter ("cafe" finds "Café"), the
// words can come in any order, and "quoted words" must appear together, as typed. Also the web
// addresses in a note, so the page can make them links.

import type { IsoDate } from "./types";

/** A note that matches, with the stretches of it to mark, as [start, end) in the note's own text. */
export interface NoteHit {
  date: IsoDate;
  note: string;
  marks: [number, number][];
}

/**
 * The words of a search: each word on its own, and "quoted words" as one, folded for comparing. Curly
 * quotes count too (“like these”, as an iPhone types them).
 */
export function searchTerms(query: string): string[] {
  const terms: string[] = [];
  for (const m of query.matchAll(/["“”„]([^"“”„]*)["“”„]?|(\S+)/g)) {
    const term = fold(m[1] ?? m[2] ?? "").text.trim();
    if (term) terms.push(term);
  }
  return terms;
}

/**
 * Text folded for comparing (lower case, accents dropped, Greek's final ς as σ, and any run of spaces
 * or line breaks as one space), with, for each folded character, where it came from in the original:
 * folding can change the length ("ﬁ" is one character, and so is a run of spaces once folded).
 */
function fold(text: string): { text: string; from: number[] } {
  let out = "";
  const from: number[] = [];
  let i = 0;
  for (const ch of text) {
    if (/\s/.test(ch) && out.endsWith(" ")) {
      i += ch.length;
      continue;
    }
    const folded = /\s/.test(ch) ? " " : ch.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/ς/g, "σ");
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
      // Scanned on from the match, not from the start, so a long note with many matches stays quick.
      let k = at + term.length;
      while (f.from[k]! <= lastFrom) k++;
      const end = f.from[k]!;
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

/** A web address in a note: where it is, and where it goes. */
export interface NoteLink {
  start: number;
  end: number;
  href: string;
}

/**
 * The web addresses in a note: http:// and https:// ones, and www. ones (which go to https://). Only
 * those, so a note can never hold a link that runs code. An address starts a word: the www. in an
 * email address (me@www.foo.com) or inside a word isn't one. Punctuation ending a sentence stays out,
 * as does a closing bracket that doesn't close one opened in the address.
 */
export function findLinks(note: string): NoteLink[] {
  const links: NoteLink[] = [];
  // An address ends at a space, or at a comma that starts another one ("http://a.com,http://b.com").
  for (const m of note.matchAll(/(?<![\w@.\/-])(?:https?:\/\/|www\.)[^\s<>"]+?(?=,(?:https?:\/\/|www\.)|[\s<>"]|$)/gi)) {
    let url = m[0];
    for (;;) {
      const last = url.slice(-1);
      if (/[.,;:!?'"\u2019\u201d]/.test(last)) url = url.slice(0, -1);
      else if (last === ")" && count(url, "(") < count(url, ")")) url = url.slice(0, -1);
      else if (last === "]" && count(url, "[") < count(url, "]")) url = url.slice(0, -1);
      else break;
    }
    // Nothing but the prefix, once its trailing dots are gone ("www.", "www...", "https://").
    if (!/^(?:https?:\/\/|www\.)[\p{L}\p{N}]/iu.test(url)) continue;
    links.push({ start: m.index, end: m.index + url.length, href: /^www\./i.test(url) ? `https://${url}` : url });
  }
  return links;
}

const count = (text: string, ch: string) => text.split(ch).length - 1;

/**
 * A note cut for showing: runs of plain text and links, each made of plain and marked pieces, so a
 * word found inside an address stays marked and the address stays one link.
 */
export function noteChunks(note: string, marks: [number, number][]): { href?: string; pieces: { text: string; marked: boolean }[] }[] {
  const chunks: { href?: string; pieces: { text: string; marked: boolean }[] }[] = [];
  const piecesOf = (start: number, end: number) =>
    markedPieces(note.slice(start, end), marks.flatMap(([s, e]): [number, number][] => {
      const a = Math.max(s, start), b = Math.min(e, end);
      return a < b ? [[a - start, b - start]] : [];
    }));
  let at = 0;
  for (const link of findLinks(note)) {
    if (link.start > at) chunks.push({ pieces: piecesOf(at, link.start) });
    chunks.push({ href: link.href, pieces: piecesOf(link.start, link.end) });
    at = link.end;
  }
  if (at < note.length || !chunks.length) chunks.push({ pieces: piecesOf(at, note.length) });
  return chunks;
}
