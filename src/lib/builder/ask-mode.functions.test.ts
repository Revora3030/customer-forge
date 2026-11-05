/**
 * Proof that an Ask message never writes: the server path is run against a
 * fake database that records every call, and only reads are allowed.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/entitlement.server", () => ({ assertOrgEntitled: async () => undefined }));
const generate = vi.fn(async () => ({ data: { answer: "You offer House wash.", unsure: false, change: null } }));
vi.mock("@/lib/ai/router.server", () => ({ generateStructuredOutput: generate }));

const WRITES = ["insert", "update", "upsert", "delete", "rpc"];

function fakeSupabase(calls: string[]) {
  const rows: Record<string, unknown> = {
    organizations: { name: "Kestrel Wash", industry: "pressure washing" },
    services: [{ name: "House wash" }],
  };
  return {
    from(table: string) {
      const q: Record<string, unknown> = {};
      const result = { data: rows[table] ?? (table === "business_profiles" ? null : []), error: null };
      for (const m of ["select", "eq", "order", "limit", ...WRITES]) {
        q[m] = (..._args: unknown[]) => {
          calls.push(`${table}.${m}`);
          return q;
        };
      }
      q["maybeSingle"] = async () => result;
      q["then"] = (resolve: (v: unknown) => unknown) => resolve(result);
      return q;
    },
    rpc: (name: string) => {
      calls.push(`rpc.${name}`);
      return Promise.resolve({ data: null, error: null });
    },
  };
}

describe("askAboutSite (read-only)", () => {
  it("answers without a single write, version row or edit job", async () => {
    const { answerAskQuestion } = await import("./ask-mode.server");
    const calls: string[] = [];
    const reply = await answerAskQuestion(fakeSupabase(calls) as never, "u1", {
      organizationId: "11111111-1111-4111-8111-111111111111",
      question: "What services do I offer?",
    });
    expect(reply).toMatchObject({ answer: "You offer House wash.", unsure: false });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((c) => WRITES.some((w) => c.endsWith(`.${w}`)) || c.startsWith("rpc."))).toEqual([]);
    // No table that holds versions, checkpoints or edit jobs is even read.
    expect(calls.some((c) => /version|checkpoint|job|request|snapshot/.test(c))).toBe(false);
    expect(generate).toHaveBeenCalledOnce();
  });

  it("the Ask server files contain no write calls at all", () => {
    for (const file of ["./ask-mode.functions.ts", "./ask-mode.server.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      for (const w of WRITES) expect(source).not.toMatch(new RegExp(`\\.${w}\\(`));
      expect(source).not.toMatch(/tools\s*:/);
      // Never the edit planner, apply or version paths.
      expect(source).not.toMatch(/builder-requests|apply-plan|site-versions|chat-jobs/);
    }
  });
});
