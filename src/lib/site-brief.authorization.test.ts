import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const chain = { middleware: () => chain, validator: () => chain, handler: (...args: unknown[]) => args.at(-1) };
  return chain;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

afterEach(() => vi.unstubAllGlobals());

describe("brief mutation authorization", () => {
  it.each(["saveSiteBrief", "saveMissingFacts"])("%s rejects viewers and other workspaces before reading or writing a brief", async (name) => {
    const path = "./site-engine.functions.ts?server-fn-module-lookup";
    const module = await import(/* @vite-ignore */ path);
    const handler = module[name] as (input: unknown) => Promise<unknown>;
    for (const role of ["viewer", "staff", null]) {
      // Only authorization reads are allowed: the membership lookup and, for
      // non-members, the support-session check (no super-admin role, no
      // session here). Any brief table read or write throws.
      const authzTables = new Set(["memberships", "user_roles", "support_sessions"]);
      const from = vi.fn((table: string) => {
        if (!authzTables.has(table)) throw new Error("Unauthorized brief access");
        const data = table === "memberships" && role ? { role } : null;
        const query = { select: () => query, eq: () => query, is: () => query, gt: () => query, limit: () => query, maybeSingle: async () => ({ data, error: null }) };
        return query;
      });
      vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External calls forbidden"); }));
      await expect(handler({ data: { organizationId: "11111111-1111-4111-8111-111111111111", brief: { positioning: "Business" }, approved: true, answers: { city: "Raleigh" } }, context: { supabase: { from }, userId: "owner" } })).rejects.toThrow(/permission/);
      expect(from.mock.calls.map(([table]) => table).every((table) => authzTables.has(table))).toBe(true);
      expect(from).toHaveBeenCalledWith("memberships");
      expect(fetch).not.toHaveBeenCalled();
    }
  });
});