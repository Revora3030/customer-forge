import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261105070000_business_memory.sql", "utf8");
const lower = sql.toLowerCase();

describe("business memory migration", () => {
  it("only guards the vector extension and adds the three new tables", () => {
    expect(lower).toContain("create extension if not exists vector");
    expect([...lower.matchAll(/create table (?:if not exists )?(\S+)/g)].map((m) => m[1]).sort()).toEqual([
      "public.business_memory",
      "public.business_memory_embeddings",
      "public.business_memory_events",
    ]);
    expect(lower).not.toMatch(/alter table (?:if exists )?(?:only )?public\.(?!business_memory)/);
    // Only re-runnable drops of its own policies; nothing existing is dropped.
    const drops = [...lower.matchAll(/drop \w+ (?:if exists )?(\S+)/g)].map((m) => m[1]);
    expect(drops.length).toBeGreaterThan(0);
    expect(drops.every((name) => (name ?? "").startsWith("business_memory_"))).toBe(true);
    expect(lower).not.toMatch(/drop (table|column|function|extension|schema)/);
  });

  it("turns on row level security for every table", () => {
    for (const table of ["business_memory", "business_memory_events", "business_memory_embeddings"]) {
      expect(lower).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("scopes policies by workspace membership and never lets anon in", () => {
    expect(lower).toContain("private.is_org_member(organization_id)");
    expect(lower).toContain("private.can_manage_org(organization_id)");
    expect(lower).not.toMatch(/to anon/);
    expect(lower).not.toMatch(/to public/);
    expect(lower).toMatch(/revoke all on table public\.business_memory, public\.business_memory_events, public\.business_memory_embeddings from public, anon, authenticated/);
  });

  it("has no hard delete for signed-in users and keeps vectors service-role only", () => {
    expect(lower).not.toMatch(/grant[^;]*\bdelete\b[^;]*to authenticated/);
    expect(lower).not.toMatch(/grant[^;]*business_memory_embeddings[^;]*to authenticated/);
    expect(lower).toMatch(/grant all on table[^;]*business_memory_embeddings[^;]*to service_role/);
    expect(lower).toMatch(/revoke all on table[^;]*business_memory_embeddings[^;]*from public, anon, authenticated/);
    const policies = [...lower.matchAll(/create policy \w+ on public\.business_memory_embeddings\s+for all to (\w+)/g)].map((m) => m[1]);
    expect(policies).toEqual(["service_role"]);
    expect(lower.match(/on public\.business_memory_embeddings\s+for /g)).toHaveLength(1);
  });

  it("keeps the source and confirmation rules in the database", () => {
    for (const name of ["business_memory_fact_has_source", "business_memory_inferred_needs_owner", "business_memory_style_is_owner", "business_memory_confirmed_has_time"]) {
      expect(lower).toContain(name);
    }
    expect(lower).toContain("business_memory_confirmed_key_uidx");
    expect(lower).toContain("using hnsw");
  });

  it("recall function is invoker-rights and service-role only", () => {
    expect(lower).toMatch(/function public\.match_business_memory/);
    expect(lower).toContain("security invoker");
    expect(lower).toMatch(/revoke all on function public\.match_business_memory[^;]*from public, anon, authenticated/);
    expect(lower).toMatch(/grant execute on function public\.match_business_memory[^;]*to service_role/);
  });
});
