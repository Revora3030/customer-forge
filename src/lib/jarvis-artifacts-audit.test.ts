import { describe, expect, it, vi } from "vitest";

vi.mock("./jarvis-demo-site.server", () => ({ listProspectDemos: vi.fn(async () => []) }));
vi.mock("./jarvis-routines.server", () => ({ listJarvisRoutines: vi.fn(async () => []) }));
vi.mock("./jarvis-memory.server", () => ({ parseMemoryKind: String, parseMemoryContent: String, saveJarvisMemory: vi.fn() }));
vi.mock("./integrations/research.server", () => ({ searchWeb: vi.fn(async () => ({ results: [] })) }));

import { runReadActions } from "./jarvis-agent.server";

function auditDb(result: { data: unknown; error: { message: string } | null }) {
  const calls = { table: "", select: "", like: [] as string[] };
  const builder = {
    select: (cols: string) => { calls.select = cols; return builder; },
    like: (col: string, pattern: string) => { calls.like = [col, pattern]; return builder; },
    order: () => builder,
    limit: async () => result,
  };
  return { db: { from: (table: string) => { calls.table = table; return builder; } } as never, calls };
}

describe("artifacts.list audit read", () => {
  it("reads only columns audit_logs really has (no `details`) and filters to Jarvis entries", async () => {
    const { db, calls } = auditDb({ data: [{ action: "jarvis.pr.approved", created_at: "2026-10-31T10:00:00Z" }], error: null });
    const [out] = await runReadActions(db, [{ id: "artifacts.list" }], "owner");
    expect(calls.table).toBe("audit_logs");
    expect(calls.select).toBe("action, created_at");
    expect(calls.select).not.toContain("details");
    expect(calls.like).toEqual(["action", "jarvis.%"]);
    expect(JSON.stringify(out)).toContain("jarvis.pr.approved");
    expect(JSON.stringify(out)).not.toContain("approvalsError");
  });

  it("surfaces a read error instead of showing an empty approvals list", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { db } = auditDb({ data: null, error: { message: "column audit_logs.details does not exist" } });
    const [out] = await runReadActions(db, [{ id: "artifacts.list" }], "owner");
    expect(JSON.stringify(out)).toContain("approvalsError");
    expect(JSON.stringify(out)).toContain("column audit_logs.details does not exist");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
