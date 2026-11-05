/**
 * CG-13 (G-SGE-2): the page plan the owner sees and edits BEFORE the first build.
 *
 * The plan is the page list the build will aim for: for each page its title,
 * what it is for, and the points it must cover. Everything here is pure and
 * browser-safe. Nothing is invented: the first version is made from the
 * business brief's own page priorities, and every later version is either an
 * owner edit or an AI revision of the single part the owner highlighted.
 *
 * Versions are append-only (newest last, capped), so the owner can see what
 * changed since the last version and go back to any earlier one.
 */

export const MAX_PLAN_PAGES = 12;
export const MAX_PAGE_POINTS = 8;
export const MAX_PLAN_VERSIONS = 20;
const TITLE_MAX = 60;
const PURPOSE_MAX = 240;
const POINT_MAX = 160;
const NOTE_MAX = 200;

export type PlanPage = {
  slug: string;
  title: string;
  purpose: string;
  /** What this page must cover, in order. */
  points: string[];
};

export type PagePlan = { pages: PlanPage[] };

export type PlanSource = "brief" | "owner" | "ai" | "restore";

export type PlanVersion = {
  version: number;
  createdAt: string;
  source: PlanSource;
  /** One plain line about what this version is. */
  note: string;
  plan: PagePlan;
};

export type PlanHistory = {
  versions: PlanVersion[];
  /** The version the owner approved to build from, or null. */
  approvedVersion: number | null;
};

/** The one part of the plan the owner highlighted for a change. */
export type PlanTarget = { slug: string; pointIndex?: number };

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

export function slugifyPage(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "page";
}

function uniqueSlug(wanted: string, taken: Set<string>): string {
  let slug = wanted;
  for (let n = 2; taken.has(slug); n += 1) slug = `${wanted.slice(0, 36)}-${n}`;
  return slug;
}

/** Cleans one page. Returns null when it has no usable title. */
export function cleanPage(value: unknown): PlanPage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const title = clean(raw["title"], TITLE_MAX);
  if (!title) return null;
  const slugRaw = clean(raw["slug"], 40);
  const points = (Array.isArray(raw["points"]) ? raw["points"] : [])
    .map((p) => clean(p, POINT_MAX))
    .filter(Boolean)
    .slice(0, MAX_PAGE_POINTS);
  return {
    slug: slugifyPage(slugRaw || title),
    title,
    purpose: clean(raw["purpose"], PURPOSE_MAX),
    points,
  };
}

/** Reads any stored or submitted plan into a safe one: no duplicates, home kept first. */
export function readPlan(value: unknown): PagePlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const list = (value as Record<string, unknown>)["pages"];
  if (!Array.isArray(list)) return null;
  const taken = new Set<string>();
  const pages: PlanPage[] = [];
  for (const item of list) {
    const page = cleanPage(item);
    if (!page || pages.length >= MAX_PLAN_PAGES) continue;
    const slug = uniqueSlug(page.slug, taken);
    taken.add(slug);
    pages.push({ ...page, slug });
  }
  if (!pages.length) return null;
  const home = pages.findIndex((p) => p.slug === "home");
  if (home > 0) pages.unshift(...pages.splice(home, 1));
  return { pages };
}

/** The first version: the brief's own page priorities, with nothing added. */
export function planFromBrief(pagePriorities: readonly string[], intentPaths: readonly string[] = []): PagePlan {
  const titles = pagePriorities.map((t) => clean(t, TITLE_MAX)).filter(Boolean);
  const hasHome = titles.some((t) => slugifyPage(t) === "home");
  const all = hasHome ? titles : ["Home", ...titles];
  const taken = new Set<string>();
  const pages: PlanPage[] = [];
  for (const title of all.slice(0, MAX_PLAN_PAGES)) {
    const slug = uniqueSlug(slugifyPage(title), taken);
    taken.add(slug);
    pages.push({ slug, title, purpose: "", points: [] });
  }
  const first = pages[0];
  const path = clean(intentPaths[0], PURPOSE_MAX);
  if (first && path) first.purpose = path;
  const home = pages.findIndex((p) => p.slug === "home");
  if (home > 0) pages.unshift(...pages.splice(home, 1));
  return { pages };
}

/* ------------------------------ owner edits ------------------------------ */

export function editPage(plan: PagePlan, slug: string, patch: Partial<Pick<PlanPage, "title" | "purpose" | "points">>): PagePlan {
  return {
    pages: plan.pages.map((page) => {
      if (page.slug !== slug) return page;
      const next = cleanPage({ ...page, ...patch, slug: page.slug });
      return next ? { ...next, slug: page.slug } : page;
    }),
  };
}

export function addPage(plan: PagePlan, title: string): PagePlan {
  const cleaned = clean(title, TITLE_MAX);
  if (!cleaned || plan.pages.length >= MAX_PLAN_PAGES) return plan;
  const slug = uniqueSlug(slugifyPage(cleaned), new Set(plan.pages.map((p) => p.slug)));
  return { pages: [...plan.pages, { slug, title: cleaned, purpose: "", points: [] }] };
}

/** The home page can't be removed: every site has one. */
export function removePage(plan: PagePlan, slug: string): PagePlan {
  if (slug === "home") return plan;
  return { pages: plan.pages.filter((p) => p.slug !== slug) };
}

export function movePage(plan: PagePlan, slug: string, direction: -1 | 1): PagePlan {
  const from = plan.pages.findIndex((p) => p.slug === slug);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= plan.pages.length) return plan;
  // Home stays first.
  if (plan.pages[from]?.slug === "home" || plan.pages[to]?.slug === "home") return plan;
  const pages = plan.pages.slice();
  const [item] = pages.splice(from, 1);
  if (item) pages.splice(to, 0, item);
  return { pages };
}

/* ------------------------- scoped AI revision guard ------------------------- */

/**
 * Applies an AI-proposed plan but keeps everything outside the highlighted part
 * exactly as it was. The model can only change the page (or the one point) the
 * owner pointed at; any other change it tries is dropped and counted.
 */
export function applyScopedRevision(
  current: PagePlan,
  target: PlanTarget,
  proposed: unknown,
): { plan: PagePlan; changed: boolean; ignoredOutsideEdits: number } {
  const proposedPlan = readPlan(proposed);
  const index = current.pages.findIndex((p) => p.slug === target.slug);
  if (!proposedPlan || index < 0) return { plan: current, changed: false, ignoredOutsideEdits: 0 };
  const before = current.pages[index]!;
  // A model that renames the slug is still answering about the same page when the page count is unchanged.
  const after =
    proposedPlan.pages.find((p) => p.slug === target.slug) ??
    (proposedPlan.pages.length === current.pages.length ? proposedPlan.pages[index] : undefined);
  if (!after) return { plan: current, changed: false, ignoredOutsideEdits: 0 };

  let nextPage: PlanPage = before;
  if (target.pointIndex === undefined) {
    nextPage = { ...after, slug: before.slug };
  } else if (target.pointIndex >= 0 && target.pointIndex < before.points.length) {
    const wanted = after.points[target.pointIndex];
    if (wanted) {
      const points = before.points.slice();
      points[target.pointIndex] = wanted;
      nextPage = { ...before, points };
    }
  }

  let ignored = 0;
  for (const other of proposedPlan.pages) {
    if (other === after) continue;
    const kept = current.pages.find((p) => p.slug === other.slug);
    if (!kept || !samePage(kept, other)) ignored += 1;
  }
  if (proposedPlan.pages.length !== current.pages.length) ignored += Math.abs(proposedPlan.pages.length - current.pages.length);
  if (target.pointIndex !== undefined) {
    // Anything the model changed on the page beyond the one point is also dropped.
    if (after.title !== before.title || after.purpose !== before.purpose) ignored += 1;
    after.points.forEach((p, i) => {
      if (i !== target.pointIndex && p !== before.points[i]) ignored += 1;
    });
  }

  const pages = current.pages.map((p, i) => (i === index ? nextPage : p));
  return { plan: { pages }, changed: !samePage(before, nextPage), ignoredOutsideEdits: ignored };
}

function samePage(a: PlanPage, b: PlanPage): boolean {
  return (
    a.slug === b.slug &&
    a.title === b.title &&
    a.purpose === b.purpose &&
    a.points.length === b.points.length &&
    a.points.every((p, i) => p === b.points[i])
  );
}

export function samePlan(a: PagePlan, b: PagePlan): boolean {
  return a.pages.length === b.pages.length && a.pages.every((p, i) => samePage(p, b.pages[i]!));
}

/* ------------------------------ what changed ------------------------------ */

export type PlanChange =
  | { kind: "added"; slug: string; title: string }
  | { kind: "removed"; slug: string; title: string }
  | { kind: "moved"; slug: string; title: string; from: number; to: number }
  | { kind: "renamed"; slug: string; from: string; to: string }
  | { kind: "purpose"; slug: string; title: string }
  | { kind: "points"; slug: string; title: string; added: string[]; removed: string[] };

/** Compares two plans so the owner can see what changed since the last version. */
export function diffPlans(before: PagePlan, after: PagePlan): PlanChange[] {
  const changes: PlanChange[] = [];
  const oldBySlug = new Map(before.pages.map((p, i) => [p.slug, { page: p, index: i }]));
  const newSlugs = new Set(after.pages.map((p) => p.slug));
  for (const [i, page] of after.pages.entries()) {
    const old = oldBySlug.get(page.slug);
    if (!old) {
      changes.push({ kind: "added", slug: page.slug, title: page.title });
      continue;
    }
    if (old.page.title !== page.title) changes.push({ kind: "renamed", slug: page.slug, from: old.page.title, to: page.title });
    if (old.page.purpose !== page.purpose) changes.push({ kind: "purpose", slug: page.slug, title: page.title });
    const added = page.points.filter((p) => !old.page.points.includes(p));
    const removed = old.page.points.filter((p) => !page.points.includes(p));
    if (added.length || removed.length) changes.push({ kind: "points", slug: page.slug, title: page.title, added, removed });
    if (old.index !== i) changes.push({ kind: "moved", slug: page.slug, title: page.title, from: old.index + 1, to: i + 1 });
  }
  for (const page of before.pages) {
    if (!newSlugs.has(page.slug)) changes.push({ kind: "removed", slug: page.slug, title: page.title });
  }
  return changes;
}

export function describeChange(change: PlanChange): string {
  switch (change.kind) {
    case "added":
      return `Added page “${change.title}”`;
    case "removed":
      return `Removed page “${change.title}”`;
    case "moved":
      return `Moved “${change.title}” from position ${change.from} to ${change.to}`;
    case "renamed":
      return `Renamed “${change.from}” to “${change.to}”`;
    case "purpose":
      return `Changed what “${change.title}” is for`;
    case "points": {
      const parts: string[] = [];
      if (change.added.length) parts.push(`added ${change.added.length}`);
      if (change.removed.length) parts.push(`removed ${change.removed.length}`);
      return `“${change.title}”: ${parts.join(" and ")} point${change.added.length + change.removed.length === 1 ? "" : "s"}`;
    }
  }
}

/* -------------------------------- versions -------------------------------- */

export function readHistory(value: unknown): PlanHistory {
  const empty: PlanHistory = { versions: [], approvedVersion: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  const raw = value as Record<string, unknown>;
  const versions: PlanVersion[] = [];
  for (const item of Array.isArray(raw["versions"]) ? raw["versions"] : []) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const plan = readPlan(v["plan"]);
    const n = typeof v["version"] === "number" && Number.isInteger(v["version"]) && v["version"] > 0 ? v["version"] : 0;
    const source = v["source"];
    if (!plan || !n) continue;
    versions.push({
      version: n,
      createdAt: typeof v["createdAt"] === "string" ? v["createdAt"] : "",
      source: source === "brief" || source === "owner" || source === "ai" || source === "restore" ? source : "owner",
      note: clean(v["note"], NOTE_MAX),
      plan,
    });
  }
  versions.sort((a, b) => a.version - b.version);
  const approved = raw["approvedVersion"];
  const approvedVersion =
    typeof approved === "number" && versions.some((v) => v.version === approved) ? approved : null;
  return { versions: versions.slice(-MAX_PLAN_VERSIONS), approvedVersion };
}

export function latestVersion(history: PlanHistory): PlanVersion | null {
  return history.versions[history.versions.length - 1] ?? null;
}

/**
 * Keeps a new version. An identical plan adds nothing. The approved version is
 * never dropped by the cap, so the plan a build used can always be shown.
 */
export function pushVersion(
  history: PlanHistory,
  plan: PagePlan,
  source: PlanSource,
  note: string,
  nowIso: string,
): PlanHistory {
  const last = latestVersion(history);
  if (last && samePlan(last.plan, plan)) return history;
  const next: PlanVersion = {
    version: (last?.version ?? 0) + 1,
    createdAt: nowIso,
    source,
    note: clean(note, NOTE_MAX),
    plan,
  };
  let versions = [...history.versions, next];
  while (versions.length > MAX_PLAN_VERSIONS) {
    const drop = versions.findIndex((v) => v.version !== history.approvedVersion);
    versions = versions.filter((_, i) => i !== drop);
  }
  return { versions, approvedVersion: history.approvedVersion };
}

/** Approving always approves the newest version; editing afterwards needs approval again. */
export function approveLatest(history: PlanHistory): PlanHistory {
  const last = latestVersion(history);
  return last ? { ...history, approvedVersion: last.version } : history;
}

export function isApproved(history: PlanHistory): boolean {
  const last = latestVersion(history);
  return !!last && history.approvedVersion === last.version;
}

/** The approved plan the build should follow, or null. */
export function approvedPlan(history: PlanHistory): PagePlan | null {
  return history.versions.find((v) => v.version === history.approvedVersion)?.plan ?? null;
}

/** Restoring an old version makes a NEW version, so nothing is ever lost. */
export function restoreVersion(history: PlanHistory, version: number, nowIso: string): PlanHistory {
  const old = history.versions.find((v) => v.version === version);
  if (!old) return history;
  return pushVersion(history, old.plan, "restore", `Went back to version ${version}`, nowIso);
}

/* ------------------------------ AI prompts ------------------------------ */

/** The block handed to the page architect so the build follows the approved plan. */
export function architectPlanBlock(plan: PagePlan): string {
  const lines = plan.pages.map((p, i) => {
    const head = `${i + 1}. ${p.title} (slug "${p.slug}")${p.purpose ? ` — ${p.purpose}` : ""}`;
    return p.points.length ? `${head}\n   Must cover: ${p.points.join("; ")}` : head;
  });
  return [
    "OWNER-APPROVED PAGE PLAN (the owner reviewed and approved this before the build):",
    ...lines,
    "Plan these pages in this order. Keep the owner's page titles and the points they asked for. You may add sections the pages need, but only from supplied facts: if a point could only be met by inventing a fact, leave it out and say so in that page's purpose.",
  ].join("\n");
}

export const PLAN_REVISION_SYSTEM =
  'You revise ONE highlighted part of a website page plan. Change only what the owner asked for in that part. Never touch other pages. Never invent business facts, prices, reviews, awards or guarantees. Return JSON: {"pages":[{"slug","title","purpose","points":[]}]} with the SAME pages, in the same order.';

export function planRevisionMessages(plan: PagePlan, target: PlanTarget, request: string, facts: string) {
  const page = plan.pages.find((p) => p.slug === target.slug);
  const part =
    target.pointIndex === undefined
      ? `the whole page "${page?.title ?? target.slug}"`
      : `only point ${target.pointIndex + 1} ("${page?.points[target.pointIndex] ?? ""}") on the page "${page?.title ?? target.slug}"`;
  return [
    { role: "system" as const, content: PLAN_REVISION_SYSTEM },
    {
      role: "user" as const,
      content: `BUSINESS FACTS:\n${facts.slice(0, 2000)}\n\nCURRENT PLAN:\n${JSON.stringify(plan)}\n\nHIGHLIGHTED PART: ${part}\n\nOWNER'S REQUEST:\n${request.slice(0, 500)}`,
    },
  ];
}
