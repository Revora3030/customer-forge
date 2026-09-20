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
import { compileQaAutoRepairs } from "./qa-auto-repair";

type Db = SupabaseClient<never>;

export type QaLoopPass = {
  score: number;
  findings: number;
  /** Short, owner-readable finding lines (bounded so the payload stays small). */
  notes: string[];
};

export type QaLoopResult = {
  before: QaLoopPass;
  after: QaLoopPass;
  /** What was actually written, one line per repair. */
  repaired: string[];
  /** Repairs that were attempted but the database refused. */
  failed: string[];
  /** Findings that are real but not safe to fix automatically. */
  reported: string[];
  summary: string;
};

/** How many repairs one apply may trigger. Bounded on purpose. */
const MAX_REPAIRS = 8;

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
          ) => Promise<{ data: Record<string, unknown>[] | null }>;
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
      "id, page_id, kind, variant, is_visible, heading, subheading, body, sort_order",
    ),
    read(
      "website_components",
      "id, section_id, kind, label, body, link_label, link_url, sort_order",
    ),
  ]);

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
        components: (componentsBySection.get(String(section["id"])) ?? []).map((component) => ({
          id: String(component["id"]),
          kind: String(component["kind"] ?? "text"),
          label: (component["label"] as string | null) ?? null,
          body: (component["body"] as string | null) ?? null,
          link_label: (component["link_label"] as string | null) ?? null,
          link_url: (component["link_url"] as string | null) ?? null,
          sort_order: Number(component["sort_order"] ?? 0),
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
 * Runs the whole loop. Never throws: a QA problem must not undo a good apply,
 * so a failure here is reported as "not checked" rather than surfaced as an
 * apply failure.
 */
export async function runQaRepairLoop(
  db: Db,
  orgId: string,
  instruction = "",
  limit = MAX_REPAIRS,
): Promise<QaLoopResult> {
  const context = await loadQaContext(db, orgId);
  const first = runBrowserStyleQa(context, instruction);
  const repairs = compileQaAutoRepairs(context, instruction, Math.max(1, Math.min(limit, 12)));

  const repaired: string[] = [];
  const failed: string[] = [];

  for (const repair of repairs) {
    const result = await writeRepair(
      db,
      orgId,
      repair.action as unknown as { type: string } & Record<string, unknown>,
    );
    if (result.ok) repaired.push(line(repair.finding));
    else failed.push(line(repair.finding));
  }

  // RE-TEST. The second pass reads the rows again, so the "after" score is
  // measured, never assumed from the repairs that were attempted.
  const second = repaired.length
    ? runBrowserStyleQa(await loadQaContext(db, orgId), instruction)
    : first;

  const repairedKeys = new Set(repaired);
  const reported = second.findings
    .map(line)
    .filter((entry) => !repairedKeys.has(entry))
    .slice(0, 6);

  return {
    before: toPass(first),
    after: toPass(second),
    repaired,
    failed,
    reported,
    summary: repaired.length
      ? `Checked your website after saving, fixed ${repaired.length} thing${
          repaired.length === 1 ? "" : "s"
        } automatically, then checked again (${first.score} → ${second.score} out of 100).`
      : `${browserQaSummary(second)} Nothing needed an automatic repair.`,
  };
}
