import { describe, expect, it } from "vitest";
import { allowSuggestionAsk } from "./service-suggestions.server";

describe("allowSuggestionAsk", () => {
  it("lets a workspace ask six times an hour, then waits", () => {
    const now = Date.parse("2026-10-28T12:00:00Z");
    for (let i = 0; i < 6; i += 1) expect(allowSuggestionAsk("org-a", now + i)).toBe(true);
    expect(allowSuggestionAsk("org-a", now + 10)).toBe(false);
    expect(allowSuggestionAsk("org-b", now + 10)).toBe(true);
    expect(allowSuggestionAsk("org-a", now + 3_600_001 + 6)).toBe(true);
  });
});
