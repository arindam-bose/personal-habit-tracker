// The room a chart leaves at its right for a level line named outside it ("Goal" over "≥ 7:30").

import { describe, expect, it } from "vitest";
import { outsideLabelRoom } from "../src/views/chart-room";

describe("outsideLabelRoom", () => {
  it("leaves the usual room for a short name", () => {
    expect(outsideLabelRoom("Goal\n≥ 7:30")).toBe(56);
    expect(outsideLabelRoom("Average\n54.7")).toBe(56);
  });

  it("widens for a long goal, so a big number isn't cut off at the edge", () => {
    expect(outsideLabelRoom("Goal\n≥ 100,000")).toBeGreaterThan(56 + 8);
  });
});
