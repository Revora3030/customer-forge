import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createDefaultToolRegistryV2,
  createToolRegistryV2,
  defineToolV2,
  hashToolArguments,
  originalToolsV2,
  type ToolAuditEntry,
  type ToolContextV2,
  type ToolDefinitionV2,
} from "@/lib/ai/tool-registry-v2.server";
import { findTool } from "@/lib/ai/tools.server";

vi.mock("@/lib/agent/verify.server", () => ({ verifyWorkspaceSite: async () => ({ pages: 2, problems: [] }) }));
vi.mock("@/lib/ai/router.server", () => ({ generateImage: async () => ({ mimeType: "image/png", base64: "AAAA" }) }));
vi.mock("@/lib/site-agent.atomic", () => ({ rollback: async (steps: unknown[]) => ({ undone: steps.length }) }));

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";

function context(overrides: Partial<ToolContextV2> = {}): ToolContextV2 {
  return {
    supabase: { from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) },
    userId: "33333333-3333-4333-8333-333333333333",
    organizationId: ORG,
    isSuperAdmin: false,
    runId: "44444444-4444-4444-8444-444444444444",
    stepId: "55555555-5555-4555-8555-555555555555",
    ...overrides,
  } as ToolContextV2;
}

function harness(definitions?: ToolDefinitionV2<z.ZodType>[], extra: Parameters<typeof createToolRegistryV2>[1] = {}) {
  const rows: ToolAuditEntry[] = [];
  const registry = createToolRegistryV2(definitions ?? originalToolsV2(), {
    audit: async (entry) => void rows.push(entry),
    ...extra,
  });
  return { registry, rows };
}

type Spy = ReturnType<typeof spy>;
function spy(value: unknown = 1) {
  return vi.fn(async (..._args: unknown[]): Promise<unknown> => value);
}

const readTool = (run: Spy = spy({ hello: "world" })) =>
  defineToolV2({
    name: "demo.read",
    description: "Demo read",
    risk: "read",
    scope: "owner",
    schema: z.strictObject({ limit: z.number().int().min(1).max(50) }),
    run,
  });

describe("defineToolV2 rules", () => {
  it("requires write_internal tools to declare an inverse, and refuses one on other risks", () => {
    expect(() =>
      defineToolV2({ name: "demo.write", description: "d", risk: "write_internal", scope: "owner", schema: z.strictObject({}), run: async () => 1 }),
    ).toThrow(/inverse/);
    expect(() =>
      defineToolV2({ name: "demo.read2", description: "d", risk: "read", scope: "owner", schema: z.strictObject({}), run: async () => 1, inverse: () => null }),
    ).toThrow(/cannot declare an inverse/);
  });

  it("refuses a tool that would take the workspace id from the model", () => {
    for (const key of ["organizationId", "organization_id", "orgId", "workspaceId"]) {
      expect(() =>
        defineToolV2({ name: "demo.org", description: "d", risk: "read", scope: "owner", schema: z.strictObject({ [key]: z.string() }), run: async () => 1 }),
      ).toThrow(/comes from the session/);
    }
  });

  it("rejects bad names and duplicate registration", () => {
    expect(() => defineToolV2({ name: "Bad Name", description: "d", risk: "read", scope: "owner", schema: z.strictObject({}), run: async () => 1 })).toThrow(/Invalid tool name/);
    expect(() => createToolRegistryV2([readTool(), readTool()])).toThrow(/Duplicate/);
  });
});

describe("the four original tools on v2", () => {
  it("are all registered, with a risk that matches the original `mutates` flag, and a JSON schema", () => {
    const { registry } = harness();
    const listed = registry.list({ isSuperAdmin: false });
    expect(listed.map((tool) => tool.name).sort()).toEqual(["generate_image", "inspect_website", "rollback_changes", "verify_live_pages"]);
    for (const tool of listed) {
      expect(tool.risk !== "read").toBe(findTool(tool.name)!.mutates);
      expect(tool.scope).toBe("owner");
      expect((tool.parameters as { type?: string }).type).toBe("object");
      expect(JSON.stringify(tool.parameters)).not.toMatch(/organization/i);
    }
  });

  it("run through v2 with the workspace taken from the session, and write one audit row each", async () => {
    const { registry, rows } = harness();
    const ctx = context();
    const inspect = await registry.run(ctx, { name: "inspect_website", arguments: {}, requestId: "r1" });
    expect(inspect).toMatchObject({ ok: true, risk: "read", replayed: false, idempotencyKey: null });
    const verify = await registry.run(ctx, { name: "verify_live_pages", arguments: {}, requestId: "r2" });
    expect(verify).toMatchObject({ ok: true, data: { pages: 2 } });
    const image = await registry.run(ctx, { name: "generate_image", arguments: { prompt: "a van" }, requestId: "r3" });
    expect(image).toMatchObject({ ok: true, data: { mimeType: "image/png" } });
    const undo = await registry.run(ctx, { name: "rollback_changes", arguments: { steps: [{}, {}] }, requestId: "r4" });
    expect(undo).toMatchObject({ ok: true, risk: "write_internal", data: { undone: 2 }, inverse: null });
    expect(rows.map((row) => [row.tool, row.result_status, row.risk])).toEqual([
      ["inspect_website", "ok", "read"],
      ["verify_live_pages", "ok", "read"],
      ["generate_image", "ok", "read"],
      ["rollback_changes", "ok", "write_internal"],
    ]);
  });

  it("refuse malformed arguments and any workspace id in the arguments, even the caller's own", async () => {
    const { registry, rows } = harness();
    const bad = await registry.run(context(), { name: "generate_image", arguments: { prompt: "" }, requestId: "r5" });
    expect(bad).toMatchObject({ ok: false, reason: "invalid_input" });
    const extra = await registry.run(context(), { name: "inspect_website", arguments: { surprise: 1 }, requestId: "r6" });
    expect(extra).toMatchObject({ ok: false, reason: "invalid_input" });
    for (const organizationId of [OTHER_ORG, ORG]) {
      const result = await registry.run(context(), { name: "inspect_website", arguments: { organizationId }, requestId: "r7" });
      expect(result).toMatchObject({ ok: false, reason: "invalid_input" });
    }
    const snake = await registry.run(context(), { name: "inspect_website", arguments: { organization_id: OTHER_ORG }, requestId: "r8" });
    expect(snake).toMatchObject({ ok: false, reason: "invalid_input" });
    expect(rows.filter((row) => row.reason === "org_in_args")).toHaveLength(3);
  });
});

describe("typed errors and audit", () => {
  it("returns a typed error for an unknown tool and still audits it", async () => {
    const { registry, rows } = harness([readTool()]);
    const result = await registry.run(context(), { name: "delete_everything", arguments: {}, requestId: "u1" });
    expect(result).toMatchObject({ ok: false, reason: "unknown_tool", risk: null });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ result_status: "refused", reason: "unknown_tool", ok: false, organization_id: ORG });
  });

  it("returns invalid_input for bad params without calling the tool", async () => {
    const run = spy(1);
    const { registry, rows } = harness([readTool(run)]);
    const result = await registry.run(context(), { name: "demo.read", arguments: { limit: 500 }, requestId: "u2" });
    expect(result).toMatchObject({ ok: false, reason: "invalid_input" });
    if (!result.ok) expect(result.error).toContain("limit");
    expect(run).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.result_status).toBe("invalid");
  });

  it("writes exactly one audit row per call with run, step, risk and a hash of the arguments, not the arguments", async () => {
    const { registry, rows } = harness([readTool()]);
    await registry.run(context(), { name: "demo.read", arguments: { limit: 5 }, requestId: "u3" });
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({
      request_id: "u3",
      tool: "demo.read",
      run_id: "44444444-4444-4444-8444-444444444444",
      step_id: "55555555-5555-4555-8555-555555555555",
      risk: "read",
      result_status: "ok",
      ok: true,
      idempotency_key: null,
    });
    expect(row.args_hash).toBe(hashToolArguments({ limit: 5 }));
    expect(JSON.stringify(row)).not.toContain('"limit"');
    expect(hashToolArguments({ a: 1, b: 2 })).toBe(hashToolArguments({ b: 2, a: 1 }));
  });

  it("turns a crashing tool and a slow tool into typed results, never a throw", async () => {
    const boom = defineToolV2({ name: "demo.boom", description: "d", risk: "read", scope: "owner", schema: z.strictObject({}), run: async () => { throw new Error("db down"); } });
    const slow = defineToolV2({ name: "demo.slow", description: "d", risk: "read", scope: "owner", schema: z.strictObject({}), timeoutMs: 20, run: () => new Promise(() => undefined) });
    const { registry, rows } = harness([boom, slow]);
    expect(await registry.run(context(), { name: "demo.boom", arguments: {}, requestId: "e1" })).toMatchObject({ ok: false, reason: "failed", error: "db down" });
    expect(await registry.run(context(), { name: "demo.slow", arguments: {}, requestId: "e2" })).toMatchObject({ ok: false, reason: "timeout" });
    expect(rows.map((row) => row.result_status)).toEqual(["failed", "timeout"]);
  });

  it("is not affected by a failing audit writer", async () => {
    const { registry } = harness([readTool()], { audit: async () => { throw new Error("audit down"); } });
    expect(await registry.run(context(), { name: "demo.read", arguments: { limit: 1 }, requestId: "a1" })).toMatchObject({ ok: true });
  });

  it("does not throw on garbage arguments", async () => {
    const { registry } = harness([readTool()]);
    for (const args of [null, undefined, 7, "x", [], { limit: "2" }]) {
      const result = await registry.run(context(), { name: "demo.read", arguments: args, requestId: "g" });
      expect(result.ok).toBe(false);
    }
  });
});

describe("scope", () => {
  const adminTool = () =>
    defineToolV2({ name: "demo.admin", description: "d", risk: "read", scope: "admin", schema: z.strictObject({}), run: async () => "secret" });

  it("keeps admin tools hidden from, and refused to, a normal member", async () => {
    const { registry, rows } = harness([adminTool(), readTool()]);
    expect(registry.list({ isSuperAdmin: false }).map((tool) => tool.name)).toEqual(["demo.read"]);
    expect(registry.list({ isSuperAdmin: true }).map((tool) => tool.name)).toEqual(["demo.admin", "demo.read"]);
    expect(await registry.run(context(), { name: "demo.admin", arguments: {}, requestId: "s1" })).toMatchObject({ ok: false, reason: "forbidden" });
    expect(await registry.run(context({ isSuperAdmin: true }), { name: "demo.admin", arguments: {}, requestId: "s2" })).toMatchObject({ ok: true, data: "secret" });
    expect(rows.map((row) => row.result_status)).toEqual(["refused", "ok"]);
  });
});

describe("write_internal: inverse and idempotency", () => {
  const writeTool = (run: Spy) =>
    defineToolV2({
      name: "demo.rename",
      description: "d",
      risk: "write_internal",
      scope: "owner",
      schema: z.strictObject({ title: z.string().min(1) }),
      run,
      inverse: (input, result) => ({ tool: "demo.rename", arguments: { title: (result as { previous: string }).previous, from: input.title } }),
    });

  it("returns how to undo the change", async () => {
    const run = spy({ previous: "Old title" });
    const { registry } = harness([writeTool(run)]);
    const result = await registry.run(context(), { name: "demo.rename", arguments: { title: "New" }, requestId: "w1" });
    expect(result).toMatchObject({ ok: true, inverse: { tool: "demo.rename", arguments: { title: "Old title" } } });
  });

  it("runs an identical write once when retried, and again when the arguments differ", async () => {
    const run = spy({ previous: "x" });
    const idempotency = new Map();
    const { registry, rows } = harness([writeTool(run)], { idempotency });
    const first = await registry.run(context(), { name: "demo.rename", arguments: { title: "A" }, requestId: "w2" });
    const retry = await registry.run(context(), { name: "demo.rename", arguments: { title: "A" }, requestId: "w3" });
    expect(run).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(retry).toMatchObject({ ok: true, replayed: true });
    await registry.run(context(), { name: "demo.rename", arguments: { title: "B" }, requestId: "w4" });
    expect(run).toHaveBeenCalledTimes(2);
    expect(rows.map((row) => row.result_status)).toEqual(["ok", "replayed", "ok"]);
    expect(rows[0]!.idempotency_key).toBeTruthy();
  });

  it("uses a caller-supplied idempotency key", async () => {
    const run = spy({ previous: "x" });
    const { registry } = harness([writeTool(run)], { idempotency: new Map() });
    await registry.run(context(), { name: "demo.rename", arguments: { title: "A" }, requestId: "w5", idempotencyKey: "k-1" });
    const again = await registry.run(context(), { name: "demo.rename", arguments: { title: "A" }, requestId: "w6", idempotencyKey: "k-1" });
    expect(again).toMatchObject({ replayed: true, idempotencyKey: "k-1" });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a failing inverse never breaks the write", async () => {
    const tool = defineToolV2({
      name: "demo.fragile", description: "d", risk: "write_internal", scope: "owner", schema: z.strictObject({}),
      run: async () => 1, inverse: () => { throw new Error("nope"); },
    });
    const { registry } = harness([tool]);
    expect(await registry.run(context(), { name: "demo.fragile", arguments: {}, requestId: "w7" })).toMatchObject({ ok: true, inverse: null });
  });
});

describe("send_external never sends on its own", () => {
  const sendTool = (run: Spy) =>
    defineToolV2({
      name: "demo.email",
      description: "d",
      risk: "send_external",
      scope: "owner",
      schema: z.strictObject({ to: z.string(), body: z.string() }),
      run,
    });
  const call = { name: "demo.email", arguments: { to: "a@example.com", body: "hi" }, requestId: "x1" };

  it("is refused with needs_approval and the tool is not run, when no approval layer exists", async () => {
    const run = spy("sent");
    const { registry, rows } = harness([sendTool(run)]);
    const result = await registry.run(context(), call);
    expect(result).toMatchObject({ ok: false, reason: "needs_approval", risk: "send_external" });
    expect(run).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ result_status: "needs_approval", risk: "send_external" });
  });

  it("is refused when the approval is not granted or the approval check fails", async () => {
    const run = spy("sent");
    for (const consume of [async () => false, async () => { throw new Error("db"); }]) {
      const { registry } = harness([sendTool(run)], { approvals: { consume } });
      expect(await registry.run(context(), call)).toMatchObject({ ok: false, reason: "needs_approval" });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("runs only when an approval for exactly these arguments is consumed", async () => {
    const run = spy("sent");
    const consume = vi.fn(async () => true);
    const { registry } = harness([sendTool(run)], { approvals: { consume } });
    expect(await registry.run(context(), call)).toMatchObject({ ok: true, data: "sent" });
    expect(consume).toHaveBeenCalledWith(expect.objectContaining({ tool: "demo.email", argsHash: hashToolArguments(call.arguments) }));
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("default registry", () => {
  it("builds with the real audit writer wired but not called", () => {
    const registry = createDefaultToolRegistryV2();
    expect(registry.names()).toContain("inspect_website");
  });
});
