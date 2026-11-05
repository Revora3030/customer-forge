import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAILURE_FALLBACK, routineRunViews } from "./routine-history";

const run = (id: string, status: string, created_at: string, extra: Record<string, unknown> = {}) => ({
  id, status, created_at, finished_at: null, result_summary: null, error_plain: null, ...extra,
});

describe("routineRunViews (JC-54)", () => {
  it("shows what each run read, proposed and what happened, newest first", () => {
    const views = routineRunViews(
      [run("a", "done", "2026-11-01T10:00:00Z", { result_summary: " 3 new leads " }), run("b", "needs_approval", "2026-11-02T10:00:00Z")],
      [
        { run_id: "a", seq: 2, tool: "read_bookings", status: "ok" },
        { run_id: "a", seq: 1, tool: "read_leads", status: "ok" },
        { run_id: "a", seq: 3, tool: "read_leads", status: "ok" },
        { run_id: "a", seq: 4, tool: "read_site", status: "error" },
      ],
      [{ run_id: "b", summary: "Review request to Sam", status: "rejected", tool: "send_email" }],
    );
    expect(views.map((v) => v.id)).toEqual(["b", "a"]);
    expect(views[1]).toMatchObject({ statusLabel: "Finished", read: ["read leads", "read bookings"], result: "3 new leads", failure: null });
    expect(views[0]!.proposals).toEqual([{ summary: "Review request to Sam", outcome: "You turned it down; nothing was sent" }]);
  });

  it("a failure always shows a cause, never a blank", () => {
    const [withCause, noCause] = routineRunViews(
      [run("x", "failed", "2026-11-03T00:00:00Z", { error_plain: "Budget used up" }), run("y", "failed", "2026-11-02T00:00:00Z")],
      [], [],
    );
    expect(withCause!.failure).toBe("Budget used up");
    expect(noCause!.failure).toBe(FAILURE_FALLBACK);
    expect(withCause!.tone).toBe("failed");
  });

  it("history is member-readable, retry is owner-only and only for enabled routines", () => {
    const src = readFileSync("src/lib/agent/routines.functions.ts", "utf8");
    const history = src.slice(src.indexOf("listRoutineRunsFn"), src.indexOf("runRoutineSoonFn"));
    expect(history).toContain('"viewer")');
    expect(history).toContain('.eq("organization_id", orgId)');
    const retry = src.slice(src.indexOf("export const runRoutineSoonFn"));
    expect(retry).toContain('"owner")');
    expect(retry).toContain('.eq("enabled", true)');
    expect(readFileSync("src/components/app/RoutinesPanel.tsx", "utf8")).toContain("<RoutineRunHistory");
  });
});
