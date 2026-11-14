import { describe, expect, it } from "vitest";
import { pageFor } from "../src/routes";

const PAGES = { dashboard: 1, habitmaps: 1, reports: 1 };
const RENAMED: Record<string, "dashboard" | "habitmaps" | "reports"> = { today: "dashboard", calendar: "habitmaps", heatmaps: "habitmaps" };

describe("pageFor", () => {
  it("opens a page by its name, or by an old one", () => {
    expect(pageFor("reports", PAGES, RENAMED, "dashboard")).toBe("reports");
    expect(pageFor("calendar", PAGES, RENAMED, "dashboard")).toBe("habitmaps");
    expect(pageFor("heatmaps", PAGES, RENAMED, "dashboard")).toBe("habitmaps");
    expect(pageFor("today", PAGES, RENAMED, "dashboard")).toBe("dashboard");
    expect(pageFor("", PAGES, RENAMED, "dashboard")).toBe("dashboard");
  });

  it("opens the fallback for an object's own names, not a crash", () => {
    for (const name of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(pageFor(name, PAGES, RENAMED, "dashboard")).toBe("dashboard");
    }
  });
});
