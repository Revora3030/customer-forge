/**
 * Self-tests for the static RLS harness. They prove the harness itself fails
 * on bad SQL, so a green cross-tenant suite means something.
 */
import { describe, expect, it } from "vitest";
import { buildRlsModel } from "./rls-model";
import {
  ANON,
  OWNER_A_VS_B,
  OWNER_OF_ROW,
  accessFor,
  evalPredicate,
  splitTop,
} from "./policy-eval";

const model = (sql: string) => buildRlsModel([{ name: "001.sql", sql }]);
const table = (sql: string, name = "public.t") => {
  const t = model(sql).tables.get(name);
  if (!t) throw new Error(`fixture table ${name} missing`);
  return t;
};

const BASE = `
create schema if not exists private;
create table public.t (id uuid primary key, organization_id uuid not null, user_id uuid, secret text);
`;

describe("rls model replay", () => {
  it("tracks RLS enable/disable and policy create/drop in order", () => {
    const t = table(`${BASE}
      alter table public.t enable row level security;
      create policy p1 on public.t for select to authenticated using (private.is_org_member(organization_id));
      create policy p2 on public.t for all to authenticated using (true) with check (true);
      drop policy p2 on public.t;`);
    expect(t.rlsEnabled).toBe(true);
    expect([...t.policies.keys()].sort()).toEqual(["p1"]);
  });

  it("sees RLS turned back off by a later statement", () => {
    const t = table(`${BASE}
      alter table public.t enable row level security;
      alter table public.t disable row level security;`);
    expect(t.rlsEnabled).toBe(false);
  });

  it("expands policies generated in DO blocks over a table array", () => {
    const m = model(`${BASE}
      create table public.u (id uuid, organization_id uuid);
      do $$
      declare t text;
        all_tables text[] := array['t','u'];
      begin
        foreach t in array all_tables loop
          execute format('alter table public.%I enable row level security', t);
          execute format('create policy %I on public.%I for all to authenticated using (private.is_org_member(organization_id))', t || '_member_all', t);
        end loop;
      end $$;`);
    for (const name of ["public.t", "public.u"]) {
      const t = m.tables.get(name);
      expect(t?.rlsEnabled, name).toBe(true);
      expect(t?.policies.size, name).toBe(1);
    }
  });

  it("applies table-level REVOKE over earlier column-level GRANTs", () => {
    const t = table(`${BASE}
      grant select (id, organization_id) on public.t to anon;
      revoke all on public.t from anon;`);
    expect(t.columnGrants.get("anon")?.get("select")?.size ?? 0).toBe(0);
  });

  it("forgets a dropped function", () => {
    const m = model(`${BASE}
      create function public.f(_a uuid) returns boolean language sql security definer as $$ select true $$;
      drop function if exists public.f(uuid);`);
    expect([...m.functions.keys()].some((k) => k.startsWith("public.f("))).toBe(false);
  });
});

describe("predicate evaluator", () => {
  it("splits OR/AND only at the top level", () => {
    expect(splitTop("a or (b or c) and d", "or")).toEqual(["a", "(b or c) and d"]);
    expect(splitTop("a and (b and c)", "and")).toEqual(["a", "(b and c)"]);
  });

  it("treats a membership check as false for another tenant's owner and true for the row's owner", () => {
    const p = "private.is_org_member(organization_id)";
    expect(evalPredicate(p, OWNER_A_VS_B).value).toBe(false);
    expect(evalPredicate(p, OWNER_OF_ROW).value).toBe(true);
    expect(evalPredicate(p, ANON).value).toBe(false);
  });

  it("evaluates role floors", () => {
    const manager = "private.org_role_at_least(organization_id, 'manager')";
    expect(evalPredicate(manager, { ...OWNER_OF_ROW, manager: false, admin: false }).value).toBe(false);
    expect(evalPredicate(manager, OWNER_OF_ROW).value).toBe(true);
  });

  it("flags and fails closed on shapes it does not understand", () => {
    const r = evalPredicate("some_custom_check(organization_id)", OWNER_A_VS_B);
    expect(r.value).toBe(true); // worst case for a leak
    expect(r.unknownAtoms).toEqual(["some_custom_check(organization_id)"]);
  });

  it("does not let a membership OR hide an open branch", () => {
    expect(evalPredicate("private.is_org_member(organization_id) or true", OWNER_A_VS_B).value).toBe(true);
  });
});

describe("access matrix catches leaky policies", () => {
  const leaky = (policy: string) =>
    table(`${BASE} alter table public.t enable row level security; ${policy}`);

  it("flags using (true) for authenticated", () => {
    const t = leaky(`create policy leak on public.t for select to authenticated using (true);`);
    expect(accessFor(t, OWNER_A_VS_B, "SELECT").allowed).toBe(true);
  });

  it("flags a write policy with no membership check", () => {
    const t = leaky(`create policy leak on public.t for insert to authenticated with check (auth.uid() is not null);`);
    expect(accessFor(t, OWNER_A_VS_B, "INSERT").allowed).toBe(true);
  });

  it("flags an FOR ALL policy that is open to the public role (anon)", () => {
    const t = leaky(`create policy leak on public.t for all using (true) with check (true);`);
    expect(accessFor(t, ANON, "DELETE").allowed).toBe(true);
  });

  it("flags a table with RLS off", () => {
    const t = table(BASE);
    expect(accessFor(t, ANON, "SELECT").allowed).toBe(true);
  });

  it("passes a membership-scoped policy", () => {
    const t = leaky(`create policy ok on public.t for all to authenticated
      using (private.is_org_member(organization_id)) with check (private.is_org_member(organization_id));`);
    for (const cmd of ["SELECT", "INSERT", "UPDATE", "DELETE"] as const) {
      expect(accessFor(t, OWNER_A_VS_B, cmd).allowed, cmd).toBe(false);
      expect(accessFor(t, ANON, cmd).allowed, cmd).toBe(false);
      expect(accessFor(t, OWNER_OF_ROW, cmd).allowed, cmd).toBe(true);
    }
  });

  it("lets a restrictive deny override a permissive grant", () => {
    const t = leaky(`create policy ok on public.t for all to authenticated using (private.is_org_member(organization_id)) with check (private.is_org_member(organization_id));
      create policy deny on public.t as restrictive for insert to authenticated with check (false);`);
    expect(accessFor(t, OWNER_OF_ROW, "INSERT").allowed).toBe(false);
    expect(accessFor(t, OWNER_OF_ROW, "SELECT").allowed).toBe(true);
  });

  it("catches an UPDATE whose WITH CHECK is open (a row could be moved to another tenant)", () => {
    const t = leaky(`create policy upd on public.t for update to authenticated using (private.is_org_member(organization_id)) with check (true);`);
    // Owner of the row's tenant passes `using`; an outsider fails it, so the open check alone is not a leak...
    expect(accessFor(t, OWNER_A_VS_B, "UPDATE").allowed).toBe(false);
    // ...but the check is open, which is what lets a member re-parent a row, so the suite flags it separately.
    expect(t.policies.get("upd")?.withCheck).toBe("true");
  });
});
