import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Cross-workspace isolation, checked against the migration chain as written.
 * Every table created with an `organization_id` column is tenant data: its
 * rows must sit behind row level security, RLS must never be switched off, and
 * the anonymous role may never be granted anything beyond read/insert. This is
 * a static guard over migrations; it does not replace a live two-workspace test.
 */
const dir = "supabase/migrations";
const sql = readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(`${dir}/${name}`, "utf8"))
  .join("\n");

const tenantTables = [...sql.matchAll(/create table (?:if not exists )?(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\);/gi)]
  .filter((match) => /\borganization_id\b/.test(match[2] ?? ""))
  .map((match) => match[1]!);

/** Tables the first schema migration enables through a `foreach t in array` loop. */
const loopEnabled = new Set(
  [...sql.matchAll(/all_tables text\[\] := array\[([^\]]*)\]/gi)].flatMap((match) =>
    [...(match[1] ?? "").matchAll(/'(\w+)'/g)].map((name) => name[1]!),
  ),
);
const explicitlyEnabled = new Set(
  [...sql.matchAll(/alter table (?:if exists )?(?:only )?(?:public\.)?"?(\w+)"?\s+enable row level security/gi)].map((match) => match[1]!),
);

describe("tenant tables stay behind row level security", () => {
  it("finds the tenant tables it is meant to guard", () => {
    expect(tenantTables.length).toBeGreaterThan(50);
    for (const core of ["leads", "customers", "appointments", "subscriptions", "services"]) expect(tenantTables).toContain(core);
  });

  it("enables RLS on every table that carries an organization_id", () => {
    const open = [...new Set(tenantTables)].filter((table) => !explicitlyEnabled.has(table) && !loopEnabled.has(table));
    expect(open, `tenant tables without RLS: ${open.join(", ")}`).toEqual([]);
  });

  it("never switches RLS off on a tenant table", () => {
    const disabled = [...sql.matchAll(/alter table (?:if exists )?(?:only )?(?:public\.)?"?(\w+)"?\s+disable row level security/gi)]
      .map((match) => match[1]!)
      .filter((table) => tenantTables.includes(table));
    expect(disabled).toEqual([]);
  });

  it("never grants the anonymous role update, delete or full access to a tenant table", () => {
    const grants = [...sql.matchAll(/grant\s+([^;]*?)\s+on\s+(?:table\s+)?public\.(\w+)\s+to\s+([^;]*);/gi)]
      .filter((match) => /\banon\b/i.test(match[3] ?? "") && tenantTables.includes(match[2]!))
      .filter((match) => /\b(update|delete|all|truncate)\b/i.test(match[1] ?? ""));
    expect(grants.map((match) => match[0])).toEqual([]);
  });
});
