import { describe, expect, it, vi } from "vitest";

import { isTransientFailure, retryDelayMs, withTransientRetry } from "@/lib/transient";

describe("transient failures", () => {
  it("retries connection trouble", () => {
    for (const message of [
      "Failed to fetch",
      "network error",
      "The connection was reset",
      "Request timeout",
      "502 Bad Gateway",
      "503 Service Unavailable",
      "429 Too Many Requests",
    ]) {
      expect(isTransientFailure(new Error(message))).toBe(true);
    }
  });

  it("never retries a refusal, however it is worded", () => {
    for (const message of [
      "Unauthorized",
      "Forbidden",
      "Not allowed for this role",
      "permission denied for table",
      "new row violates row-level security policy",
      "Setup fee is unpaid",
      "Payment required",
      "Website is not ready to publish",
      "This workspace is suspended",
      "Already published",
      "Organization not found",
    ]) {
      expect(isTransientFailure(new Error(message))).toBe(false);
    }
  });

  it("treats a silent failure as worth one more try", () => {
    expect(isTransientFailure(new Error(""))).toBe(true);
    expect(isTransientFailure(undefined)).toBe(true);
  });

  it("waits longer each time, up to a ceiling", () => {
    expect(retryDelayMs(1)).toBeLessThan(retryDelayMs(2));
    expect(retryDelayMs(99)).toBeLessThanOrEqual(6000);
  });

  it("gives up immediately on a refusal", async () => {
    const action = vi.fn().mockRejectedValue(new Error("Unauthorized"));
    await expect(withTransientRetry(action, { attempts: 3 })).rejects.toThrow("Unauthorized");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("succeeds when a passing glitch clears", async () => {
    const action = vi
      .fn()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValue("live");
    await expect(withTransientRetry(action, { attempts: 3, delayMs: () => 0 })).resolves.toBe(
      "live",
    );
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("surfaces the last error when every try fails", async () => {
    const action = vi.fn().mockRejectedValue(new Error("network error"));
    await expect(withTransientRetry(action, { attempts: 2, delayMs: () => 0 })).rejects.toThrow(
      "network error",
    );
    expect(action).toHaveBeenCalledTimes(2);
  });
});
