import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ providerSnapshots: vi.fn(), latestJarvisToolRuns: vi.fn() }));
vi.mock("./integrations/registry.server", () => ({ providerSnapshots: mocks.providerSnapshots }));
vi.mock("./jarvis-tool-runs.server", () => ({ latestJarvisToolRuns: mocks.latestJarvisToolRuns }));

import { collectIntegrationStatus, type RouterHealthView } from "./jarvis-integration-status.server";

const db = {} as SupabaseClient;
const connector = (id: string, missing: string[] = []) => ({
  id, label: id, capabilities: [], credentials: missing, cost: "free", scope: "platform", implemented: true,
  permission: "read", status: missing.length ? "needs_connection" : "ready", missing, healthy: true,
  lastSuccessAt: 1_760_000_000_000, lastFailureAt: null, lastFailureReason: "HTTP 429 from provider", rateLimitedUntil: null, runtimeVerified: true,
});
const router: RouterHealthView = {
  providers: [
    { provider: "groq", configured: true, ok7d: 12, failed7d: 2, dominantError: "rate_limited", restingUntil: null },
    { provider: "mistral", configured: true, ok7d: 0, failed7d: 0, dominantError: null, restingUntil: null },
  ],
  paidLedger: { todayUsd: 0, capUsd: 1 },
};
const fullEnv = { BROWSERLESS_API_KEY: "bl-secret-value", CONTEXT7_API_KEY: "lv-secret-value" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.providerSnapshots.mockReturnValue(Array.from({ length: 20 }, (_, i) => connector(`connector-${i}`, i % 3 ? [] : ["SOME_KEY"])));
  mocks.latestJarvisToolRuns.mockResolvedValue({ "website.html.audit": { at: "2026-10-21T10:00:00Z", status: "observed", reason: null, ok: true } });
});

type Row = Record<string, unknown>;

describe("collectIntegrationStatus", () => {
  it("never treats a saved key as live-tested without a recorded run", async () => {
    const report = await collectIntegrationStatus(db, { env: fullEnv, routerHealth: async () => router });
    const tools = report.tools as Row[];
    const browser = tools.find((row) => row["id"] === "website.browser.check")!;
    expect(browser).toMatchObject({ state: "key_present", keyPresent: true, installed: true, liveTested: null, lastError: null });
    expect(tools.find((row) => row["id"] === "website.html.audit")).toMatchObject({ state: "keyless", keyPresent: null, liveTested: { at: "2026-10-21T10:00:00Z", status: "observed" } });
    for (const row of report.connectors as Row[]) expect(row).toMatchObject({ runtime: "process_local", liveTested: null });
    const aiRouter = report.aiRouter as Row[];
    expect(aiRouter.find((row) => row["id"] === "groq")).toMatchObject({ liveTested: true, ok7d: 12, lastError: "rate_limited" });
    expect(aiRouter.find((row) => row["id"] === "mistral")).toMatchObject({ liveTested: false });
    expect(report.status).toBe("observed");
    expect(report.services.find((row) => row.id === "image.huggingface")).toMatchObject({ state: "not_implemented", installed: false });
  });

  it("reports needs_verification with a reason when the connector section fails", async () => {
    mocks.providerSnapshots.mockImplementation(() => { throw new Error("boom"); });
    const report = await collectIntegrationStatus(db, { env: fullEnv, routerHealth: async () => router });
    expect(report.connectors).toBeNull();
    expect(report.status).toBe("needs_verification");
    expect(report.unavailable).toContainEqual({ section: "connectors", reason: "connector_registry_unavailable" });
  });

  it("reports unknown run history and missing router health instead of passing", async () => {
    mocks.latestJarvisToolRuns.mockRejectedValue(new Error("tool_runs_unavailable"));
    const report = await collectIntegrationStatus(db, { env: fullEnv });
    expect(report.status).toBe("needs_verification");
    expect(report.aiRouter).toBeNull();
    expect(report.unavailable.map((item) => item.section)).toEqual(expect.arrayContaining(["toolRuns", "aiRouter", "paidLedger"]));
    for (const row of report.tools as Row[]) expect(row["liveTested"]).toBeNull();
  });

  it("stays within the tool output budget and leaks no secret values", async () => {
    const report = await collectIntegrationStatus(db, { env: fullEnv, routerHealth: async () => router });
    const serialized = JSON.stringify(report);
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThan(12_000);
    expect(serialized).not.toContain("bl-secret-value");
    expect(serialized).not.toContain("lv-secret-value");
  });
});
