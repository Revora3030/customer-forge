import { describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  report: vi.fn(async () => ({ recorded: true })),
  selects: [] as string[],
}));

vi.mock("@/lib/monitoring.functions", () => ({ reportClientError: hoisted.report }));

// A builder_messages table without the thread columns (migration missing):
// any select naming request_id fails with 42703, the core columns succeed.
vi.mock("@/integrations/supabase/client", () => {
  const query = () => {
    let columns = "";
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    for (const name of ["eq", "neq", "lt", "order", "limit"]) chain[name] = () => chain;
    chain["select"] = (value: unknown) => {
      columns = String(value);
      hoisted.selects.push(columns);
      return chain;
    };
    chain["then"] = (resolve: unknown) =>
      Promise.resolve(
        columns.includes("request_id")
          ? { data: null, error: { code: "42703", message: 'column "request_id" does not exist' } }
          : { data: [{ role: "user", content: "hi", created_at: "2026-10-07T00:00:00Z" }], error: null },
      ).then(resolve as (value: unknown) => unknown);
    return chain;
  };
  return { supabase: { from: () => query() } };
});

import { isMissingColumnError, loadTurns, mergeTurns, type SavedTurn } from "./builder-memory";

const turn = (role: SavedTurn["role"], content: string, at: string): SavedTurn => ({ role, content, at, branch: "main" });

describe("builder memory resilience", () => {
  it("recognises missing-column errors from Postgres and PostgREST", () => {
    expect(isMissingColumnError({ code: "42703", message: 'column "request_id" does not exist' })).toBe(true);
    expect(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'branch' column" })).toBe(true);
    expect(isMissingColumnError({ message: 'column builder_messages.kind does not exist' })).toBe(true);
    expect(isMissingColumnError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });

  it("keeps unsaved session turns newer than the database copy, without duplicates", () => {
    const saved = [turn("user", "make it blue", "2026-10-07T00:00:00.000Z"), turn("assistant", "Done.", "2026-10-07T00:00:01.000Z")];
    const cached = [...saved, turn("user", "add a FAQ", "2026-10-07T00:00:05.000Z")];
    expect(mergeTurns(saved, cached).map((t) => t.content)).toEqual(["make it blue", "Done.", "add a FAQ"]);
    expect(mergeTurns([], cached)).toHaveLength(3);
    expect(mergeTurns(saved, [])).toBe(saved);
  });

  it("still loads without the thread columns, and reports the gap to monitoring once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const first = await loadTurns("org-a");
    await loadTurns("org-a");
    expect(first.map((t) => t.content)).toEqual(["hi"]);
    expect(hoisted.selects.some((columns) => !columns.includes("request_id"))).toBe(true);
    await vi.waitFor(() => expect(hoisted.report).toHaveBeenCalledTimes(1));
    expect(hoisted.report).toHaveBeenCalledWith({
      data: expect.objectContaining({ level: "warning", mechanism: "builder-memory-missing-column" }),
    });
    warn.mockRestore();
  });
});
