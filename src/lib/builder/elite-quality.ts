import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";

export type EliteQualityFinding = {
  area:
    | "intent"
    | "conversion"
    | "seo"
    | "content"
    | "navigation"
    | "visual"
    | "responsive"
    | "accessibility"
    | "performance"
    | "safety"
    | "autonomy";
  severity: "critical" | "warning" | "info";
  message: string;
};

export type EliteQualityReport = {
  score: number;
  areas: Record<EliteQualityFinding["area"], number>;
  findings: EliteQualityFinding[];
  strengths: string[];
  blockers: string[];
  summary: string;
};

const AREAS: EliteQualityFinding["area"][] = [
  "intent",
  "conversion",
  "seo",
  "content",
  "navigation",
  "visual",
  "responsive",
  "accessibility",
  "performance",
  "safety",
  "autonomy",
];

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function text(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function actionCount(actions: AgentAction[], type: AgentAction["type"]): number {
  return actions.filter((action) => action.type === type).length;
}

export function auditEliteBuilderQuality(
  context: AgentContext,
  actions: AgentAction[],
  instruction: string,
): EliteQualityReport {
  const pages = context.pages.filter((page) => page.is_visible);
  const sections = pages.flatMap((page) => page.sections.filter((section) => section.is_visible));
  const components = sections.flatMap((section) => section.components);
  const requested = text(instruction).length > 0;

  const pagesWithSeo = pages.filter(
    (page) => text(page.seo_title || page.title) && text(page.seo_description),
  ).length;
  const pagesWithCta = pages.filter((page) =>
    page.sections.some((section) =>
      section.components.some(
        (component) =>
          component.kind === "button" ||
          Boolean(component.link_url && component.link_url.startsWith("/")),
      ),
    ),
  ).length;
  const linkedDestinations = new Set(
    components
      .map((component) => component.link_url)
      .filter((url): url is string => Boolean(url && url.startsWith("/"))),
  );
  const knownSlugs = new Set(pages.map((page) => page.slug.replace(/^\/+/, "")));

  const nonEmptySections = sections.filter(
    (section) => text(section.heading) || text(section.subheading) || text(section.body),
  ).length;
  const meaningfulCopyRatio = sections.length
    ? (nonEmptySections / sections.length) * 100
    : 100;

  const actionDiversity = new Set(actions.map((action) => action.type)).size;
  const safeActionRatio = actions.length
    ? (actions.filter((action) =>
        ["set_section_text","set_section_visibility","set_section_variant","set_section_visual",
         "add_section","delete_section","reorder_sections","set_component","set_component_visual",
         "add_component","delete_component","add_page","set_page","delete_page","set_theme",
         "set_backdrop","set_section_effect","set_business_fact"].includes(action.type),
      ).length /
        actions.length) *
      100
    : 100;

  const areas: EliteQualityReport["areas"] = {
    intent: requested ? clamp(82 + Math.min(18, actions.length * 2)) : 100,
    conversion: pages.length ? clamp((pagesWithCta / pages.length) * 100) : 100,
    seo: pages.length ? clamp((pagesWithSeo / pages.length) * 100) : 100,
    content: clamp(meaningfulCopyRatio),
    navigation: pages.length
      ? clamp(72 + Math.min(18, linkedDestinations.size * 3) - Math.min(20, [...linkedDestinations].filter((url) => {
          const slug = url.replace(/^\/+/, "");
          return slug && slug !== "" && !knownSlugs.has(slug);
        }).length * 8))
      : 100,
    // Planning actions are not rendered evidence. These remain unverified until
    // the browser QA lane supplies measurements.
    visual: 0,
    responsive: 0,
    accessibility: clamp(
      78 +
        Math.min(12, components.filter((component) => text(component.label) || text(component.link_label)).length),
    ),
    performance: 0,
    safety: clamp(safeActionRatio),
    autonomy: actions.length ? clamp(Math.min(70, actionDiversity * 8)) : 0,
  };

  const weights: Record<EliteQualityFinding["area"], number> = {
    intent: 1.1,
    conversion: 1.2,
    seo: 1.0,
    content: 1.0,
    navigation: 0.9,
    visual: 1.0,
    responsive: 0.9,
    accessibility: 1.0,
    performance: 0.9,
    safety: 1.3,
    autonomy: 1.1,
  };

  const totalWeight = AREAS.reduce((sum, area) => sum + weights[area], 0);
  const score = clamp(
    AREAS.reduce((sum, area) => sum + areas[area] * weights[area], 0) / totalWeight,
  );

  const findings: EliteQualityFinding[] = [];
  const strengths: string[] = [];
  const blockers: string[] = [];

  const add = (
    area: EliteQualityFinding["area"],
    severity: EliteQualityFinding["severity"],
    message: string,
  ) => findings.push({ area, severity, message });

  for (const area of AREAS) {
    if (areas[area] >= 92) strengths.push(area);
    else if (areas[area] < 75) add(area, "warning", `${area} is below the elite target threshold.`);
  }

  if (pages.length > 0 && pagesWithCta < pages.length) {
    add("conversion", "warning", "Some visible pages do not expose a clear internal conversion path.");
  }
  if (pages.length > 0 && pagesWithSeo < pages.length) {
    add("seo", "warning", "Some visible pages are missing complete search metadata.");
  }
  if (sections.length > 0 && nonEmptySections < sections.length) {
    add("content", "warning", "Some visible sections have little or no substantive copy.");
  }
  if (components.some((component) => component.link_url?.startsWith("/") && component.link_url !== "/" && !knownSlugs.has(component.link_url.replace(/^\/+/, "")))) {
    add("navigation", "warning", "At least one internal link points to a slug not present in the current site map.");
  }
  if (actionCount(actions, "delete_page") + actionCount(actions, "delete_section") > 6) {
    add("safety", "critical", "The plan contains many destructive actions and should remain behind the existing execution validation boundary.");
    blockers.push("Destructive-action review");
  }
  if (actionCount(actions, "set_section_effect") > 8) {
    add("performance", "warning", "The plan applies many visual effects; rendered verification should confirm animation density and performance.");
  }

  const summary =
    `Elite builder quality: ${score}/100 across ${pages.length} visible page${pages.length === 1 ? "" : "s"}, ${actions.length} planned action${actions.length === 1 ? "" : "s"}, and ${findings.length} finding${findings.length === 1 ? "" : "s"}.`;

  return {
    score,
    areas,
    findings: findings.slice(0, 24),
    strengths: strengths.slice(0, 8),
    blockers: blockers.slice(0, 8),
    summary,
  };
}
