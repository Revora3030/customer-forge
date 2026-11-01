import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const inserts: Record<string, unknown>[] = [];
let failFirst = false;
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (table !== "ai_tool_audit") throw new Error(`unexpected table ${table}`);
        inserts.push(row);
        return { error: failFirst && inserts.length === 1 ? { message: "column does not exist" } : null };
      },
    }),
  },
}));

import { createToolRegistryV2, defineToolV2, type ToolContextV2 } from "@/lib/ai/tool-registry-v2.server";

const ctx = {
  supabase: {},
  userId: "33333333-3333-4333-8333-333333333333",
  organizationId: "11111111-1111-4111-8111-111111111111",
  isSuperAdmin: false,
} as unknown as ToolContextV2;
const registry = () =>
  createToolRegistryV2([
    defineToolV2({ name: "demo.read", description: "d", risk: "read", scope: "owner", schema: z.strictObject({}), run: async () => 1 }),
  ]);

describe("default audit writer", () => {
  it("writes the v2 columns to ai_tool_audit", async () => {
    inserts.length = 0;
    failFirst = false;
    await registry().run(ctx, { name: "demo.read", arguments: {}, requestId: "d1" });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ tool: "demo.read", risk: "read", result_status: "ok", organization_id: ctx.organizationId });
    expect(inserts[0]).toHaveProperty("args_hash");
  });

  it("falls back to the original columns if the v2 migration is not applied yet", async () => {
    inserts.length = 0;
    failFirst = true;
    const result = await registry().run(ctx, { name: "demo.read", arguments: {}, requestId: "d2" });
    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(2);
    expect(Object.keys(inserts[1]!).sort()).toEqual(["duration_ms", "ok", "organization_id", "reason", "request_id", "tool", "user_id"]);
  });
});

describe("ai_tool_audit v2 migration", () => {
  const sql = readFileSync("supabase/migrations/20261031213100_ai_tool_audit_v2.sql", "utf8");
  const code = sql.replace(/--.*$/gm, "").toLowerCase();

  it("is additive: nullable columns, no drops, no data change, no policy change", () => {
    for (const column of ["run_id", "step_id", "risk", "args_hash", "result_status", "idempotency_key"])
      expect(code).toContain(`add column if not exists ${column} `);
    expect(code).not.toMatch(/add column if not exists \w+ \w+ not null/);
    expect(code).not.toMatch(/drop (table|column)|delete from|update public|truncate/);
    expect(code).not.toMatch(/policy|grant|disable row level security/);
  });

  it("limits risk to the three known values", () => {
    expect(code).toContain("risk in ('read', 'write_internal', 'send_external')");
  });
});
