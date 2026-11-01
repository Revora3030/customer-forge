import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SITE_RULES_LIMIT,
  checkSiteRules,
  normalizeSiteRules,
  siteRulesBrief,
} from "@/lib/builder/site-rules";
import {
  deleteSiteRules,
  loadSiteRules,
  saveSiteRules,
  siteRulesBriefFor,
} from "@/lib/builder/site-rules.server";

function fakeClient(
  initial: string | null,
  opts: { failWrite?: boolean; failRead?: boolean } = {},
) {
  let stored = initial;
  const calls: { upsert?: Record<string, unknown>; deletedOrg?: string; readOrg?: string } = {};
  const client = {
    from: (table: string) => {
      expect(table).toBe("website_rules");
      return {
        select: () => ({
          eq: (_c: string, value: string) => ({
            maybeSingle: async () => {
              calls.readOrg = value;
              if (opts.failRead) throw new Error("down");
              return { data: stored === null ? null : { rules: stored }, error: null };
            },
          }),
        }),
        upsert: async (row: Record<string, unknown>) => {
          if (opts.failWrite) return { error: { message: "denied" } };
          calls.upsert = row;
          stored = row["rules"] as string;
          return { error: null };
        },
        delete: () => ({
          eq: async (_c: string, value: string) => {
            if (opts.failWrite) return { error: { message: "denied" } };
            calls.deletedOrg = value;
            stored = null;
            return { error: null };
          },
        }),
      };
    },
  };
  return { client: client as never, calls, current: () => stored };
}

describe("owner rules for my site: text", () => {
  it("limit is 2,000 characters", () => expect(SITE_RULES_LIMIT).toBe(2000));

  it("tidies whitespace and control characters without changing the words", () => {
    expect(normalizeSiteRules("  Never say cheap.\r\n\r\n\r\n\r\nTone: friendly\u0007  \n")).toBe(
      "Never say cheap.\n\nTone: friendly",
    );
    expect(normalizeSiteRules(42)).toBe("");
  });

  it("accepts exactly 2,000 characters and refuses 2,001 with a plain message", () => {
    expect(checkSiteRules("a".repeat(2000))).toEqual({ ok: true, rules: "a".repeat(2000) });
    const over = checkSiteRules("a".repeat(2001));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.message).toMatch(/2,000 characters.*shorten it by 1/);
  });

  it("refuses an empty save (deleting is the way to clear)", () => {
    expect(checkSiteRules("   ").ok).toBe(false);
  });

  it("builds a brief that carries the owner's words and says it never changes facts", () => {
    const brief = siteRulesBrief("Never say cheap. Serve Tampa Bay only.");
    expect(brief).toContain("Never say cheap. Serve Tampa Bay only.");
    expect(brief).toMatch(/Always follow/);
    expect(brief).toMatch(/do not change what is true/);
    expect(siteRulesBrief("")).toBeNull();
    expect(siteRulesBrief(undefined)).toBeNull();
  });

  it("caps the brief at the limit even if stored text is longer", () => {
    const brief = siteRulesBrief("Z".repeat(5000)) as string;
    expect(brief.match(/Z/g)?.length).toBe(2000);
  });
});

describe("owner rules for my site: storage", () => {
  it("saves, reads back, edits and deletes", async () => {
    const db = fakeClient(null);
    expect(await loadSiteRules(db.client, "org-1")).toBe("");
    await saveSiteRules(db.client, "org-1", "user-1", "Never say cheap.");
    expect(db.calls.upsert).toMatchObject({
      organization_id: "org-1",
      rules: "Never say cheap.",
      updated_by: "user-1",
    });
    expect(await loadSiteRules(db.client, "org-1")).toBe("Never say cheap.");
    await saveSiteRules(db.client, "org-1", null, "Friendly tone.");
    expect(await loadSiteRules(db.client, "org-1")).toBe("Friendly tone.");
    await deleteSiteRules(db.client, "org-1");
    expect(db.calls.deletedOrg).toBe("org-1");
    expect(await siteRulesBriefFor(db.client, "org-1")).toBeNull();
  });

  it("refuses an over-limit save before touching the database", async () => {
    const db = fakeClient(null);
    await expect(saveSiteRules(db.client, "org-1", null, "x".repeat(2001))).rejects.toThrow(
      /2,000 characters/,
    );
    expect(db.calls.upsert).toBeUndefined();
  });

  it("says plainly when a save or delete is refused", async () => {
    const db = fakeClient(null, { failWrite: true });
    await expect(saveSiteRules(db.client, "org-1", null, "ok")).rejects.toThrow(
      /couldn't be saved/,
    );
    await expect(deleteSiteRules(db.client, "org-1")).rejects.toThrow(/couldn't be deleted/);
  });

  it("a failed read means no rules, never a failed build", async () => {
    const db = fakeClient("rules", { failRead: true });
    expect(await loadSiteRules(db.client, "org-1")).toBe("");
    expect(await siteRulesBriefFor(db.client, "org-1")).toBeNull();
  });

  it("builds the brief for the right workspace only", async () => {
    const db = fakeClient("Never say cheap.");
    expect(await siteRulesBriefFor(db.client, "org-9")).toContain("Never say cheap.");
    expect(db.calls.readOrg).toBe("org-9");
  });
});

describe("owner rules for my site: wiring and migration", () => {
  const agent = readFileSync("src/lib/site-agent.functions.ts", "utf8");
  const sql = readFileSync("supabase/migrations/20261101050000_website_rules.sql", "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("every build recalls the rules and counts them as a standing brief", () => {
    const block = agent.slice(agent.indexOf("siteRulesBriefFor"));
    expect(block).toMatch(/ownerRules/);
    expect(block.slice(0, 600)).toMatch(/standingBriefs \+= 1/);
  });

  it("migration is additive, capped at 2,000 characters, with RLS", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.website_rules/);
    expect(sql).toMatch(/BETWEEN 1 AND 2000/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/FOR SELECT TO authenticated/);
    expect(sql).not.toMatch(/DROP |ALTER TABLE public\.(?!website_rules)/i);
  });
});
