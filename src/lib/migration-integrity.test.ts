/**
 * Guards for the supabase/migrations folder. Each rule here comes from a real
 * failure: a migration that could not apply on the live database even though
 * it was merged.
 *
 *  - 20260828212711 moved the SECURITY DEFINER helpers (is_org_member,
 *    can_manage_org, has_support_access, is_super_admin) from public to
 *    private, so a later policy that calls public.is_org_member(...) fails with
 *    ERROR 42883 (function does not exist).
 *  - A dollar-quoted body that is never closed swallows the rest of the file.
 *  - Two files with the same version collide on schema_migrations.version.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIR = "supabase/migrations";
const MOVED_TO_PRIVATE_AT = "20260829003401";
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

function versionOf(file: string): string {
  return file.split("_")[0] ?? "";
}

function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("supabase migrations integrity", () => {
  it("has no duplicate version prefixes among files newer than the Lovable-timestamped history", () => {
    const seen = new Map<string, string[]>();
    for (const f of files) {
      const v = versionOf(f);
      seen.set(v, [...(seen.get(v) ?? []), f]);
    }
    const dupes = [...seen.entries()]
      .filter(([v, list]) => list.length > 1 && v > "20260928030955")
      .map(([, list]) => list.join(" + "));
    expect(dupes).toEqual([]);
  });

  it("never calls the old public.* org helpers after they moved to private", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (versionOf(f) <= MOVED_TO_PRIVATE_AT) continue;
      const code = stripComments(readFileSync(`${DIR}/${f}`, "utf8"));
      if (
        /\bpublic\.(is_org_member|can_manage_org|has_support_access|is_super_admin)\s*\(/i.test(code)
      ) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  // Files from here on were merged without being applied live and are applied
  // later, possibly out of order and possibly twice (2026-11-03 pre-apply review).
  const REVIEWED_FROM = "20261029000000";
  const recent = files.filter((f) => versionOf(f) >= REVIEWED_FROM);
  const code = (f: string) => stripComments(readFileSync(`${DIR}/${f}`, "utf8"));

  it("scopes recent workspace policies through private.is_org_member, never an inline memberships query", () => {
    // Latest definition of each policy wins (a later file may replace it).
    const latest = new Map<string, { file: string; body: string }>();
    for (const f of files) {
      for (const m of code(f).matchAll(/create\s+policy\s+"?([^"\n]+?)"?\s+on\s+(?:public\.)?(\w+)([\s\S]*?);/gi)) {
        latest.set(`${m[2]}.${m[1]}`, { file: f, body: m[3] ?? "" });
      }
    }
    const offenders = [...latest.entries()]
      .filter(([, p]) => versionOf(p.file) >= REVIEWED_FROM && /\b(?:public\.)?memberships\b/i.test(p.body))
      .map(([k, p]) => `${k} (${p.file})`);
    expect(offenders).toEqual([]);
  });

  it("revokes anon from every public table created by a recent migration", () => {
    const all = files.map(code).join("\n");
    const missing: string[] = [];
    for (const f of recent) {
      for (const m of code(f).matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi)) {
        const t = m[1] ?? "";
        const revoked = new RegExp(String.raw`revoke[^;]*\bon\s+(?:table\s+)?[^;]*public\.${t}\b[^;]*\bfrom\b[^;]*\banon\b`, "i");
        if (!revoked.test(all)) missing.push(`${t} (${f})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("keeps recent CREATE TABLE / CREATE INDEX re-runnable", () => {
    const offenders: string[] = [];
    for (const f of recent) {
      const sql = code(f);
      for (const m of sql.matchAll(/create\s+(?:unique\s+)?(table|index)\s+(?!if\s+not\s+exists)(?:concurrently\s+)?(?:public\.)?(\w+)/gi)) {
        // A CREATE TABLE inside an explicit "only when absent" guard is fine.
        if (m[1]?.toLowerCase() === "table" && new RegExp(String.raw`to_regclass\('public\.${m[2]}'\)\s+is\s+null`, "i").test(sql)) continue;
        offenders.push(`${f}: create ${m[1]} ${m[2]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("follow-up 20261103120000 fixes the reviewed files without touching data", () => {
    const followUp = "20261103120000_unapplied_migrations_followup.sql";
    expect(files).toContain(followUp);
    const sql = code(followUp);
    expect(sql).not.toMatch(/\b(drop\s+table|drop\s+column|truncate\s+(?:table\s+)?(?:only\s+)?public\.|delete\s+from|insert\s+into|update\s+public\.)/i);
    // Embedding FK follows its parent: dropped only when jarvis_memories has no auth.users FK (live drizzle 0010).
    expect(sql).toMatch(/if\s+not\s+exists\s*\([\s\S]*conrelid\s*=\s*'public\.jarvis_memories'::regclass[\s\S]*confrelid\s*=\s*'auth\.users'::regclass[\s\S]*\)\s*then\s*alter\s+table\s+public\.jarvis_memory_embeddings\s+drop\s+constraint\s+if\s+exists\s+jarvis_memory_embeddings_user_id_fkey/i);
    for (const t of ["site_hosting_grace", "agent_runs", "agent_run_steps", "agent_run_events", "estimate_signatures", "builder_quality_log", "lead_delivery_watch", "lead_watchdog_events"]) {
      expect(sql).toMatch(new RegExp(String.raw`revoke\s+insert,\s*update,\s*delete,\s*truncate[^;]*public\.${t}\s+from\s+authenticated`, "i"));
      expect(sql).toMatch(new RegExp(String.raw`revoke\s+all\s+on\s+public\.${t}\s+from\s+public,\s*anon`, "i"));
    }
    // The follow-up must sort after every migration it hardens.
    for (const reviewed of [
      "20261029151000_jarvis_memory_vectors.sql",
      "20261030140000_estimate_signatures.sql",
      "20261030141000_canceled_site_grace.sql",
      "20261031190000_builder_quality_log.sql",
      "20261101010000_lead_delivery_watchdog.sql",
      "20261101020000_agent_runs.sql",
    ]) {
      expect(files).toContain(reviewed);
      expect(files.indexOf(followUp)).toBeGreaterThan(files.indexOf(reviewed));
    }
  });

  it("closes every dollar-quoted body", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (versionOf(f) <= "20260928030955") continue;
      const code = stripComments(readFileSync(`${DIR}/${f}`, "utf8"));
      const tags = code.match(/\$[A-Za-z_0-9]*\$/g) ?? [];
      const counts = new Map<string, number>();
      for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
      if ([...counts.values()].some((n) => n % 2 !== 0)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
