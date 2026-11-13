import { describe, expect, it } from "vitest";
import { formatMinutes, goalText, habitId, meets, parseCount, parseDuration, formatAverage } from "../src/habits";

describe("times", () => {
  it("reads what people type", () => {
    expect(parseDuration("7:45")).toBe(465);
    expect(parseDuration("7")).toBe(420);
    expect(parseDuration("7.5")).toBe(450);
    expect(parseDuration("7h45")).toBe(465);
    expect(parseDuration("7h 45m")).toBe(465);
    expect(parseDuration("45m")).toBe(45);
    expect(parseDuration("0:00")).toBe(0);
    expect(parseDuration("25:00")).toBeNull();
    expect(parseDuration("7:75")).toBeNull();
    expect(parseDuration("soon")).toBeNull();
  });

  it("writes h:mm", () => {
    expect(formatMinutes(465)).toBe("7:45");
    expect(formatMinutes(5)).toBe("0:05");
  });
});

it("reads numbers with a decimal comma or a thousands comma", () => {
  expect(parseCount("8")).toBe(8);
  expect(parseCount("1.5")).toBe(1.5);
  expect(parseCount("1,5")).toBe(1.5);
  expect(parseCount("12,25")).toBe(12.25);
  expect(parseCount("1,000")).toBe(1000);
  expect(parseCount("12,000.5")).toBe(12000.5);
  expect(parseCount("-3")).toBeNull();
  expect(parseCount("1,2,3")).toBeNull();
});

describe("goals", () => {
  const sleep = { kind: "duration" as const, goal: { op: "atLeast" as const, value: 450 } };
  const screen = { kind: "duration" as const, goal: { op: "atMost" as const, value: 360 } };
  it("meets at least and at most, and nothing logged never meets", () => {
    expect(meets(sleep, 450)).toBe(true);
    expect(meets(sleep, 449)).toBe(false);
    expect(meets(screen, 360)).toBe(true);
    expect(meets(screen, 361)).toBe(false);
    expect(meets(screen, undefined)).toBe(false);
    expect(meets({ kind: "check" }, true)).toBe(true);
  });
  it("says the goal", () => {
    expect(goalText(sleep)).toBe("at least 7:30");
    expect(goalText({ kind: "number", unit: "glasses", goal: { op: "atLeast", value: 8 } })).toBe("at least 8 glasses");
  });
});

it("gives each habit its own id", () => {
  const taken = new Set(["h_read"]);
  expect(habitId("Cold Shower!", (id) => taken.has(id))).toBe("h_cold-shower");
  expect(habitId("Read", (id) => taken.has(id))).toBe("h_read-2");
});

describe("formatAverage", () => {
  it("reads a time as h:mm and a number to one place, the same on every page", () => {
    expect(formatAverage({ kind: "duration" }, 429.4)).toBe("7:09");
    expect(formatAverage({ kind: "number" }, 8.25)).toBe("8.3");
    expect(formatAverage({ kind: "number" }, 8)).toBe("8");
    expect(formatAverage({ kind: "number" }, 1234.56)).toBe("1234.6");
  });
});
