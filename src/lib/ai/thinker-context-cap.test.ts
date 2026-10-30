import { describe, expect, it } from "vitest";
import { capPromptContext, THINKER_MAX_USER_CHARS } from "./thinker.server";
import { paidFailureCharge } from "./router.server";
import { RevoraAiError, buildStopped } from "./errors";

describe("reliability (item 11)", () => {
  it("caps an over-long thinker prompt, keeping head and tail", () => {
    const text = "HEAD" + "x".repeat(THINKER_MAX_USER_CHARS * 2) + "TAIL";
    const capped = capPromptContext(text, THINKER_MAX_USER_CHARS);
    expect(capped.length).toBeLessThanOrEqual(THINKER_MAX_USER_CHARS);
    expect(capped.startsWith("HEAD")).toBe(true);
    expect(capped.endsWith("TAIL")).toBe(true);
    expect(capped).toContain("trimmed");
    expect(capPromptContext("short", 100)).toBe("short");
  });

  it("releases the whole reservation when stopped before any provider call", () => {
    expect(paidFailureCharge(buildStopped(), 500)).toBe(0);
    const inFlight = new RevoraAiError(499, "stopped", { category: "cancelled", provider: "lovable" });
    expect(paidFailureCharge(inFlight, 500)).toBe(500);
  });
});
