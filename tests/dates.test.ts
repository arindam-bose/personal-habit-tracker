import { describe, expect, it } from "vitest";
import { addDays, dateRange, dayDate, stretchOf } from "../src/dates";

describe("the day log's seven days", () => {
  const today = "2026-11-23";

  it("end on today when the chosen day is in the last seven", () => {
    for (const d of dateRange("2026-11-17", today)) expect(stretchOf(d, today)).toBe("2026-11-17");
  });

  it("step back seven days at a time, whatever day the week starts on", () => {
    expect(stretchOf("2026-11-16", today)).toBe("2026-11-10");
    expect(stretchOf("2026-11-10", today)).toBe("2026-11-10");
    expect(stretchOf("2026-11-09", today)).toBe("2026-11-03");
  });

  it("step forward past today the same way", () => {
    expect(stretchOf("2026-11-24", today)).toBe("2026-11-24");
    expect(stretchOf("2026-11-30", today)).toBe("2026-11-24");
    expect(stretchOf("2026-12-01", today)).toBe("2026-12-01");
  });

  it("move by one seven when the chosen day moves by seven", () => {
    for (const d of dateRange("2026-01-08", "2026-12-24")) {
      expect(stretchOf(addDays(d, -7), today)).toBe(addDays(stretchOf(d, today), -7));
      expect(stretchOf(addDays(d, 7), today)).toBe(addDays(stretchOf(d, today), 7));
    }
  });

  it("hold the chosen day, across a change of clocks too", () => {
    for (const d of dateRange("2026-01-01", "2026-12-31")) {
      const start = stretchOf(d, today);
      expect(d >= start && d <= addDays(start, 6)).toBe(true);
    }
  });
});

describe("the Week table's days", () => {
  // A fixed language, so the test reads the same whatever language the machine running it is in.
  it("name the weekday, the month and the day", () => {
    expect(dayDate("2026-11-17", "en-US")).toBe("Tue, Nov 17");
    expect(dayDate("2026-01-01", "en-US")).toBe("Thu, Jan 1");
  });

  it("stay on their own day wherever the clock is", () => {
    expect(dayDate("2026-03-08", "en-US")).toBe("Sun, Mar 8");
    expect(dayDate("2026-11-01", "en-US")).toBe("Sun, Nov 1");
  });
});
