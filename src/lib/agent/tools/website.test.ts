import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/site-restore.functions", () => ({
  readWebsiteState: vi.fn(async () => ({ pages: [{ id: "p1" }], sections: [], components: [] })),
}));

import { createToolRegistryV2, type ToolAuditEntry, type ToolContextV2 } from "@/lib/ai/tool-registry-v2.server";
import { SITE_TOOL_ACTIONS, operationKeyFor, restoreInverse, siteTools, type ApplyOutcome, type SiteToolDeps } from "./website";

const ORG = "11111111-1111-4111-8111-111111111111";

function fakeDb(versions: { id: string; version: number }[]) {
  const inserts: Record<string, unknown>[] = [];
  const db = {
    from: (table: string) => ({
      select: () => {
        const filters: Record<string, unknown> = {};
        const q = {
          eq: (column: string, value: unknown) => ((filters[column] = value), q),
          order: () => q,
          limit: () => q,
          maybeSingle: async () => {
            if (table === "website_settings") return { data: { generation: { theme: "x" }, seo: null }, error: null };
            const rows = versions.filter((v) => filters["version"] === undefined || v.version === filters["version"]);
            const top = [...rows].sort((a, b) => b.version - a.version)[0] ?? null;
            return { data: top, error: null };
          },
        };
        return q;
      },
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          maybeSingle: async () => {
            inserts.push({ table, ...row });
            versions.push({ id: `v${row["version"]}`, version: Number(row["version"]) });
            return { data: { id: `v${row["version"]}` }, error: null };
          },
        }),
      }),
    }),
  };
  return { db, inserts };
}

function setup(outcome: Partial<ApplyOutcome> = {}, versions = [{ id: "v7", version: 7 }]) {
  const { db, inserts } = fakeDb(versions);
  const apply = vi.fn<SiteToolDeps["apply"]>(async () => ({ applied: 1, failed: 0, snapshotVersion: 8, snapshotLabel: "Before Revora AI changes", details: ["applied heading"], ...outcome }));
  const restore = vi.fn<SiteToolDeps["restore"]>(async () => ({ version: 7, pagesRestored: true, settingsRestored: false, exact: true }));
  const audits: ToolAuditEntry[] = [];
  const registry = createToolRegistryV2(siteTools({ apply, restore }), { audit: async (e) => void audits.push(e) });
  const context: ToolContextV2 = { supabase: db as never, userId: "u1", organizationId: ORG, isSuperAdmin: false, runId: "run-1", stepId: "step-1" };
  return { registry, context, apply, restore, audits, inserts };
}

const heading = { type: "set_section_text", sectionId: "22222222-2222-4222-8222-222222222222", field: "heading", value: "Fast plumbing" };

describe("site tools bridge (PAI-14)", () => {
  it("registers write_internal owner tools for every website area", () => {
    const { registry } = setup();
    const listed = registry.list({ isSuperAdmin: false });
    expect(listed.map((t) => t.name).sort()).toEqual(["site.add_section", "site.edit_section", "site.remove_section", "site.restore_version", "site.set_seo", "site.set_theme"]);
    expect(listed.every((t) => t.risk === "write_internal" && t.scope === "owner")).toBe(true);
    expect(Object.values(SITE_TOOL_ACTIONS).flat()).not.toContain("generate_component_image");
  });

  it("hands actions to the existing apply path with the session workspace and returns a restore inverse", async () => {
    const { registry, context, apply, audits } = setup();
    const result = await registry.run(context, { name: "site.edit_section", arguments: { actions: [heading] }, requestId: "r1" });
    expect(result.ok).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    const [client, userId, data] = apply.mock.calls[0]!;
    expect(client).toBe(context.supabase);
    expect(userId).toBe("u1");
    expect(data).toMatchObject({ organizationId: ORG, actions: [heading], verify: true, label: "Before Revora AI changes" });
    expect(data.operationKey).toMatch(/^run-1:[0-9a-f]{24}$/);
    if (result.ok) {
      expect(result.inverse).toEqual({ tool: "site.restore_version", arguments: { version: 8 } });
      expect(result.data).toMatchObject({ applied: 1, restorePoint: { version: 8 } });
    }
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ tool: "site.edit_section", risk: "write_internal", result_status: "ok" });
  });

  it("refuses an action type that belongs to another tool, before anything is written", async () => {
    const { registry, context, apply } = setup();
    const result = await registry.run(context, { name: "site.set_seo", arguments: { actions: [heading] }, requestId: "r2" });
    expect(result).toMatchObject({ ok: false, reason: "failed" });
    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses a workspace id from the model", async () => {
    const { registry, context, apply } = setup();
    const result = await registry.run(context, { name: "site.remove_section", arguments: { actions: [{ type: "delete_section", sectionId: "x" }], organizationId: "other" }, requestId: "r3" });
    expect(result).toMatchObject({ ok: false, reason: "invalid_input" });
    expect(apply).not.toHaveBeenCalled();
  });

  it("reports a batch that saved nothing as a failure, with the apply path's reason", async () => {
    const { registry, context } = setup({ applied: 0, failed: 1, details: ["skipped heading (section gone)"] });
    const result = await registry.run(context, { name: "site.edit_section", arguments: { actions: [heading] }, requestId: "r4" });
    expect(result).toMatchObject({ ok: false, error: "skipped heading (section gone)" });
  });

  it("restores a version only after saving the current draft, and its inverse points at that save", async () => {
    const { registry, context, restore, inserts } = setup();
    const result = await registry.run(context, { name: "site.restore_version", arguments: { version: 7 }, requestId: "r5" });
    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ table: "website_versions", organization_id: ORG, version: 8, label: "Before Revora AI restored version 7", generation: { theme: "x" }, created_by: "u1" });
    expect(restore).toHaveBeenCalledWith(context.supabase, ORG, "v7");
    if (result.ok) expect(result.inverse).toEqual({ tool: "site.restore_version", arguments: { version: 8 } });
  });

  it("does not restore a version that isn't there", async () => {
    const { registry, context, restore, inserts } = setup({}, []);
    const result = await registry.run(context, { name: "site.restore_version", arguments: { version: 3 }, requestId: "r6" });
    expect(result).toMatchObject({ ok: false, error: "That version is no longer available." });
    expect(restore).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it("keeps the same operation key for a retried step, so the apply path doesn't write twice", () => {
    const a = operationKeyFor("site.edit_section", { actions: [heading] }, { runId: "run-1", stepId: "s" });
    expect(operationKeyFor("site.edit_section", { actions: [heading] }, { runId: "run-1", stepId: "s" })).toBe(a);
    expect(operationKeyFor("site.edit_section", { actions: [heading] }, { runId: "run-1", stepId: "t" })).not.toBe(a);
    expect(operationKeyFor("site.edit_section", {}, {})).toBeUndefined();
    expect(a!.length).toBeLessThanOrEqual(80);
    expect(restoreInverse(0)).toBeNull();
  });
});
