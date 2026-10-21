import { describe, expect, it, vi } from "vitest";
import { refreshGeneratedResult } from "./generated-result-cache";

describe("completed build visibility", () => {
  it("refreshes generated page rows, settings, history and readiness rather than leaving an empty canvas", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    await refreshGeneratedResult({ invalidateQueries });
    for (const key of ["website_content", "website_settings", "website_versions", "build_readiness"]) {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [key] });
    }
  });
});