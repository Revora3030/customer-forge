import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ledger = {
  count: 0,
  countError: null as unknown,
  rpcResult: { data: { allowed: true }, error: null } as { data: unknown; error: unknown },
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
};

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({ select: () => ({ eq: () => ({ gte: async () => ({ count: ledger.count, error: ledger.countError }) }) }) }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      ledger.rpcCalls.push({ name, args });
      return ledger.rpcResult;
    },
  },
}));

import { VISITOR_CHAT_GLOBAL_PER_HOUR, durableAllow } from "./visitor-jarvis.functions";
import { PLATFORM_OWNER_ORG_ID } from "./platform-owner";

describe("visitor Jarvis durable limit", () => {
  beforeEach(() => {
    ledger.count = 0;
    ledger.countError = null;
    ledger.rpcResult = { data: { allowed: true }, error: null };
    ledger.rpcCalls = [];
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key-for-test");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("records each reply against the platform workspace under its own purpose and hashes the visitor", async () => {
    expect(await durableAllow("203.0.113.9")).toBe(true);
    expect(ledger.rpcCalls).toHaveLength(1);
    const call = ledger.rpcCalls[0]!;
    expect(call.name).toBe("register_public_submission_attempt");
    expect(call.args["_organization_id"]).toBe(PLATFORM_OWNER_ORG_ID);
    expect(call.args["_purpose"]).toBe("public_visitor_chat");
    expect(String(call.args["_ip_hash"])).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(call.args)).not.toContain("203.0.113.9");
  });

  it("refuses once all visitors together reach the hourly ceiling, without recording another attempt", async () => {
    ledger.count = VISITOR_CHAT_GLOBAL_PER_HOUR;
    expect(await durableAllow("198.51.100.4")).toBe(false);
    expect(ledger.rpcCalls).toHaveLength(0);
    ledger.count = VISITOR_CHAT_GLOBAL_PER_HOUR - 1;
    expect(await durableAllow("198.51.100.4")).toBe(true);
  });

  it("refuses a visitor the per-visitor rules turn away", async () => {
    ledger.rpcResult = { data: { allowed: false, reason: "RATE_LIMITED" }, error: null };
    expect(await durableAllow("198.51.100.5")).toBe(false);
  });

  it("declines instead of spending unmetered when the ledger cannot be read", async () => {
    ledger.countError = { message: "down" };
    expect(await durableAllow("198.51.100.6")).toBe(false);
    ledger.countError = null;
    ledger.rpcResult = { data: null, error: { message: "down" } };
    expect(await durableAllow("198.51.100.6")).toBe(false);
  });

  it("leaves only the in-memory limit where no database is configured (local runs and tests)", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(await durableAllow("198.51.100.7")).toBe(true);
    expect(ledger.rpcCalls).toHaveLength(0);
  });
});
