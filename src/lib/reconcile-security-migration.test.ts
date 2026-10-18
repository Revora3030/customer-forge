/**
 * 20261018090400_reconcile_security_hardening.sql may only take privileges
 * away or add guards. It must never open a browser path, drop data or touch
 * schema-level access that RLS policies depend on.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILE = "supabase/migrations/20261018090400_reconcile_security_hardening.sql";
const raw = readFileSync(FILE, "utf8");
const code = raw
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

/** Top-level statements, with DO $$ ... $$ blocks kept whole. */
function statements(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let inDollar = false;
  for (const line of sql.split("\n")) {
    current += `${line}\n`;
    const tags = line.match(/\$\$/g)?.length ?? 0;
    if (tags % 2 === 1) inDollar = !inDollar;
    if (!inDollar && /;\s*$/.test(line)) {
      if (current.trim()) out.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

const ALLOWED_TOP_LEVEL = [
  /^BEGIN;$/,
  /^COMMIT;$/,
  /^REVOKE\s/i,
  /^DROP POLICY IF EXISTS\s/i,
  /^CREATE POLICY\s+\w+\s+ON\s+public\.\w+\s+AS RESTRICTIVE\s/i,
  /^DO \$\$/,
];

describe("reconcile security migration", () => {
  const stmts = statements(code);

  it("contains only revokes, restrictive policies and guarded DO blocks", () => {
    expect(stmts.length).toBeGreaterThan(10);
    const unexpected = stmts.filter((stmt) => !ALLOWED_TOP_LEVEL.some((rule) => rule.test(stmt)));
    expect(unexpected).toEqual([]);
  });

  it("DO blocks only drop duplicate indexes, revoke, or add a NOT VALID check", () => {
    const executed = [...code.matchAll(/EXECUTE\s+(?:format\()?'([^']+(?:''[^']*)*)'/g)].map((m) => m[1] ?? "");
    expect(executed.length).toBeGreaterThan(0);
    for (const sql of executed) {
      expect(sql).toMatch(
        /^(DROP INDEX IF EXISTS public\.\w+|REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC|ALTER TABLE public\.website_settings\s+ADD CONSTRAINT website_settings_lead_webhook_url_length[\s\S]*NOT VALID)$/,
      );
    }
  });

  it("never grants to browser roles, drops tables or deletes rows", () => {
    expect(code).not.toMatch(/\bGRANT\b/i);
    expect(code).not.toMatch(/\bDROP\s+(TABLE|SCHEMA|COLUMN|FUNCTION|CONSTRAINT)\b/i);
    expect(code).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(code).not.toMatch(/\bTRUNCATE\s+(TABLE\s+)?public\./i);
    expect(code).not.toMatch(/\bUPDATE\s+public\./i);
    expect(code).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(code).not.toMatch(/\bDISABLE ROW LEVEL SECURITY\b/i);
    expect(code).not.toMatch(/AS PERMISSIVE/i);
  });

  it("keeps schema private usable by RLS policies", () => {
    expect(code).not.toMatch(/ON SCHEMA private/i);
  });

  it("covers each audited gap", () => {
    expect(code).toContain("REVOKE ALL ON public.invoices FROM anon;");
    expect(code).toContain("REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.invoices FROM authenticated;");
    for (const table of ["platform_accounts", "platform_trials"]) {
      for (const cmd of ["insert", "update", "delete"])
        expect(code).toMatch(new RegExp(`CREATE POLICY ${table}_deny_client_${cmd}\\s+ON public\\.${table}\\s+AS RESTRICTIVE\\s+FOR ${cmd.toUpperCase()}\\s+TO anon, authenticated`, "i"));
      expect(code).toContain(`REVOKE TRUNCATE, INSERT, UPDATE, DELETE ON public.${table} FROM anon, authenticated;`);
    }
    expect(code).toMatch(/to_regclass\('public\.leads_org_created_idx'\) IS NOT NULL THEN\s+EXECUTE 'DROP INDEX IF EXISTS public\.leads_org_recent_idx'/);
    expect(code).toMatch(/to_regclass\('public\.payment_events_provider_event_uniq'\) IS NOT NULL THEN\s+EXECUTE 'DROP INDEX IF EXISTS public\.payment_events_provider_event_idx'/);
    for (const sig of [
      "private.production_unlocked(uuid)",
      "private.protect_org_billing_columns()",
      "private.default_org_billing_columns()",
      "private.freeze_organization_id()",
    ])
      expect(code).toContain(`'${sig}'`);
    expect(code).toContain("to_regprocedure(sig) IS NOT NULL");
    expect(code).toMatch(/char_length\(lead_webhook_url\) <= 2048\) NOT VALID/);
    expect(code).toMatch(/NOT EXISTS \(\s+SELECT 1 FROM pg_constraint\s+WHERE conname = 'website_settings_lead_webhook_url_length'/);
  });

  it("does not read platform tables from a browser client anywhere in src", () => {
    // The deny policies are safe only because every access is server-side.
    for (const file of ["src/lib/platform-funnel.functions.ts", "src/lib/stripe-billing.server.ts"]) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toMatch(/from "@\/integrations\/supabase\/client"/);
    }
  });
});

describe("neutralised migrations replay safely", () => {
  it("guards outcome-table DDL behind to_regclass", () => {
    for (const file of [
      "supabase/migrations/20260919000000_workspace_provisioning_and_outcome_rls_hardening.sql",
      "supabase/migrations/20260919010000_final_production_hardening.sql",
    ]) {
      const sql = readFileSync(file, "utf8");
      const guard = sql.indexOf("IF to_regclass('public.outcome_snapshots') IS NOT NULL");
      expect(guard, file).toBeGreaterThan(0);
      const before = sql.slice(0, guard);
      expect(before, file).not.toMatch(/ON public\.(outcome_snapshots|outcome_evidence|improvement_recommendations)\b/);
    }
  });

  it("revokes website RPCs only when they exist", () => {
    const sql = readFileSync("supabase/migrations/20261005000000_harden_website_rpc_execute.sql", "utf8");
    expect(sql).toContain("to_regprocedure(sig) IS NOT NULL");
    expect(sql.replace(/--.*$/gm, "")).not.toMatch(/^\s*REVOKE ALL ON FUNCTION public\./m);
  });
});
