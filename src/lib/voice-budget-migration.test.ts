import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261018090300_voice_budget.sql", "utf8");

describe("voice budget migration", () => {
  it("creates both tables with RLS on and no client access", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.voice_daily_budget");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.voice_link_claims");
    expect(sql).toContain("CHECK (scope IN ('visitor', 'admin'))");
    expect(sql).toContain("ALTER TABLE public.voice_daily_budget ENABLE ROW LEVEL SECURITY;");
    expect(sql).toContain("ALTER TABLE public.voice_link_claims ENABLE ROW LEVEL SECURITY;");
    expect(sql).toContain("REVOKE ALL ON public.voice_daily_budget FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("REVOKE ALL ON public.voice_link_claims FROM PUBLIC, anon, authenticated;");
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });

  it("defines hardened SECURITY DEFINER functions executable by the service role only", () => {
    for (const fn of ["voice_budget_reserve", "voice_link_claim"]) {
      const body = sql.slice(sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`));
      const header = body.slice(0, body.indexOf("AS $$"));
      expect(header).toContain("SECURITY DEFINER");
      expect(header).toContain("SET search_path = ''");
      expect(header).toContain("RETURNS BOOLEAN");
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role;`));
    }
    expect(sql).not.toMatch(/GRANT[^;]*TO[^;]*\b(anon|authenticated|PUBLIC)\b/i);
  });

  it("is additive only", () => {
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|ALTER TABLE [^;]* (DROP|RENAME))\b/i);
  });

  it("is called through the casted rpc client and fails closed when the RPC errors", () => {
    const budget = readFileSync("src/lib/jarvis-voice-budget.server.ts", "utf8");
    expect(budget).toContain('"voice_budget_reserve"');
    expect(budget).toContain('"voice_link_claim"');
    expect(budget).toContain("mod.supabaseAdmin as unknown as Client");
    expect(budget).toContain('code === "42883" || code === "PGRST202"');
    expect(budget).toContain("return { allowed: false, metered: true };");
  });
});
