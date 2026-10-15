import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeJarvisDiagnosticTool } from "./jarvis-diagnostic-tools.server";
import { collectJarvisDiagnostics } from "./jarvis-diagnostics.server";
import { providerSnapshots } from "./integrations/registry.server";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("./jarvis-diagnostics.server", () => ({
  collectJarvisDiagnostics: vi.fn(),
}));
vi.mock("./integrations/registry.server", () => ({
  providerSnapshots: vi.fn(),
}));

const db = {} as SupabaseClient;
const sections = {
  errors: {
    status: "checked",
    note: "Sanitized sample",
    data: {
      sampledRows: 2,
      possiblyTruncated: false,
      groups: [{ fingerprint: "safe-fingerprint", source: "server", message: "bounded error", route: "/app", count: 2 }],
      sentryForwardingConfigured: false,
      sentryIngestionVerified: false,
    },
  },
  builds: {
    status: "checked",
    note: "Bounded aggregates",
    data: { builds: {}, publishes: {}, images: {}, alerts: [], limits: { jobs: 100, publishes: 100, images: 100 }, possiblyTruncated: false },
  },
  schema: {
    status: "checked",
    note: "Read-only probes",
    data: { contracts: [], limitation: "Not an RLS audit" },
  },
} as never;

beforeEach(() => {
  vi.mocked(collectJarvisDiagnostics).mockResolvedValue({
    checkedAt: "2026-10-15T12:00:00.000Z",
    sections,
  } as never);
  vi.mocked(providerSnapshots).mockReturnValue([{
    id: "sentry",
    label: "Sentry",
    capabilities: ["observability.errors"],
    credentials: ["SENTRY_DSN"],
    cost: "free",
    scope: "platform",
    implemented: true,
    permission: "Error events only.",
    status: "ready",
    missing: ["SECRET_SHOULD_NOT_ESCAPE"],
    healthy: true,
    lastSuccessAt: 123,
    lastFailureAt: null,
    lastFailureReason: null,
    rateLimitedUntil: null,
    runtimeVerified: true,
  }] as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Jarvis diagnostic executor", () => {
  it("rejects unknown and model-invented tool identifiers before doing any work", async () => {
    await expect(executeJarvisDiagnosticTool(db, "shell.exec")).rejects.toThrow("Unknown Jarvis diagnostic tool");
    await expect(executeJarvisDiagnosticTool(db, "database.run_sql")).rejects.toThrow("Unknown Jarvis diagnostic tool");
    expect(collectJarvisDiagnostics).not.toHaveBeenCalled();
  });

  it("returns bounded, labeled error evidence from the existing diagnostics collector", async () => {
    const output = await executeJarvisDiagnosticTool(db, "platform.errors.summary");
    expect(output).toMatchObject({
      toolId: "platform.errors.summary",
      status: "observed",
      data: { status: "checked", note: "Sanitized sample" },
    });
    expect(output.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(output)).not.toContain("SECRET_SHOULD_NOT_ESCAPE");
  });

  it("does not return credential names or secret values from connector snapshots", async () => {
    const output = await executeJarvisDiagnosticTool(db, "connectors.permissions.snapshot");
    expect(output.status).toBe("observed");
    expect(JSON.stringify(output)).toContain("missingCredentialCount");
    expect(JSON.stringify(output)).not.toContain("SECRET_SHOULD_NOT_ESCAPE");
    expect(JSON.stringify(output)).not.toContain("SENTRY_DSN");
  });

  it("uses only the fixed public-site targets and detects basic SEO contract failures", async () => {
    const requested: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requested.push(url.origin + url.pathname);
      if (url.pathname === "/") {
        return new Response("<html><head></head><body><h1>Revora</h1></body></html>", {
          status: 200, headers: { "content-type": "text/html" },
        });
      }
      if (url.pathname === "/robots.txt") {
        return new Response("User-agent: *\nDisallow: /", {
          status: 200, headers: { "content-type": "text/plain" },
        });
      }
      return new Response("<urlset></urlset>", {
        status: 200, headers: { "content-type": "application/xml" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const output = await executeJarvisDiagnosticTool(db, "website.public.seo-smoke");
    expect(output.status).toBe("failed");
    expect(requested).toHaveLength(3);
    expect(requested.every((url) => url.startsWith("https://revoragrowthsystems.com/"))).toBe(true);
    expect(JSON.stringify(output)).toContain("Homepage title was not detected.");
    expect(JSON.stringify(output)).toContain("root Disallow");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns all seven areas with unknowns instead of a false 10/10", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.hostname === "api.github.com") {
        return new Response(JSON.stringify({ total_count: 0, workflow_runs: [] }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }
      if (url.pathname === "/") {
        return new Response("<html><head><title>Revora</title><meta name='description' content='Growth systems'></head><body><h1>Revora</h1></body></html>", {
          status: 200, headers: { "content-type": "text/html" },
        });
      }
      if (url.pathname === "/robots.txt") {
        return new Response("User-agent: *\nSitemap: https://revoragrowthsystems.com/sitemap.xml", {
          status: 200, headers: { "content-type": "text/plain" },
        });
      }
      return new Response("<urlset><loc>https://revoragrowthsystems.com/</loc></urlset>", {
        status: 200, headers: { "content-type": "application/xml" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const output = await executeJarvisDiagnosticTool(db, "jarvis.capabilities.scorecard");
    const serialized = JSON.stringify(output);
    expect(output.status).toBe("needs_verification");
    expect(serialized).toContain("Diagnostics and system awareness");
    expect(serialized).toContain("Development and troubleshooting");
    expect(serialized).toContain("Business-growth intelligence");
    expect(serialized).toContain("Lead scoring and acquisition tracking");
    expect(serialized).toContain("Autonomous execution");
    expect(serialized).toContain("Safety and access governance");
    expect(serialized).toContain("Verified production reliability");
    expect(serialized).toContain("evidence_incomplete");
    expect(serialized).not.toContain('"verified10Of10Areas":7');
  });

  it("verifies CI checks only when quality, security, and browser runs match current lovable-sync HEAD", async () => {
    let currentHead = "a".repeat(40);
    const runCommit = currentHead;
    const workflowNames = ["Revora Quality Gate", "Revora Security Gate", "Revora Browser QA"];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.hostname === "api.github.com" && url.pathname.endsWith("/commits/lovable-sync")) {
        return new Response(JSON.stringify({ sha: currentHead }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }
      if (url.hostname === "api.github.com" && url.pathname.endsWith("/actions/runs")) {
        return new Response(JSON.stringify({
          total_count: workflowNames.length,
          workflow_runs: workflowNames.map((name) => ({
            name, status: "completed", conclusion: "success", head_sha: runCommit,
            created_at: "2026-10-15T12:00:00Z", updated_at: "2026-10-15T12:01:00Z",
            html_url: "https://github.com/Revora3030/customer-forge/actions/runs/123",
          })),
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.pathname === "/") {
        return new Response("<html><head><title>Revora</title><meta name='description' content='Growth systems'></head><body><h1>Revora</h1></body></html>", {
          status: 200, headers: { "content-type": "text/html" },
        });
      }
      if (url.pathname === "/robots.txt") {
        return new Response("User-agent: *\nSitemap: https://revoragrowthsystems.com/sitemap.xml", {
          status: 200, headers: { "content-type": "text/plain" },
        });
      }
      return new Response("<urlset><loc>https://revoragrowthsystems.com/</loc></urlset>", {
        status: 200, headers: { "content-type": "application/xml" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const output = await executeJarvisDiagnosticTool(db, "jarvis.capabilities.scorecard");
    const scorecard = output.data as unknown as {
      areas: Array<{ id: string; checks: Array<{ id: string; status: string; summary: string }> }>;
    };
    const engineering = scorecard.areas.find((area) => area.id === "engineering");
    expect(engineering?.checks.find((check) => check.id === "engineering.typecheck")?.status).toBe("verified");
    expect(engineering?.checks.find((check) => check.id === "engineering.lint")?.status).toBe("verified");
    expect(engineering?.checks.find((check) => check.id === "engineering.tests")?.status).toBe("verified");
    expect(engineering?.checks.find((check) => check.id === "engineering.security")?.status).toBe("verified");
    expect(engineering?.checks.find((check) => check.id === "engineering.browser")?.status).toBe("verified");
    expect(scorecard.areas.find((area) => area.id === "diagnostics")?.checks.find((check) => check.id === "diagnostics.redaction")?.status).toBe("verified");
    expect(scorecard.areas.find((area) => area.id === "growth")?.checks.find((check) => check.id === "growth.offerConsistency")?.status).toBe("verified");
    expect(JSON.stringify(output)).not.toContain("secret");

    // Once the branch moves ahead, the same green workflows are stale. They must
    // no longer count as verification for the new release commit.
    currentHead = "b".repeat(40);
    const staleOutput = await executeJarvisDiagnosticTool(db, "jarvis.capabilities.scorecard");
    const staleScorecard = staleOutput.data as unknown as typeof scorecard;
    const staleEngineering = staleScorecard.areas.find((area) => area.id === "engineering");
    expect(staleEngineering?.checks.find((check) => check.id === "engineering.typecheck")?.status).toBe("unknown");
    expect(staleScorecard.areas.find((area) => area.id === "growth")?.checks.find((check) => check.id === "growth.offerConsistency")?.status).toBe("unknown");
  });

  it("returns partial security evidence rather than a false green security verdict", async () => {
    const output = await executeJarvisDiagnosticTool(db, "security.posture.summary");
    expect(output.status).toBe("needs_verification");
    expect(JSON.stringify(output)).toContain("Complete RLS and grant inventory");
    expect(JSON.stringify(output)).toContain("not a completed security audit");
  });
});
