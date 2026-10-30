/**
 * REVORA POST-APPLY QA LOOP — check the work, repair what is safe, check again.
 *
 * This is the step that turns "the database said it saved" into "a visitor
 * would find this website correct". It runs AFTER a successful apply and after
 * the live-page verification, on the workspace's real rows:
 *
 *   1. QA pass  — deterministic browser-style checks over the saved site.
 *   2. Repair   — only the repairs `compileQaAutoRepairs` proves safe from the
 *                 site's own data (a missing SEO title taken from the page's
 *                 own title, a broken internal link pointed back at the home
 *                 page). Anything ambiguous stays a finding and is reported,
 *                 never guessed at.
 *   3. QA again — the same checks re-run on the re-read rows, so the report
 *                 tells the owner whether the repair actually landed.
 *
 * Every write is scoped to the caller's own organisation and runs through the
 * caller's client, so RLS is the tenant gate here exactly as it is everywhere
 * else. Nothing in this module can create, delete or hide content: the only
 * columns it may touch are the two the safe-repair compiler emits.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentContext, SiteMapPage } from "@/lib/site-agent.server";
import {
  browserQaSummary,
  runBrowserStyleQa,
  type BrowserQaFinding,
  type BrowserQaReport,
} from "./browser-qa-intelligence";
import { safeLinkUrl } from "@/lib/website-content";
import { compileQaAutoRepairs } from "./qa-auto-repair";
import {
  runDesignConsistencyAudit,
  designConsistencySummary,
  type SectionDesignData,
  type DesignTokenSnapshot,
  type DesignConsistencyReport,
} from "./design-consistency";
import { runVisualPolish, prioritiseImprovements } from "./visual-polish";

type Db = SupabaseClient<never>;

export type QaLoopPass = {
  score: number;
  findings: number;
  /** Short, owner-readable finding lines (bounded so the payload stays small). */
  notes: string[];
};

export type QaLoopResult = {
  /**
   * False when the checks could not run (a read failed). The owner is told
   * "not checked" instead of being shown a clean score for a site we never saw.
   */
  checked: boolean;
  /** How many repair → re-test rounds actually ran (0–MAX_ROUNDS). */
  rounds: number;
  before: QaLoopPass;
  after: QaLoopPass;
  /**
   * Repairs that were written AND whose finding is gone on the re-read rows.
   * A write the database accepted is not proof; only the re-test is.
   */
  repaired: string[];
  /** Repairs the database accepted but the re-test still finds. */
  unresolved: string[];
  /** Repairs that were attempted but the database refused. */
  failed: string[];
  /** Findings that are real but not safe to fix automatically. */
  reported: string[];
  /** Design consistency report from the post-build visual audit. */
  designConsistency: DesignConsistencyReport | null;
  /** Priority improvements for the AI team to act on next. */
  priorityImprovements: { priority: "critical" | "high" | "medium"; action: string }[];
  summary: string;
};

/** How many repairs one apply may trigger. Bounded on purpose. */
const MAX_REPAIRS = 8;

/**
 * Repair → re-test rounds. A second round only runs when the first one
 * verifiably fixed something and the re-read site has new safe repairs (for
 * example a page whose description could only be derived once its title was
 * set). Deterministic and free — no AI call happens in this loop.
 */
export const MAX_ROUNDS = 2;

const line = (finding: BrowserQaFinding) => `${finding.kind}: ${finding.message}`;

function toPass(report: BrowserQaReport): QaLoopPass {
  return {
    score: report.score,
    findings: report.findings.length,
    notes: report.findings.slice(0, 6).map(line),
  };
}

/**
 * Reads the pages, sections and components exactly as the QA checks need them.
 * The checks only look at the page tree, so this loader deliberately does not
 * re-read the business profile: less data, no extra queries, same verdict.
 */
export async function loadQaContext(db: Db, orgId: string): Promise<AgentContext> {
  const client = db as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: unknown,
        ) => {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => Promise<{ data: Record<string, unknown>[] | null; error?: unknown }>;
        };
      };
    };
  };

  const read = (table: string, columns: string) =>
    client.from(table).select(columns).eq("organization_id", orgId).order("sort_order", {
      ascending: true,
    });

  const [pageRows, sectionRows, componentRows] = await Promise.all([
    read(
      "website_pages",
      "id, slug, title, kind, is_visible, noindex, seo_title, seo_description, sort_order",
    ),
    read(
      "website_sections",
      "id, page_id, kind, variant, is_visible, heading, subheading, body, settings, sort_order",
    ),
    read(
      "website_components",
      "id, section_id, kind, label, body, link_label, link_url, media_url, settings, sort_order",
    ),
  ]);

  // A failed read must never look like an empty (and therefore "clean") site.
  for (const [table, rows] of [
    ["website_pages", pageRows],
    ["website_sections", sectionRows],
    ["website_components", componentRows],
  ] as const) {
    if (rows?.error) {
      const detail = (rows.error as { message?: string }).message ?? "unknown error";
      throw new Error(`could not read ${table}: ${detail}`);
    }
  }

  const componentsBySection = new Map<string, Record<string, unknown>[]>();
  for (const component of componentRows.data ?? []) {
    const key = String(component["section_id"] ?? "");
    const list = componentsBySection.get(key) ?? [];
    list.push(component);
    componentsBySection.set(key, list);
  }

  const pages: SiteMapPage[] = (pageRows.data ?? []).map((page) => ({
    id: String(page["id"]),
    slug: String(page["slug"] ?? ""),
    title: String(page["title"] ?? ""),
    kind: String(page["kind"] ?? "custom"),
    is_visible: Boolean(page["is_visible"]),
    noindex: Boolean(page["noindex"]),
    seo_title: (page["seo_title"] as string | null) ?? null,
    seo_description: (page["seo_description"] as string | null) ?? null,
    sections: (sectionRows.data ?? [])
      .filter((section) => String(section["page_id"] ?? "") === String(page["id"]))
      .map((section) => ({
        id: String(section["id"]),
        kind: String(section["kind"] ?? "text"),
        variant: String(section["variant"] ?? "default"),
        is_visible: Boolean(section["is_visible"]),
        heading: (section["heading"] as string | null) ?? null,
        subheading: (section["subheading"] as string | null) ?? null,
        body: (section["body"] as string | null) ?? null,
        sort_order: Number(section["sort_order"] ?? 0),
        settings: section["settings"] ?? null,
        components: (componentsBySection.get(String(section["id"])) ?? []).map((component) => ({
          id: String(component["id"]),
          kind: String(component["kind"] ?? "text"),
          label: (component["label"] as string | null) ?? null,
          body: (component["body"] as string | null) ?? null,
          link_label: (component["link_label"] as string | null) ?? null,
          link_url: (component["link_url"] as string | null) ?? null,
          sort_order: Number(component["sort_order"] ?? 0),
          media_url: (component["media_url"] as string | null) ?? null,
          settings: component["settings"] ?? null,
        })),
      })),
  })) as SiteMapPage[];

  return {
    business: {
      name: "",
      industry: null,
      tagline: null,
      description: null,
      city: null,
      state: null,
      serviceArea: null,
      phone: null,
      email: null,
      yearsInBusiness: null,
      primaryColor: null,
      secondaryColor: null,
      accentColor: null,
      fontPreference: null,
      services: [],
      publishedReviewCount: 0,
      photoCount: 0,
    },
    pages,
    sectionKinds: [],
    pageKinds: [],
    componentKinds: [],
  } as AgentContext;
}

type WriteResult = { ok: boolean };

/**
 * Applies ONE safe repair. The allowed shapes are exactly what the safe-repair
 * compiler emits, and every write carries the organisation filter as well as
 * the row id, so a repair can never reach another workspace's row.
 */
async function writeRepair(
  db: Db,
  orgId: string,
  action: { type: string } & Record<string, unknown>,
): Promise<WriteResult> {
  const client = db as unknown as {
    from: (table: string) => {
      update: (values: Record<string, unknown>) => {
        eq: (
          column: string,
          value: unknown,
        ) => {
          eq: (column: string, value: unknown) => Promise<{ error: unknown }>;
        };
      };
    };
  };

  if (action.type === "set_page") {
    const patch = (action["patch"] ?? {}) as Record<string, unknown>;
    const values: Record<string, unknown> = {};
    if (typeof patch["seo_title"] === "string") values["seo_title"] = patch["seo_title"];
    if (typeof patch["seo_description"] === "string")
      values["seo_description"] = patch["seo_description"];
    if (!Object.keys(values).length) return { ok: false };
    const { error } = await client
      .from("website_pages")
      .update(values)
      .eq("id", String(action["pageId"] ?? ""))
      .eq("organization_id", orgId);
    return { ok: !error };
  }

  if (action.type === "set_component") {
    const patch = (action["patch"] ?? {}) as Record<string, unknown>;
    if (typeof patch["link_url"] !== "string") return { ok: false };
    // A repair must never widen what a visitor's browser can be asked to run.
    const safeLink = safeLinkUrl(patch["link_url"]);
    if (!safeLink) return { ok: false };
    const { error } = await client
      .from("website_components")
      .update({ link_url: safeLink })
      .eq("id", String(action["componentId"] ?? ""))
      .eq("organization_id", orgId);
    return { ok: !error };
  }

  return { ok: false };
}

/**
 * Extracts design-relevant data from the site context for the design
 * consistency audit. Reads section settings (colours, fonts, spacing) and
 * component data to build the SectionDesignData the checker expects.
 */
function extractDesignData(context: AgentContext): {
  sections: SectionDesignData[];
  tokens: DesignTokenSnapshot;
} {
  const sections: SectionDesignData[] = [];
  const tokens: DesignTokenSnapshot = {
    primaryColor: context.business.primaryColor ?? null,
    secondaryColor: context.business.secondaryColor ?? null,
    accentColor: context.business.accentColor ?? null,
    headingFont: context.business.fontPreference ?? null,
    bodyFont: context.business.fontPreference ?? null,
  };

  for (const page of context.pages) {
    for (const section of page.sections) {
      const settings = (section.settings ?? {}) as Record<string, unknown>;
      const blockStyle = (settings["blockStyle"] ?? settings["style"] ?? {}) as Record<string, unknown>;
      const desktopStyle = (blockStyle["desktop"] ?? blockStyle) as Record<string, unknown>;
      const components = section.components ?? [];
      const hasCta = components.some(
        (c) =>
          c.kind === "button" ||
          c.kind === "link" ||
          (c.link_label && c.link_url),
      );
      const textLength =
        (section.heading?.length ?? 0) +
        (section.subheading?.length ?? 0) +
        (section.body?.length ?? 0);

      sections.push({
        pageSlug: page.slug,
        sectionId: section.id,
        sectionKind: section.kind,
        heading: section.heading ?? null,
        headingLevel: null,
        textColor: typeof desktopStyle["textColor"] === "string" ? (desktopStyle["textColor"] as string) : null,
        bgColor: typeof desktopStyle["bgColor"] === "string" ? (desktopStyle["bgColor"] as string) : null,
        fontFamily: typeof desktopStyle["font"] === "string" ? (desktopStyle["font"] as string) : null,
        fontSize: typeof desktopStyle["size"] === "number" ? (desktopStyle["size"] as number) : null,
        fontWeight: typeof desktopStyle["weight"] === "number" ? (desktopStyle["weight"] as number) : null,
        padding: {
          top: typeof desktopStyle["padTop"] === "number" ? (desktopStyle["padTop"] as number) : 0,
          right: typeof desktopStyle["padRight"] === "number" ? (desktopStyle["padRight"] as number) : 0,
          bottom: typeof desktopStyle["padBottom"] === "number" ? (desktopStyle["padBottom"] as number) : 0,
          left: typeof desktopStyle["padLeft"] === "number" ? (desktopStyle["padLeft"] as number) : 0,
        },
        gap: typeof desktopStyle["gap"] === "number" ? (desktopStyle["gap"] as number) : null,
        hasCta,
        ctaLabel: components.find((c) => c.kind === "button")?.link_label ?? null,
        componentCount: components.length,
        textLength,
        isVisible: section.is_visible,
      });
    }
  }

  return { sections, tokens };
}

/** The result when the checks themselves could not run. */
function notChecked(error: unknown): QaLoopResult {
  const empty: QaLoopPass = { score: 0, findings: 0, notes: [] };
  const detail = error instanceof Error ? error.message : String(error);
  console.warn("[qa-loop] website check could not run", detail);
  return {
    checked: false,
    rounds: 0,
    before: empty,
    after: empty,
    repaired: [],
    unresolved: [],
    failed: [],
    reported: [],
    designConsistency: null,
    priorityImprovements: [],
    summary:
      "Your changes are saved, but the automatic website check couldn't read the site just now, so nothing was checked or repaired. Run the check again from the builder in a minute.",
  };
}

/**
 * Runs the whole loop. Never throws: a QA problem must not undo a good apply,
 * so a failure here is reported as "not checked" rather than surfaced as an
 * apply failure.
 *
 * Observe → repair → verify: each round compiles only the provably safe
 * repairs, writes them, re-reads the rows and re-runs the same checks. A
 * repair counts as fixed only when its finding is gone from the re-test.
 */
export async function runQaRepairLoop(
  db: Db,
  orgId: string,
  instruction = "",
  limit = MAX_REPAIRS,
): Promise<QaLoopResult> {
  try {
    return await runLoop(db, orgId, instruction, limit);
  } catch (error) {
    return notChecked(error);
  }
}

async function runLoop(
  db: Db,
  orgId: string,
  instruction: string,
  limit: number,
): Promise<QaLoopResult> {
  let context = await loadQaContext(db, orgId);
  const first = runBrowserStyleQa(context, instruction);
  let latest = first;
  let budget = Math.max(1, Math.min(limit, 12));

  const repaired: string[] = [];
  const unresolved: string[] = [];
  const failed: string[] = [];
  let rounds = 0;

  for (let round = 0; round < MAX_ROUNDS && budget > 0; round += 1) {
    const repairs = compileQaAutoRepairs(context, instruction, budget);
    if (!repairs.length) break;
    rounds += 1;
    budget -= repairs.length;
    const written: string[] = [];
    for (const repair of repairs) {
      const result = await writeRepair(
        db,
        orgId,
        repair.action as unknown as { type: string } & Record<string, unknown>,
      );
      if (result.ok) written.push(line(repair.finding));
      else failed.push(line(repair.finding));
    }
    if (!written.length) break;
    // RE-TEST. Re-read the rows so the verdict is measured, never assumed
    // from the repairs that were attempted.
    context = await loadQaContext(db, orgId);
    latest = runBrowserStyleQa(context, instruction);
    const stillThere = new Set(latest.findings.map(line));
    let fixedThisRound = 0;
    for (const entry of written) {
      if (stillThere.has(entry)) unresolved.push(entry);
      else {
        repaired.push(entry);
        fixedThisRound += 1;
      }
    }
    // Nothing verifiably landed: another round would only repeat the same writes.
    if (!fixedThisRound) break;
  }

  const second = latest;
  const unresolvedKeys = new Set(unresolved);
  // Findings still present after the re-test are always reported — including
  // ones a repair was written for but did not clear.
  const reported = [
    ...unresolved.map((entry) => `${entry} (automatic repair did not resolve this)`),
    ...second.findings.map(line).filter((entry) => !unresolvedKeys.has(entry)),
  ].slice(0, 6);

  // DESIGN CONSISTENCY AUDIT. Runs after the browser QA, on the same
  // re-read context. Checks colour palette, typography hierarchy, font
  // consistency, spacing, CTA prominence, and visual balance across every
  // page — not just the homepage.
  const designContext = context;
  const { sections: designSections, tokens } = extractDesignData(designContext);
  const designReport = runDesignConsistencyAudit(designSections, tokens);
  const hasContactPage = designContext.pages.some(
    (p) => p.slug === "contact" || p.kind === "contact",
  );
  const polish = runVisualPolish(designReport, hasContactPage);
  const priorityImprovements = prioritiseImprovements(designReport, polish);

  // Merge design consistency findings into the reported list
  const designFindings = designReport.findings
    .map((f) => `${f.kind}: ${f.message}`)
    .slice(0, 6);
  const allReported = [...reported, ...designFindings].slice(0, 12);

  const plural = (n: number) => (n === 1 ? "" : "s");
  const leftover = unresolved.length
    ? ` ${unresolved.length} automatic repair${plural(unresolved.length)} did not clear the problem, so ${unresolved.length === 1 ? "it is" : "they are"} listed below for review.`
    : "";
  const refused = failed.length
    ? ` ${failed.length} repair${plural(failed.length)} could not be saved.`
    : "";
  const qaSummary = repaired.length
    ? `Checked your website after saving, fixed ${repaired.length} thing${plural(repaired.length)} automatically, then checked again (${first.score} → ${second.score} out of 100).${leftover}${refused}`
    : rounds
      ? `${browserQaSummary(second)} Automatic repairs were tried but the re-check still found the same problems.${leftover}${refused}`
      : `${browserQaSummary(second)} Nothing needed an automatic repair.`;
  const designSummary = designConsistencySummary(designReport);

  return {
    checked: true,
    rounds,
    before: toPass(first),
    after: toPass(second),
    repaired,
    unresolved,
    failed,
    reported: allReported,
    designConsistency: designReport,
    priorityImprovements,
    summary: `${qaSummary} ${designSummary}`,
  };
}
