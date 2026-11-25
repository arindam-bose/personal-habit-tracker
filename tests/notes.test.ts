import { describe, expect, it } from "vitest";
import { findLinks, markedPieces, matchNote, noteChunks, searchNotes, searchTerms } from "../src/notes";

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
  it("takes curly quotes as quotes, as an iPhone types them", () => {
    expect(searchTerms("“cold shower” „sam”")).toEqual(["cold shower", "sam"]);
    expect(searchNotes(DAYS, "“cold shower”")).toHaveLength(1);
  });
  it("finds quoted words split by a line break or several spaces", () => {
    const days = [{ date: "2026-01-01", note: "Skipped the cold\n\nshower" }, { date: "2026-01-02", note: "cold  shower" }];
    expect(searchNotes(days, '"cold shower"')).toHaveLength(2);
    expect(matchNote("Skipped the cold\n\nshower!", ["cold shower"])).toEqual([[12, 24]]);
  });
  it("matches Greek's final sigma either way", () => {
    expect(searchNotes([{ date: "2026-01-01", note: "ΟΔΟΣ" }], "οδος")).toHaveLength(1);
    expect(searchNotes([{ date: "2026-01-01", note: "οδος" }], "ΟΔΟΣ")).toHaveLength(1);
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

describe("findLinks", () => {
  it("finds http, https and www addresses; www ones go to https", () => {
    expect(findLinks("Hike at https://maps.app.goo.gl/B8z2pum1SDuye9wF6 today")).toEqual([
      { start: 8, end: 49, href: "https://maps.app.goo.gl/B8z2pum1SDuye9wF6" },
    ]);
    expect(findLinks("see www.example.com and HTTP://a.org/x?y=1&z=2#top")).toEqual([
      { start: 4, end: 19, href: "https://www.example.com" },
      { start: 24, end: 50, href: "HTTP://a.org/x?y=1&z=2#top" },
    ]);
  });
  it("leaves out punctuation ending a sentence, and brackets it doesn't open", () => {
    expect(findLinks("Went to https://a.org/park.").map((l) => l.href)).toEqual(["https://a.org/park"]);
    expect(findLinks("(see https://a.org/x), then").map((l) => l.href)).toEqual(["https://a.org/x"]);
    expect(findLinks("https://en.wikipedia.org/wiki/Foo_(bar)!").map((l) => l.href)).toEqual(["https://en.wikipedia.org/wiki/Foo_(bar)"]);
    expect(findLinks("“https://a.org/q”").map((l) => l.href)).toEqual(["https://a.org/q"]);
  });
  it("links only an address that starts a word, not the www. in an email address", () => {
    expect(findLinks("mail me at me@www.foo.com or a.www.b.com or xwww.c.com")).toEqual([]);
    expect(findLinks("(www.foo.com)").map((l) => l.href)).toEqual(["https://www.foo.com"]);
  });
  it("links nothing else: no other schemes, no bare prefixes", () => {
    expect(findLinks("javascript:alert(1) mailto:a@b.c ftp://x.org https:// www.")).toEqual([]);
    expect(findLinks("see www... and www., or (www.)")).toEqual([]);
  });
  it("splits two addresses joined by a comma", () => {
    expect(findLinks("http://a.com,http://b.com,www.c.com, done").map((l) => l.href)).toEqual(["http://a.com", "http://b.com", "https://www.c.com"]);
    expect(findLinks("https://a.org/x?a=1,2 next").map((l) => l.href)).toEqual(["https://a.org/x?a=1,2"]);
  });
});

describe("noteChunks", () => {
  it("cuts a note into text and links, keeping marks inside a link", () => {
    const note = "Hike at https://maps.app/park park";
    const marks = matchNote(note, ["park"])!;
    expect(noteChunks(note, marks)).toEqual([
      { pieces: [{ text: "Hike at ", marked: false }] },
      { href: "https://maps.app/park", pieces: [{ text: "https://maps.app/", marked: false }, { text: "park", marked: true }] },
      { pieces: [{ text: " ", marked: false }, { text: "park", marked: true }] },
    ]);
  });
  it("is one plain chunk without links", () => {
    expect(noteChunks("Ran", [])).toEqual([{ pieces: [{ text: "Ran", marked: false }] }]);
  });
});
