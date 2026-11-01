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
