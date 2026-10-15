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

  it("returns partial security evidence rather than a false green security verdict", async () => {
    const output = await executeJarvisDiagnosticTool(db, "security.posture.summary");
    expect(output.status).toBe("needs_verification");
    expect(JSON.stringify(output)).toContain("Complete RLS and grant inventory");
    expect(JSON.stringify(output)).toContain("not a completed security audit");
  });
});
