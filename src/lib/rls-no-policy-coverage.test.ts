import { readFileSync, readdirSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every public table that enables RLS must also have at least one policy, so
 * its intended access is explicit (Supabase advisor 0008 rls_enabled_no_policy).
 * Static replay of supabase/migrations + drizzle/migrations; no database needed.
 */
const FIX = "20261104210000_service_role_policies_for_rls_no_policy_tables.sql";
const dirs = ["supabase/migrations", "drizzle/migrations"].filter((d) => existsSync(d));
const files = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".sql")).sort().map((f) => `${d}/${f}`));
const strip = (s: string) => s.replace(/--[^\n]*/g, "");

describe("RLS tables have explicit policies", () => {
  const rls = new Set<string>();
  const withPolicy = new Set<string>();
  for (const f of files) {
    const sql = strip(readFileSync(f, "utf8"));
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:"?public"?\.)?"?(\w+)"?\s+enable\s+row\s+level\s+security/gi)) rls.add(m[1]!);
    for (const m of sql.matchAll(/create\s+policy\s+(?:"[^"]+"|\w+)\s+on\s+(?:"?public"?\.)?"?(\w+)"?/gi)) withPolicy.add(m[1]!);
  }
  const fix = strip(readFileSync(`supabase/migrations/${FIX}`, "utf8"));
  const covered = new Set([...fix.matchAll(/'(\w+)'/g)].map((m) => m[1]!));

  it("no table is left with RLS on and no policy", () => {
    const missing = [...rls].filter((t) => !withPolicy.has(t) && !covered.has(t)).sort();
    expect(missing).toEqual([]);
  });

  it("the fix is service-role only, guarded, idempotent and has no DROP", () => {
    expect(fix).toMatch(/to_regclass\(format\('public\.%I', t\)\) IS NULL/);
    expect(fix).toMatch(/FROM pg_policies/);
    expect(fix).toMatch(/FOR ALL TO service_role USING \(true\) WITH CHECK \(true\)/);
    expect(fix).toMatch(/REVOKE ALL ON public\.%I FROM PUBLIC, anon, authenticated/);
    expect(fix).toMatch(/GRANT ALL ON public\.%I TO service_role/);
    expect(fix).not.toMatch(/\bdrop\s+(table|policy|column|schema|function)\b/i);
    expect(fix).not.toMatch(/\b(delete\s+from|truncate|insert\s+into|update\s+public\.)/i);
  });

  it("sorts after every other migration", () => {
    const sup = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
    expect(sup.indexOf(FIX)).toBeGreaterThan(sup.indexOf("20261103220000_review_feedback_sequence.sql"));
  });
});
