/**
 * REVORA ROADMAP INTELLIGENCE BUNDLE #161-#170
 *
 * Deterministic, renderer-safe intelligence for conversion, CRO,
 * browser/runtime QA signals, visual regression baselines, self-healing
 * policy, production safety, regression protection, analytics signals,
 * quality reporting, and builder UX signals.
 *
 * This module never executes writes, calls providers, changes the database,
 * or invents business facts. Execution remains owned by Site Agent.
 */
import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";

export type RoadmapArea =
  | "conversion"
  | "cro"
  | "browserQa"
  | "runtimeQa"
  | "visualRegression"
  | "selfHealing"
  | "productionSafety"
  | "regressionProtection"
  | "analytics"
  | "qualityDashboard";

export type RoadmapFinding = {
  area: RoadmapArea;
  priority: number;
  pageId: string | null;
  sectionId: string | null;
  message: string;
  repairable: boolean;
};

export type RoadmapAudit = {
  score: number;
  areas: Record<RoadmapArea, number>;
  findings: RoadmapFinding[];
  safeRepairs: number;
  runtimeRequired: RoadmapArea[];
  summary: string;
};

const AREAS: RoadmapArea[] = [
  "conversion",
  "cro",
  "browserQa",
  "runtimeQa",
  "visualRegression",
  "selfHealing",
  "productionSafety",
  "regressionProtection",
  "analytics",
  "qualityDashboard",
];

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
type Page = AgentContext["pages"][number];
type Section = Page["sections"][number];

const pages = (c: AgentContext) => c.pages.filter((p) => p.is_visible && !p.noindex);
const sections = (c: AgentContext) => pages(c).flatMap((p) => p.sections.filter((s) => s.is_visible));
const components = (c: AgentContext) => sections(c).flatMap((s) => s.components);
const text = (s: Section) => [s.heading, s.subheading, s.body].map((v) => v ?? "").join(" ");

const CTA = /\b(book|quote|estimate|contact|call|get started|schedule|appointment|buy|start|request|learn more)\b/i;
const FORM = /\b(form|contact|lead|signup|sign up|subscribe|booking|appointment)\b/i;
const CRO = /\b(cro|conversion|convert|conversions|funnel|experiment|a\/b|test|variant|optimi[sz]e|sales)\b/i;
const RUNTIME = /\b(runtime|console|browser|interaction|click|submit|javascript|js error|network error)\b/i;
const VISUAL = /\b(visual regression|pixel|screenshot|snapshot|visual diff|layout regression)\b/i;
const ANALYTICS = /\b(analytics|tracking|events|funnel|metrics|visitors|conversion rate|attribution)\b/i;

function hasCta(page: Page): boolean {
  return page.sections.some((s) => s.is_visible && s.components.some((c) =>
    CTA.test(`${c.label ?? ""} ${c.link_label ?? ""}`) || Boolean(c.link_url)
  ));
}

function hasFormSignal(page: Page): boolean {
  return page.sections.some((s) => s.is_visible && FORM.test(`${s.kind} ${text(s)}`));
}

function internalTargets(c: AgentContext): Set<string> {
  return new Set(pages(c).map((p) => p.slug ? `/${p.slug}` : "/"));
}

function add(
  findings: RoadmapFinding[],
  finding: RoadmapFinding,
  limit = 48,
): void {
  if (findings.length < limit) findings.push(finding);
}

export function auditRoadmap161to170(
  context: AgentContext,
  instruction: string,
): RoadmapAudit {
  const ps = pages(context);
  const ss = sections(context);
  const cs = components(context);
  const findings: RoadmapFinding[] = [];
  const lower = instruction.toLowerCase();

  // #161 Advanced conversion intelligence.
  for (const p of ps) {
    if (!hasCta(p) && (p.kind === "home" || hasFormSignal(p))) {
      add(findings, {
        area: "conversion", priority: 94, pageId: p.id, sectionId: null,
        message: "High-value page has a form/conversion signal but no detectable CTA destination.",
        repairable: true,
      });
    }
  }

  // #162 CRO + experimentation: identify measurable test surfaces without
  // inventing traffic or performance claims.
  if (CRO.test(lower)) {
    const surfaces = ss.filter((s) =>
      /^(hero|offer|pricing|cta|contact|services|benefits)$/i.test(s.kind) &&
      s.is_visible,
    );
    if (!surfaces.length) {
      add(findings, {
        area: "cro", priority: 76, pageId: ps[0]?.id ?? null, sectionId: null,
        message: "CRO intent detected but no native conversion test surface is available.",
        repairable: false,
      });
    } else {
      add(findings, {
        area: "cro", priority: 58, pageId: ps[0]?.id ?? null, sectionId: surfaces[0]?.id ?? null,
        message: `${surfaces.length} native conversion surface(s) can be used as controlled experiment candidates.`,
        repairable: false,
      });
    }
  }

  // #163 Browser interaction QA: deterministic preflight can validate links,
  // forms and controls; real clicking requires the runtime/browser boundary.
  if (RUNTIME.test(lower) || /browser|interaction|click|submit/i.test(lower)) {
    for (const p of ps) {
      for (const s of p.sections.filter((x) => x.is_visible)) {
        for (const c of s.components) {
          if (c.link_url?.startsWith("/") && !internalTargets(context).has(c.link_url)) {
            add(findings, {
              area: "browserQa", priority: 91, pageId: p.id, sectionId: s.id,
              message: `Internal link ${c.link_url} has no matching visible/indexable destination.`,
              repairable: false,
            });
          }
        }
      }
    }
  }

  // #164 Runtime / console QA cannot truthfully be completed from a static map.
  if (RUNTIME.test(lower)) {
    add(findings, {
      area: "runtimeQa", priority: 86, pageId: null, sectionId: null,
      message: "Runtime QA requires a live browser/runtime to inspect console, network, and interaction execution.",
      repairable: false,
    });
  }

  // #165 Visual regression baseline/diff is also runtime/screenshot dependent.
  if (VISUAL.test(lower)) {
    add(findings, {
      area: "visualRegression", priority: 84, pageId: null, sectionId: null,
      message: "Visual regression requires a rendered screenshot/baseline comparison; static source analysis cannot verify pixels.",
      repairable: false,
    });
  }

  // #166 Self-healing policy: only deterministic, reversible repairs are safe.
  const repairable = findings.filter((f) => f.repairable).length;
  add(findings, {
    area: "selfHealing", priority: 52, pageId: null, sectionId: null,
    message: repairable
      ? `${repairable} evidence-backed repair candidate(s) can pass through the existing validation and rollback boundary.`
      : "No evidence-backed self-healing repair is available from this static context.",
    repairable: false,
  });

  // #167 Production safety / permission intelligence.
  add(findings, {
    area: "productionSafety", priority: 44, pageId: null, sectionId: null,
    message: "Production mutations must remain behind existing authorization, validation, tenant isolation, billing, and publishing boundaries.",
    repairable: false,
  });

  // #168 Regression protection: flag broad changes and duplicate structural targets.
  const structural = cs.filter((c) => /button|form|image|video/i.test(c.kind));
  if (ss.length > 12 || cs.length > 48) {
    add(findings, {
      area: "regressionProtection", priority: 79, pageId: null, sectionId: null,
      message: "Site complexity warrants regression checks before broad autonomous edits.",
      repairable: false,
    });
  }
  const ids = new Set<string>();
  const duplicateIds = cs.filter((c) => ids.has(c.id) || !ids.add(c.id));
  if (duplicateIds.length) {
    add(findings, {
      area: "regressionProtection", priority: 88, pageId: null, sectionId: null,
      message: "Duplicate component identifiers detected; structural edits should be blocked until resolved.",
      repairable: false,
    });
  }

  // #169 Analytics intelligence: inspect whether the site has observable
  // conversion surfaces, without fabricating event counts.
  if (ANALYTICS.test(lower)) {
    const ctaPages = ps.filter(hasCta).length;
    add(findings, {
      area: "analytics", priority: 61, pageId: null, sectionId: null,
      message: `Analytics audit found ${ctaPages} page(s) with detectable conversion surfaces; event counts must come from telemetry, not static inference.`,
      repairable: false,
    });
  }

  // #170 Quality dashboard: provide a deterministic snapshot suitable for
  // an existing dashboard/UI without creating a new persistence layer.
  add(findings, {
    area: "qualityDashboard", priority: 40, pageId: null, sectionId: null,
    message: `Quality snapshot covers ${ps.length} visible page(s), ${ss.length} section(s), and ${cs.length} component(s).`,
    repairable: false,
  });

  const areas = {} as Record<RoadmapArea, number>;
  for (const area of AREAS) areas[area] = 100;

  areas.conversion = clamp(ps.length ? 100 - ps.filter((p) => !hasCta(p)).length * 12 : 55);
  areas.cro = CRO.test(lower) ? clamp(78 + Math.min(20, ss.length * 2)) : 82;
  areas.browserQa = clamp(100 - findings.filter((f) => f.area === "browserQa").length * 10);
  areas.runtimeQa = RUNTIME.test(lower) ? 55 : 70;
  areas.visualRegression = VISUAL.test(lower) ? 55 : 70;
  areas.selfHealing = clamp(82 + Math.min(18, repairable * 6));
  areas.productionSafety = 100;
  areas.regressionProtection = clamp(100 - (ss.length > 12 ? 12 : 0) - (cs.length > 48 ? 12 : 0) - duplicateIds.length * 20);
  areas.analytics = ANALYTICS.test(lower) ? 88 : 75;
  areas.qualityDashboard = 90;

  const runtimeRequired: RoadmapArea[] = ["runtimeQa", "visualRegression"];
  const score = clamp(AREAS.reduce((sum, area) => sum + areas[area], 0) / AREAS.length);

  return {
    score,
    areas,
    findings,
    safeRepairs: repairable,
    runtimeRequired,
    summary: `Roadmap #161-#170 audit: ${score}/100 across 10 areas; ${findings.length} finding(s), ${repairable} safe repair candidate(s); runtime verification required for #164/#165.`,
  };
}

export function roadmap161to170Summary(audit: RoadmapAudit): string {
  return audit.summary;
}

export function compileRoadmap161to170SafeRepairs(
  context: AgentContext,
  instruction: string,
  cap = 8,
): AgentAction[] {
  if (!CRO.test(instruction) && !/\b(conversion|lead|booking|quote|contact|sales)\b/i.test(instruction)) {
    return [];
  }

  const out: AgentAction[] = [];
  for (const page of pages(context)) {
    if (out.length >= cap || hasCta(page)) continue;
    if (!hasFormSignal(page) && page.kind !== "home") continue;

    const host = page.sections.find((s) => s.is_visible && /^(hero|cta|offer|contact)$/i.test(s.kind))
      ?? page.sections.find((s) => s.is_visible);
    if (!host) continue;

    const label = "Get Started";
    out.push({
      type: "add_component",
      sectionId: host.id,
      kind: "button",
      label,
      link_url: "/contact",
      link_label: label,
    });
  }
  return out;
}
