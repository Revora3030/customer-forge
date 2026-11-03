/**
 * Golden master for fail-safe builder mutations.
 *
 * Fixed fixture sites + fixed edit bundles, with the expected outcome of every
 * step written down here. A change to resolution or partial-apply behaviour
 * must change this file on purpose, never by accident.
 */
import { describe, expect, it } from "vitest";
import { readActions, type AgentAction } from "@/lib/site-agent";
import { preflightActions, stalePlanMessage } from "./apply-plan";
import { applySummary, skippedReasons } from "./apply-report";
import {
  hintForSection,
  kindFromId,
  resolutionLines,
  resolvePlanTargets,
  resolveSectionTarget,
  type ResolverSite,
} from "./section-resolver";

/* --------------------------------- fixtures -------------------------------- */

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HOME = u(1);
const ABOUT = u(2);
/** A real-looking id that is on neither fixture site (deleted / rebuilt). */
const GONE = u(999);

const SITE: ResolverSite = {
  pages: [
    { id: HOME, slug: "/" },
    { id: ABOUT, slug: "about" },
  ],
  sections: [
    { id: u(101), pageId: HOME, kind: "hero", heading: "Roof repairs done right, first time", sortOrder: 0 },
    { id: u(102), pageId: HOME, kind: "services", heading: "Roofing services we offer", sortOrder: 1 },
    { id: u(103), pageId: HOME, kind: "services", heading: "Gutter cleaning plans", sortOrder: 2 },
    { id: u(104), pageId: HOME, kind: "gallery", heading: "Recent jobs", sortOrder: 3 },
    { id: u(105), pageId: HOME, kind: "faq", heading: "Questions homeowners ask", sortOrder: 4 },
    { id: u(106), pageId: HOME, kind: "gallery", heading: "Before and after", sortOrder: 5 },
    { id: u(201), pageId: ABOUT, kind: "hero", heading: "Family run since day one", sortOrder: 0 },
    { id: u(202), pageId: ABOUT, kind: "team", heading: "Meet the crew", sortOrder: 1 },
  ],
};

const homeHint = (extra: Record<string, unknown>) => ({ pageId: HOME, pageSlug: "/", pageSectionCount: 6, ...extra });

/* ------------------------- per-step golden outcomes ------------------------ */

type Case = {
  name: string;
  id: string;
  hint?: Record<string, unknown>;
  expect: { strategy: string | null; id: string | null; reason?: string };
};

const CASES: Case[] = [
  { name: "exact id", id: u(105), expect: { strategy: "exact", id: u(105) } },
  { name: "near-miss id (one character dropped) repaired", id: u(105).slice(0, -1), expect: { strategy: "exact", id: u(105) } },
  { name: "id mismatch → role (only faq on the page)", id: GONE, hint: homeHint({ kind: "faq", position: 4 }), expect: { strategy: "role", id: u(105) } },
  { name: "descriptive id → role (team is unique site-wide)", id: "team-section", expect: { strategy: "role", id: u(202) } },
  { name: "stale page id, page found by slug → role", id: GONE, hint: { pageId: u(998), pageSlug: "about", kind: "hero" }, expect: { strategy: "role", id: u(201) } },
  {
    name: "id mismatch → headline (two services sections, heading decides)",
    id: GONE,
    hint: homeHint({ kind: "services", heading: "Our roofing services" }),
    expect: { strategy: "headline", id: u(102) },
  },
  {
    name: "id mismatch, no kind → headline",
    id: GONE,
    hint: homeHint({ heading: "Questions homeowners ask us" }),
    expect: { strategy: "headline", id: u(105) },
  },
  {
    name: "id mismatch → nearest position among same-kind sections",
    id: GONE,
    hint: homeHint({ kind: "gallery", position: 3 }),
    expect: { strategy: "position", id: u(104) },
  },
  {
    name: "id mismatch, no kind, unchanged layout → exact position",
    id: GONE,
    hint: homeHint({ position: 2 }),
    expect: { strategy: "position", id: u(103) },
  },
  {
    name: "low confidence: hinted kind no longer exists",
    id: GONE,
    hint: homeHint({ kind: "pricing", heading: "Simple pricing", position: 2 }),
    expect: { strategy: null, id: null, reason: "no pricing section is on the page any more" },
  },
  {
    name: "low confidence: two galleries equally near",
    id: GONE,
    hint: homeHint({ kind: "gallery", position: 4 }),
    expect: { strategy: null, id: null, reason: "2 sections could match and none stood out" },
  },
  {
    name: "low confidence: role ambiguous site-wide, nothing else to go on",
    id: "hero",
    expect: { strategy: null, id: null, reason: "2 sections could match and none stood out" },
  },
  {
    name: "low confidence: position only, page layout changed",
    id: GONE,
    hint: { pageId: HOME, position: 2, pageSectionCount: 9 },
    expect: { strategy: null, id: null, reason: "the page's layout changed since the plan, so its position alone isn't safe to go by" },
  },
  {
    name: "low confidence: nothing to identify it by",
    id: GONE,
    expect: { strategy: null, id: null, reason: "no matching section and nothing to identify it by" },
  },
];

describe("golden master: semantic section resolution", () => {
  for (const testCase of CASES) {
    it(testCase.name, () => {
      const result = resolveSectionTarget(testCase.id, testCase.hint, SITE);
      expect({ strategy: result.strategy, id: result.id, ...(result.id ? {} : { reason: (result as { reason: string }).reason }) }).toEqual(
        testCase.expect,
      );
    });
  }

  it("never retargets a weak heading match across a missing kind", () => {
    // "Recent roofing jobs nearby" is 0.67 similar to "Recent jobs" — enough
    // when the kind agrees, not enough when the planner's kind is gone.
    const result = resolveSectionTarget(GONE, homeHint({ kind: "portfolio", heading: "Recent roofing jobs nearby" }), SITE);
    expect(result.id).toBeNull();
  });

  it("reads descriptive ids only as kinds the site really has", () => {
    const kinds = new Set(SITE.sections.map((s) => s.kind));
    expect(kindFromId("faq-section", kinds)).toBe("faq");
    expect(kindFromId("services_block_2", kinds)).toBe("services");
    expect(kindFromId("pricing", kinds)).toBeNull();
    expect(kindFromId(GONE, kinds)).toBeNull();
    expect(kindFromId("temp_section_1", kinds)).toBeNull();
  });
});

/* ------------------------------ bundle golden ------------------------------ */

const ANY_ID = { has: () => true } as unknown as Set<string>;
const KNOWN = {
  pageIds: new Set(SITE.pages.map((p) => p.id)),
  sectionIds: new Set(SITE.sections.map((s) => s.id)),
  componentIds: new Set<string>(),
};

/** The apply preflight exactly as `applyImpl` runs it: resolve → read → preflight. */
function runBundle(bundle: unknown[]) {
  const targets = resolvePlanTargets(bundle, SITE);
  const planned = readActions(targets.actions, { pageIds: ANY_ID, sectionIds: ANY_ID, componentIds: ANY_ID });
  const preflight = preflightActions(planned, KNOWN);
  const stale = [
    ...targets.skipped.map((entry) => ({ type: entry.type as AgentAction["type"], target: entry.target, reason: "missing_section" as const })),
    ...preflight.stale,
  ];
  const details = [
    ...preflight.ok.map((action) => `applied ${action.type}`),
    ...resolutionLines(targets.resolved, targets.skipped),
    ...preflight.stale.map((entry) => `stale ${entry.type} (${entry.reason})`),
  ];
  return {
    ok: preflight.ok,
    staleCount: stale.length,
    notice: stalePlanMessage(stale, planned.length + targets.skipped.length),
    strategies: targets.resolved.map((entry) => entry.strategy),
    details,
  };
}

describe("golden master: edit bundles (partial apply)", () => {
  it("exact-match bundle applies untouched", () => {
    const out = runBundle([
      { type: "set_section_text", sectionId: u(101), field: "heading", value: "Roofs fixed the same week" },
      { type: "set_section_visibility", sectionId: u(106), visible: false },
    ]);
    expect(out.ok.map((a) => (a as { sectionId: string }).sectionId)).toEqual([u(101), u(106)]);
    expect(out.staleCount).toBe(0);
    expect(out.strategies).toEqual([]);
    expect(out.notice).toBe("");
  });

  it("the reported failure: both steps carry stale ids — now both resolve instead of '0 done · 2 didn't work'", () => {
    const out = runBundle([
      { type: "set_section_text", sectionId: GONE, field: "heading", value: "Answers before you call", targetHint: homeHint({ kind: "faq", heading: "Questions homeowners ask", position: 4 }) },
      { type: "set_section_text", sectionId: "hero-section", field: "subheading", value: "Licensed crew, clear quotes", targetHint: homeHint({ kind: "hero", position: 0 }) },
    ]);
    expect(out.ok).toEqual([
      { type: "set_section_text", sectionId: u(105), field: "heading", value: "Answers before you call" },
      { type: "set_section_text", sectionId: u(101), field: "subheading", value: "Licensed crew, clear quotes" },
    ]);
    expect(out.strategies).toEqual(["role", "role"]);
    expect(out.staleCount).toBe(0);
  });

  it("mixed valid/invalid bundle applies the valid steps and reports the rest with reasons", () => {
    const out = runBundle([
      { type: "set_section_text", sectionId: u(102), field: "body", value: "Repairs, re-roofs and inspections." }, // exact
      { type: "set_section_visibility", sectionId: GONE, visible: false, targetHint: homeHint({ kind: "services", heading: "Gutter cleaning plan" }) }, // headline
      { type: "set_section_text", sectionId: GONE, field: "heading", value: "Transparent pricing", targetHint: homeHint({ kind: "pricing", position: 2 }) }, // low confidence
      { type: "set_block_style", target: "section", targetId: GONE, patch: { bgColor: "#08090b" }, targetHint: homeHint({ kind: "gallery", position: 3 }) }, // position
    ]);
    expect(out.ok.map((a) => a.type)).toEqual(["set_section_text", "set_section_visibility", "set_block_style"]);
    expect(out.ok.map((a) => (a as { sectionId?: string; targetId?: string }).sectionId ?? (a as { targetId?: string }).targetId)).toEqual([
      u(102),
      u(103),
      u(104),
    ]);
    expect(out.strategies).toEqual(["headline", "position"]);
    expect(out.staleCount).toBe(1);
    expect(out.notice).toBe(
      "1 of those 4 updates pointed at a section that isn't there any more. Revora kept the updates that still fit and skipped the rest.",
    );
    // The chat card counts and explains exactly what happened.
    expect(applySummary({ applied: out.ok.length, failed: 0, stale: out.staleCount, details: out.details })).toBe(
      "Updated your draft · 3 changes. 1 change didn't go through — I couldn't tell for sure which section some updates were for, so I left those alone rather than guess.",
    );
  });

  it("a bundle with nothing resolvable is reported with counts, never applied to a guess", () => {
    const out = runBundle([
      { type: "set_section_text", sectionId: GONE, field: "heading", value: "X marks the spot" },
      { type: "set_section_visibility", sectionId: "hero", visible: false },
    ]);
    expect(out.ok).toEqual([]);
    expect(out.staleCount).toBe(2);
    expect(skippedReasons(out.details)).toEqual([
      "I couldn't tell for sure which section some updates were for, so I left those alone rather than guess",
    ]);
  });

  it("temporary refs and creators pass through resolution untouched", () => {
    const bundle = [
      { type: "add_section", pageId: HOME, ref: "temp_s1", kind: "faq", heading: "More questions" },
      { type: "set_section_text", sectionId: "temp_s1", field: "body", value: "Ask us anything." },
    ];
    const targets = resolvePlanTargets(bundle, SITE);
    expect(targets.actions).toEqual(bundle);
    expect(targets.resolved).toEqual([]);
    expect(targets.skipped).toEqual([]);
  });

  it("plan-time hints let apply re-find sections after a rebuild changed every id", () => {
    const plannedHints = [u(105), u(103), u(201)].map((id) => hintForSection(id, SITE));
    const rebuilt: ResolverSite = {
      pages: [
        { id: u(11), slug: "/" },
        { id: u(12), slug: "about" },
      ],
      sections: SITE.sections.map((s, i) => ({ ...s, id: u(500 + i), pageId: s.pageId === HOME ? u(11) : u(12) })),
    };
    const bundle = plannedHints.map((targetHint, i) => ({
      type: "set_section_text",
      sectionId: [u(105), u(103), u(201)][i],
      field: "body",
      value: `Updated ${i}`,
      targetHint,
    }));
    const targets = resolvePlanTargets(bundle, rebuilt);
    expect(targets.skipped).toEqual([]);
    expect(targets.resolved.map((r) => [r.to, r.strategy])).toEqual([
      [u(504), "role"], // faq
      [u(502), "headline"], // second services section
      [u(506), "role"], // about-page hero (page found by slug)
    ]);
  });
});
