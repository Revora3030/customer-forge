import { describe, expect, it } from "vitest";
import { keepPreviousData } from "@tanstack/react-query";
import {
  ACTIVITY_FEED_CACHE_POLICY,
  activityFeedRefetchInterval,
  activityFeedRetry,
  isStaleServerFnError,
} from "@/lib/observability.hooks";
import { createUnresolvedServerFnResponse } from "@/lib/api-error-response";

describe("activity feed and stale server-function IDs", () => {
  it("recognises the server's unresolved-ID answer as it reaches the client", async () => {
    // The client RPC throws `new Error(await response.text())` for a non-OK response.
    const error = new Error(await createUnresolvedServerFnResponse().text());
    expect(isStaleServerFnError(error)).toBe(true);
    expect(isStaleServerFnError(new Error("Invalid server function ID: eyJmaWxl"))).toBe(true);
    expect(isStaleServerFnError(new Error("Unauthorized: No authorization header provided"))).toBe(
      false,
    );
    expect(isStaleServerFnError(null)).toBe(false);
  });

  it("stops polling a stale ID but keeps polling otherwise", () => {
    expect(activityFeedRefetchInterval(null)).toBe(30_000);
    expect(activityFeedRefetchInterval(new Error("Invalid workspace"))).toBe(30_000);
    expect(activityFeedRefetchInterval(new Error("Invalid server function ID: x"))).toBe(false);
  });

  it("never retries a stale ID and retries ordinary failures once (T004)", () => {
    expect(activityFeedRetry(0, new Error("Invalid server function ID: x"))).toBe(false);
    expect(activityFeedRetry(0, new Error("fetch failed"))).toBe(true);
    expect(activityFeedRetry(1, new Error("fetch failed"))).toBe(false);
  });

  it("keeps the last good feed with a short stale window (T004)", () => {
    expect(ACTIVITY_FEED_CACHE_POLICY.staleTime).toBe(10_000);
    expect(ACTIVITY_FEED_CACHE_POLICY.placeholderData).toBe(keepPreviousData);
  });

  it("labels a failed feed as unavailable, never as healthy (T004)", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/components/app/ActivityFeed.tsx", "utf8");
    expect(source).toContain("Activity unavailable right now");
    expect(source.toLowerCase()).not.toContain("systems operational");
  });
});
