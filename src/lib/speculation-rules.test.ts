/**
 * Speculation Rules + cross-document View Transitions.
 * The rules must be valid JSON in <head>, prefetch-only (no prerender, which
 * would run analytics and the auth bootstrap in a hidden tab), moderate
 * eagerness, and never touch signed-in, token-bearing or side-effect paths.
 * View transitions must only be enabled when reduced motion is not requested.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

import { Route } from "@/routes/__root";
import { SPECULATION_EXCLUDED_PATHS, SPECULATION_RULES, SPECULATION_RULES_JSON } from "@/lib/speculation-rules";

type Head = { scripts?: { type?: string; children?: string }[] };
const rootHead = (matches: { routeId: string; loaderData?: unknown }[]): Head => {
  const head = Route.options.head as unknown as (ctx: { matches: unknown[] }) => Head;
  return head({ matches });
};
const speculation = (head: Head) => (head.scripts ?? []).filter((s) => s.type === "speculationrules");

const clientSite = { site: { org: { name: "Acme" }, content: { page: { slug: "about" } } } };

describe("speculation rules", () => {
  it("emits exactly one valid speculationrules script on Revora pages and client sites", () => {
    for (const head of [
      rootHead([{ routeId: "__root__" }, { routeId: "/", loaderData: null }]),
      rootHead([{ routeId: "__root__" }, { routeId: "/s/$slug", loaderData: clientSite }]),
    ]) {
      const scripts = speculation(head);
      expect(scripts).toHaveLength(1);
      expect(JSON.parse(String(scripts[0]?.children))).toEqual(SPECULATION_RULES);
    }
  });

  it("is prefetch-only with moderate eagerness", () => {
    const rules = JSON.parse(SPECULATION_RULES_JSON) as Record<string, { eagerness: string }[]>;
    expect(Object.keys(rules)).toEqual(["prefetch"]);
    expect(rules["prerender"]).toBeUndefined();
    expect(rules["prefetch"]?.every((rule) => rule.eagerness === "moderate")).toBe(true);
  });

  it.each(["/api", "/auth", "/app", "/admin", "/login", "/signup", "/portal", "/invite", "/unsubscribe", "/p", "/share", "/mcp"])(
    "excludes %s and everything under it",
    (base) => {
      expect(SPECULATION_EXCLUDED_PATHS).toContain(base);
      expect(SPECULATION_RULES_JSON).toContain(`"${base}"`);
      expect(SPECULATION_RULES_JSON).toContain(`"${base}/*"`);
    },
  );

  it("skips nofollow, opt-out, download and new-tab links", () => {
    for (const selector of ["[rel~=nofollow]", "[data-no-speculate]", "[download]", "[target=_blank]"]) {
      expect(SPECULATION_RULES_JSON).toContain(selector);
    }
  });

  it("cannot break out of the inline script", () => {
    expect(SPECULATION_RULES_JSON).not.toMatch(/<\/?script/i);
  });
});

describe("cross-document view transitions", () => {
  const css = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

  it("are enabled only inside a prefers-reduced-motion: no-preference block", () => {
    const at = css.indexOf("@view-transition");
    expect(at).toBeGreaterThan(-1);
    expect(css.indexOf("@view-transition", at + 1)).toBe(-1);
    const block = css.lastIndexOf("@media (prefers-reduced-motion: no-preference)", at);
    expect(block).toBeGreaterThan(-1);
    // No closing of the media block between its opening and the at-rule.
    const between = css.slice(block, at);
    expect(between.split("{").length - between.split("}").length).toBe(1);
    expect(css.slice(at, at + 60)).toMatch(/navigation:\s*auto/);
  });
});
