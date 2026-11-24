import { describe, expect, it } from "vitest";
import { markedPieces, matchNote, searchNotes, searchTerms } from "../src/notes";

const DAYS = [
  { date: "2025-12-30", note: "Dinner at the Café with Sam" },
  { date: "2026-03-02", note: "Dentist at 3. Ran 5k after." },
  { date: "2026-03-01" },
  { date: "2026-11-23", note: "Long day at work, slept late. Skipped the cold shower." },
  { date: "2026-05-10", note: "Ran in the park with Sam" },
];

describe("searchTerms", () => {
  it("splits words, keeps quoted words together, and folds case and accents", () => {
    expect(searchTerms('  Sam  "Cold  Shower" CAFÉ ')).toEqual(["sam", "cold shower", "cafe"]);
  });
  it("ignores empty quotes and an unclosed quote takes the rest", () => {
    expect(searchTerms('"" ran "the park')).toEqual(["ran", "the park"]);
  });
});

describe("searchNotes", () => {
  it("lists every note, newest first, when nothing is typed", () => {
    expect(searchNotes(DAYS, "  ").map((h) => h.date)).toEqual(["2026-11-23", "2026-05-10", "2026-03-02", "2025-12-30"]);
  });
  it("needs every word, in any order, across years", () => {
    expect(searchNotes(DAYS, "sam").map((h) => h.date)).toEqual(["2026-05-10", "2025-12-30"]);
    expect(searchNotes(DAYS, "park sam").map((h) => h.date)).toEqual(["2026-05-10"]);
    expect(searchNotes(DAYS, "sam dentist")).toEqual([]);
  });
  it("matches without regard to case or accents, either way round", () => {
    expect(searchNotes(DAYS, "cafe").map((h) => h.date)).toEqual(["2025-12-30"]);
    expect(searchNotes([{ date: "2026-01-01", note: "cafe" }], "Café")).toHaveLength(1);
  });
  it("matches part of a word, and quoted words only together", () => {
    expect(searchNotes(DAYS, "dent").map((h) => h.date)).toEqual(["2026-03-02"]);
    expect(searchNotes(DAYS, '"cold shower"')).toHaveLength(1);
    expect(searchNotes(DAYS, '"shower cold"')).toHaveLength(0);
  });
});

describe("matchNote", () => {
  it("marks every place each word appears, merged, in the note's own text", () => {
    const note = "Ran 5k, then ran more. Random!";
    expect(matchNote(note, ["ran"])).toEqual([[0, 3], [13, 16], [23, 26]]);
    expect(matchNote("Café au lait", ["cafe au"])).toEqual([[0, 7]]);
    expect(matchNote("abcdef", ["abc", "cde"])).toEqual([[0, 5]]);
  });
  it("maps back through characters that fold to more than one", () => {
    // "ﬁ" (one character) folds to "fi"; "Straße" keeps its ß.
    expect(matchNote("a ﬁne day", ["fine"])).toEqual([[2, 5]]);
    expect(matchNote("Straße", ["straße"])).toEqual([[0, 6]]);
  });
});

describe("markedPieces", () => {
  it("cuts a note into plain and marked pieces", () => {
    expect(markedPieces("Ran in the park", [[0, 3], [11, 15]])).toEqual([
      { text: "Ran", marked: true }, { text: " in the ", marked: false }, { text: "park", marked: true },
    ]);
    expect(markedPieces("note", [])).toEqual([{ text: "note", marked: false }]);
  });
});
