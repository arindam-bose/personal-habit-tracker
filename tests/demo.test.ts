import { expect, it } from "vitest";
import { demoYear } from "../src/demo";
import { validateYearFile } from "../src/validate";

it("makes a valid year, the same every time", () => {
  const at = new Date(2026, 10, 11, 12);
  const a = demoYear(at);
  expect(validateYearFile(a).ok).toBe(true);
  expect(a.days.length).toBeGreaterThan(290);
  expect(JSON.stringify(demoYear(at))).toBe(JSON.stringify(a));
});
