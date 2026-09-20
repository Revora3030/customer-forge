import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetIntegrationHealth } from "./registry.server";
import { researchPage } from "./research.server";

describe("capability-routed research", () => {
  beforeEach(() => {
    resetIntegrationHealth();
    delete process.env["FIRECRAWL_API_KEY"];
    process.env["FREE_AI_ONLY"] = "true";
    vi.restoreAllMocks();
  });

  it("reads a public page with Revora's own reader and keeps the source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          `<html><head><title>Acme Detailing</title><meta name="description" content="Mobile detailing"></head><body><h1>Acme</h1><p>We detail cars.</p></body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        ),
      ),
    );
    const outcome = await researchPage("https://example.com/");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.extract.title).toBe("Acme Detailing");
      expect(outcome.extract.source.provider).toBe("revora-native-fetch");
      expect(outcome.extract.source.url).toBe("https://example.com/");
      // Research is never treated as a verified business fact.
      expect(outcome.extract.source.trust).toBe("research");
      expect(outcome.extract.source.fetchedAt).toMatch(/^\d{4}-/);
    }
  });

  it("reports honestly instead of inventing content when the page fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const outcome = await researchPage("https://example.com/");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.detail).toContain("couldn't be read");
  });

  it("refuses private and non-web addresses", async () => {
    const calls = vi.fn();
    vi.stubGlobal("fetch", calls);
    const outcome = await researchPage("http://127.0.0.1/admin");
    expect(outcome.ok).toBe(false);
    expect(calls).not.toHaveBeenCalled();
  });
});
