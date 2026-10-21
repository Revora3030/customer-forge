import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { latestJarvisToolRuns, recordJarvisToolRun, resultReason } from "./jarvis-tool-runs.server";

const db = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: db.from } }));

beforeEach(() => {
  vi.clearAllMocks();
  db.from.mockReturnValue({ insert: db.insert });
  db.insert.mockResolvedValue({ error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe("recordJarvisToolRun", () => {
  it("writes a platform-scoped row with the tool id and outcome only", async () => {
    await recordJarvisToolRun({ toolId: "website.lighthouse.audit", status: "unknown", reason: "free_quota_exhausted", durationMs: 812.4, requestId: "req-1", userId: "user-1" });
    expect(db.from).toHaveBeenCalledWith("ai_tool_audit");
    const row = db.insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(row).toEqual({
      request_id: "req-1",
      tool: "jarvis:website.lighthouse.audit",
      organization_id: null,
      user_id: "user-1",
      ok: false,
      reason: "unknown:free_quota_exhausted",
      duration_ms: 812,
    });
    for (const forbidden of ["args", "target", "query", "output", "data"]) expect(row).not.toHaveProperty(forbidden);
  });

  it("counts a finding as evidence and drops free-text reasons", async () => {
    await recordJarvisToolRun({ toolId: "website.html.audit", status: "failed", reason: "https://customer.example/?q=private", durationMs: 5, requestId: "req-2", userId: null });
    expect(db.insert.mock.calls[0]![0]).toMatchObject({ ok: true, reason: "failed:other" });
  });

  it("swallows insert errors and thrown failures", async () => {
    db.insert.mockResolvedValue({ error: { code: "42501", message: "row details" } });
    await expect(recordJarvisToolRun({ toolId: "docs.lookup", status: "observed", durationMs: 1, requestId: "r", userId: null })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[jarvis] tool run record failed", { code: "42501" });
    db.insert.mockRejectedValue(new Error("network down"));
    await expect(recordJarvisToolRun({ toolId: "docs.lookup", status: "observed", durationMs: 1, requestId: "r", userId: null })).resolves.toBeUndefined();
  });

  it("reads data.reason only from object results", () => {
    expect(resultReason({ reason: "needs_key" })).toBe("needs_key");
    expect(resultReason(["x"])).toBeUndefined();
    expect(resultReason(null)).toBeUndefined();
  });
});

describe("latestJarvisToolRuns", () => {
  function reader(rows: unknown[] | null, error: unknown = null) {
    const query = {
      select: vi.fn(() => query),
      like: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(async () => ({ data: rows, error })),
    };
    return { client: { from: vi.fn(() => query) } as unknown as SupabaseClient, query };
  }

  it("keeps the newest row per tool", async () => {
    const { client, query } = reader([
      { tool: "jarvis:docs.lookup", ok: true, reason: "observed", created_at: "2026-10-21T10:00:00Z" },
      { tool: "jarvis:docs.lookup", ok: false, reason: "unknown:needs_key", created_at: "2026-10-20T10:00:00Z" },
      { tool: "jarvis:website.browser.check", ok: false, reason: "unknown:needs_key", created_at: "2026-10-19T10:00:00Z" },
    ]);
    const runs = await latestJarvisToolRuns(client);
    expect(query.like).toHaveBeenCalledWith("tool", "jarvis:%");
    expect(query.limit).toHaveBeenCalledWith(300);
    expect(runs).toEqual({
      "docs.lookup": { at: "2026-10-21T10:00:00Z", status: "observed", reason: null, ok: true },
      "website.browser.check": { at: "2026-10-19T10:00:00Z", status: "unknown", reason: "needs_key", ok: false },
    });
  });

  it("throws when the read fails so callers report unknown, not untested", async () => {
    const { client } = reader(null, { message: "denied" });
    await expect(latestJarvisToolRuns(client)).rejects.toThrow("tool_runs_unavailable");
  });
});
