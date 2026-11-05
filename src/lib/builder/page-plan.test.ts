import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_PLAN_PAGES,
  MAX_PLAN_VERSIONS,
  addPage,
  applyScopedRevision,
  approveLatest,
  approvedPlan,
  architectPlanBlock,
  describeChange,
  diffPlans,
  editPage,
  isApproved,
  movePage,
  planFromBrief,
  planRevisionMessages,
  pushVersion,
  readHistory,
  readPlan,
  removePage,
  restoreVersion,
  type PagePlan,
  type PlanHistory,
} from "@/lib/builder/page-plan";

const NOW = "2026-11-05T12:00:00.000Z";
const empty: PlanHistory = { versions: [], approvedVersion: null };
const base: PagePlan = {
  pages: [
    { slug: "home", title: "Home", purpose: "Win the call", points: ["Opening", "Services"] },
    { slug: "services", title: "Services", purpose: "Explain each service", points: ["Detail", "Prices"] },
    { slug: "contact", title: "Contact", purpose: "", points: [] },
  ],
};

describe("planFromBrief", () => {
  it("uses only the brief's own pages and puts Home first", () => {
    const plan = planFromBrief(["Services", "About", "Contact"]);
    expect(plan.pages.map((p) => p.title)).toEqual(["Home", "Services", "About", "Contact"]);
    expect(plan.pages.every((p) => p.points.length === 0)).toBe(true);
  });
  it("does not add a second Home and de-duplicates slugs", () => {
    const plan = planFromBrief(["About", "Home", "About"]);
    expect(plan.pages.map((p) => p.slug)).toEqual(["home", "about", "about-2"]);
  });
  it("caps the page count", () => {
    expect(planFromBrief(Array.from({ length: 30 }, (_, i) => `Page ${i}`)).pages).toHaveLength(MAX_PLAN_PAGES);
  });
});

describe("readPlan and owner edits", () => {
  it("rejects junk and cleans text", () => {
    expect(readPlan(null)).toBeNull();
    expect(readPlan({ pages: [{ title: "  " }] })).toBeNull();
    const plan = readPlan({ pages: [{ title: "  Our   work ", points: ["a", "", 3] }, { title: "Home" }] });
    expect(plan?.pages[0]?.slug).toBe("home");
    expect(plan?.pages[1]).toMatchObject({ title: "Our work", points: ["a"] });
  });
  it("edits one page and keeps its slug", () => {
    const next = editPage(base, "services", { title: "What we do", points: ["One"] });
    expect(next.pages[1]).toMatchObject({ slug: "services", title: "What we do", points: ["One"] });
    expect(next.pages[0]).toBe(base.pages[0]);
  });
  it("won't remove or move past Home", () => {
    expect(removePage(base, "home")).toBe(base);
    expect(movePage(base, "services", -1)).toBe(base);
    expect(movePage(base, "services", 1).pages.map((p) => p.slug)).toEqual(["home", "contact", "services"]);
    expect(removePage(base, "contact").pages).toHaveLength(2);
  });
  it("adds a page with a unique slug", () => {
    const next = addPage(addPage(base, "Contact"), "Contact");
    expect(next.pages.map((p) => p.slug).slice(-2)).toEqual(["contact-2", "contact-3"]);
  });
});

describe("applyScopedRevision — only the highlighted part changes", () => {
  it("changes only the highlighted point and ignores edits elsewhere", () => {
    const proposed = {
      pages: [
        { ...base.pages[0], title: "Hijacked", points: ["Opening", "Services"] },
        { ...base.pages[1], points: ["Detail", "Fixed-price quotes"], purpose: "Changed too" },
        base.pages[2],
      ],
    };
    const out = applyScopedRevision(base, { slug: "services", pointIndex: 1 }, proposed);
    expect(out.plan.pages[1]?.points).toEqual(["Detail", "Fixed-price quotes"]);
    expect(out.plan.pages[1]?.purpose).toBe("Explain each service");
    expect(out.plan.pages[0]).toEqual(base.pages[0]);
    expect(out.changed).toBe(true);
    expect(out.ignoredOutsideEdits).toBeGreaterThan(0);
  });
  it("a page-level change replaces that page only and never the slug", () => {
    const proposed = { pages: base.pages.map((p) => (p.slug === "contact" ? { ...p, slug: "x", purpose: "Get a quote" } : p)) };
    const out = applyScopedRevision(base, { slug: "contact" }, proposed);
    expect(out.plan.pages[2]).toMatchObject({ slug: "contact", purpose: "Get a quote" });
    expect(out.plan.pages.slice(0, 2)).toEqual(base.pages.slice(0, 2));
  });
  it("returns the plan untouched when the model drops the page, adds pages, or returns junk", () => {
    expect(applyScopedRevision(base, { slug: "services" }, "nope").changed).toBe(false);
    expect(applyScopedRevision(base, { slug: "services" }, { pages: [base.pages[0]] }).plan).toBe(base);
    expect(applyScopedRevision(base, { slug: "missing" }, base).plan).toBe(base);
    const added = applyScopedRevision(base, { slug: "contact" }, { pages: [...base.pages, { title: "Extra" }] });
    expect(added.plan.pages).toHaveLength(3);
    expect(added.ignoredOutsideEdits).toBeGreaterThan(0);
  });
  it("an out-of-range point leaves the page alone", () => {
    expect(applyScopedRevision(base, { slug: "services", pointIndex: 9 }, base).changed).toBe(false);
  });
});

describe("what changed since the last version", () => {
  it("lists additions, removals, renames, moves, purpose and point changes", () => {
    const after: PagePlan = {
      pages: [
        base.pages[0]!,
        { slug: "contact", title: "Contact us", purpose: "Get a quote", points: [] },
        { slug: "services", title: "Services", purpose: "Explain each service", points: ["Detail", "Process"] },
        { slug: "faq", title: "FAQ", purpose: "", points: [] },
      ],
    };
    const text = diffPlans(base, after).map(describeChange);
    expect(text).toContain("Added page “FAQ”");
    expect(text).toContain("Renamed “Contact” to “Contact us”");
    expect(text).toContain("Changed what “Contact us” is for");
    expect(text).toContain("“Services”: added 1 and removed 1 points");
    expect(text.some((t) => t.startsWith("Moved “Services”"))).toBe(true);
    expect(diffPlans(after, base).map(describeChange)).toContain("Removed page “FAQ”");
    expect(diffPlans(base, base)).toEqual([]);
  });
});

describe("plan versions", () => {
  it("keeps every version, skips an identical save, and numbers upward", () => {
    let h = pushVersion(empty, base, "brief", "From your brief", NOW);
    h = pushVersion(h, base, "owner", "same", NOW);
    expect(h.versions).toHaveLength(1);
    h = pushVersion(h, editPage(base, "home", { purpose: "New" }), "owner", "Edited", NOW);
    expect(h.versions.map((v) => v.version)).toEqual([1, 2]);
  });
  it("approval follows the newest version and goes stale after an edit", () => {
    let h = approveLatest(pushVersion(empty, base, "owner", "", NOW));
    expect(isApproved(h)).toBe(true);
    expect(approvedPlan(h)).toEqual(base);
    h = pushVersion(h, editPage(base, "home", { purpose: "Different" }), "owner", "", NOW);
    expect(isApproved(h)).toBe(false);
    // The build still follows the version the owner actually approved.
    expect(approvedPlan(h)).toEqual(base);
  });
  it("going back makes a new version and never deletes", () => {
    let h = pushVersion(empty, base, "owner", "", NOW);
    h = pushVersion(h, editPage(base, "home", { purpose: "B" }), "owner", "", NOW);
    h = restoreVersion(h, 1, NOW);
    expect(h.versions).toHaveLength(3);
    expect(h.versions[2]).toMatchObject({ version: 3, source: "restore", plan: base });
    expect(restoreVersion(h, 99, NOW)).toBe(h);
  });
  it("caps history but never drops the approved version", () => {
    let h = approveLatest(pushVersion(empty, base, "owner", "", NOW));
    for (let i = 0; i < MAX_PLAN_VERSIONS + 5; i += 1) {
      h = pushVersion(h, editPage(base, "home", { purpose: `p${i}` }), "owner", "", NOW);
    }
    expect(h.versions).toHaveLength(MAX_PLAN_VERSIONS);
    expect(approvedPlan(h)).toEqual(base);
  });
  it("reads stored history safely", () => {
    expect(readHistory(undefined)).toEqual(empty);
    const stored = readHistory({ versions: [{ version: 2, plan: base, source: "x" }, { version: 1, plan: "bad" }], approvedVersion: 5 });
    expect(stored.versions).toHaveLength(1);
    expect(stored.versions[0]?.source).toBe("owner");
    expect(stored.approvedVersion).toBeNull();
  });
});

describe("prompts", () => {
  it("hands the architect the approved plan and forbids invented facts", () => {
    const block = architectPlanBlock(base);
    expect(block).toContain("OWNER-APPROVED PAGE PLAN");
    expect(block).toContain('2. Services (slug "services") — Explain each service');
    expect(block).toContain("Must cover: Detail; Prices");
    expect(block).toContain("inventing a fact");
  });
  it("tells the reviser which part is highlighted", () => {
    const [system, user] = planRevisionMessages(base, { slug: "services", pointIndex: 1 }, "Mention financing", "{}");
    expect(system?.content).toContain("Never touch other pages");
    expect(user?.content).toContain('only point 2 ("Prices") on the page "Services"');
    expect(user?.content).toContain("Mention financing");
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");
  it("the architect gets the plan block only when one is approved, and the worker reads only the approved version", () => {
    const worker = read("src/lib/site-engine.worker.server.ts");
    expect(worker).toContain("approvedPlan(readHistory(priorGeneration[\"pagePlan\"]))");
    expect(worker.match(/ownerPlan: ownerPlanBlock/g)?.length).toBe(2);
    expect(read("src/lib/builder/ai-page-architecture.server.ts")).toContain("input.ownerPlan");
  });
  it("server functions need a manager, refuse during a build, and never start a build or touch the site", () => {
    const fns = read("src/lib/builder/page-plan.functions.ts");
    expect(fns.match(/"manager"/g)?.length).toBeGreaterThanOrEqual(1);
    expect(fns).toContain("buildState");
    expect(fns).toContain("applyScopedRevision");
    for (const banned of ["generation_jobs", "website_sections", "website_pages", "runSiteGeneration"]) {
      expect(fns).not.toContain(banned);
    }
  });
  it("the panel is placed under the brief review in the website builder", () => {
    const route = read("src/routes/_authenticated/app.website.tsx");
    expect(route.indexOf("<PagePlanPanel")).toBeGreaterThan(route.indexOf("<BriefReviewPanel"));
  });
});
