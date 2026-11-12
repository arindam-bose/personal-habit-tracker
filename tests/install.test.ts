// After the browser's install prompt is answered: what On your home screen shows next.

import { describe, expect, it } from "vitest";
import { stateAfterPrompt } from "../src/install";

describe("stateAfterPrompt", () => {
  it("counts a yes as installed, without waiting for the browser to say so", () => {
    expect(stateAfterPrompt("accepted", false)).toBe("installed");
  });

  it("shows the steps after a no, or when the browser wouldn't prompt", () => {
    expect(stateAfterPrompt("dismissed", false)).toBe("manual");
    expect(stateAfterPrompt("unavailable", false)).toBe("manual");
  });

  it("offers Install again when the browser sent a fresh prompt while this one was open", () => {
    expect(stateAfterPrompt("dismissed", true)).toBe("prompt");
    expect(stateAfterPrompt("unavailable", true)).toBe("prompt");
  });
});
