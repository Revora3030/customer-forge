import { describe, expect, it } from "vitest";
import {
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

  it("never retries a stale ID and retries ordinary failures at most twice", () => {
    expect(activityFeedRetry(0, new Error("Invalid server function ID: x"))).toBe(false);
    expect(activityFeedRetry(0, new Error("fetch failed"))).toBe(true);
    expect(activityFeedRetry(1, new Error("fetch failed"))).toBe(true);
    expect(activityFeedRetry(2, new Error("fetch failed"))).toBe(false);
  });
});
