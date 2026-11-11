import { describe, expect, it } from "vitest";
import { formatMinutes, goalText, habitId, meets, parseDuration } from "../src/habits";

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
