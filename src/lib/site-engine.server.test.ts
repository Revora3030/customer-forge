import { describe, expect, it, vi } from "vitest";

import { isAiAvailable, markAiUnavailable } from "./site-engine.server";

describe("tenant-scoped AI cooldown", () => {
  it("does not force another organization onto deterministic fallback", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    markAiUnavailable("org-a");
    expect(isAiAvailable("org-a")).toBe(false);
    expect(isAiAvailable("org-b")).toBe(true);
    vi.useRealTimers();
  });

  it("expires independently", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    markAiUnavailable("org-expiring");
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(isAiAvailable("org-expiring")).toBe(true);
    vi.useRealTimers();
  });
});