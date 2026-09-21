import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";
import { recommendDirections } from "@/lib/design-directions";
import { compileDesignSystemActions } from "./site-design-system";
import { compileImageQualityActions } from "./site-image-intelligence";
import { compileConversionArchitecture } from "./site-conversion-architecture";
import { compileResponsiveAutopilot } from "./site-responsive-autopilot";
import { compileAccessibilityAutopilot } from "./site-accessibility-autopilot";
import { compileSeoAutopilot } from "./site-seo-autopilot";

export const ULTIMATE_QUALITY_DOMAINS = [
  "brand","composition","imagery","motion","conversion","responsive","accessibility","seo",
  "performance","content","navigation","consistency","mobile","trust","proof","forms","cta",
  "visualHierarchy","designSystem","rendererExecution",
] as const;

export type UltimateQualityDomain = typeof ULTIMATE_QUALITY_DOMAINS[number];
export type UltimateQualityResult = {
  actions: AgentAction[];
  score: number;
  domains: Record<UltimateQualityDomain, number>;
  directionId: string | null;
  trace: string[];
};

function clamp(value: number): number { return Math.max(0, Math.min(100, Math.round(value))); }

export function compileUltimateSiteQuality(context: AgentContext, instruction: string, cap = 60): UltimateQualityResult {
  const direction = recommendDirections({
    businessName: context.business.name,
    industry: context.business.industry,
    services: context.business.services.map((s) => ({ name: s.name })),
    city: context.business.city,
    count: 1,
  })[0];

  const emptyDomains = Object.fromEntries(ULTIMATE_QUALITY_DOMAINS.map((d) => [d, 0])) as Record<UltimateQualityDomain, number>;
  if (!direction) return { actions: [], score: 0, domains: emptyDomains, directionId: null, trace: ["No deterministic design direction available."] };

  const pages = context.pages.filter((p) => p.is_visible);
  const sections = pages.flatMap((p) => p.sections.filter((s) => s.is_visible));
  const actions: AgentAction[] = [];
  const push = (action: AgentAction) => { if (actions.length < cap) actions.push(action); };

  for (const action of compileDesignSystemActions(sections, direction, Math.min(18, cap))) push(action);
  for (const action of compileImageQualityActions(sections, context.business.name, Math.min(14, cap - actions.length))) push(action);

  const target = (context.business.phone ? "tel:" + context.business.phone : null) ?? (context.business.email ? "mailto:" + context.business.email : null) ?? "/contact";
  for (const action of compileConversionArchitecture(pages, target, "Get Started", Math.min(10, cap - actions.length))) push(action);
  for (const action of compileResponsiveAutopilot(sections, Math.min(8, cap - actions.length))) push(action);
  for (const action of compileAccessibilityAutopilot(sections, context.business.name, Math.min(6, cap - actions.length))) push(action);
  for (const action of compileSeoAutopilot(pages, context.business.name, (context.business.industry ?? "business"), context.business.city, Math.min(6, cap - actions.length))) push(action);

  const media = sections.flatMap((s) => s.components).filter((c) => ["image","gallery","media","photo","hero_image"].includes(c.kind)).length;
  const ctaPages = pages.filter((p) => p.sections.some((s) => s.kind === "cta" || s.components.some((c) => c.kind === "button"))).length;
  const coverage = (value: number, total: number) => total ? clamp((value / total) * 100) : 0;
  const designed = sections.filter((section) => section.variant && section.variant !== "default").length;
  const populated = sections.filter((section) => section.heading || section.subheading || section.body).length;
  const scores: Record<UltimateQualityDomain, number> = {
    brand: context.business.name ? 70 : 0,
    composition: coverage(designed, sections.length),
    imagery: coverage(media, Math.max(3, pages.length)),
    motion: 0,
    conversion: coverage(ctaPages, pages.length),
    responsive: 0,
    accessibility: 0,
    seo: coverage(pages.filter((page) => page.seo_title && page.seo_description).length, pages.length),
    performance: 0,
    content: coverage(populated, sections.length),
    navigation: pages.length > 1 ? 70 : pages.length ? 40 : 0,
    consistency: designed ? 70 : 0,
    mobile: 0,
    trust: context.business.publishedReviewCount || context.business.photoCount ? 70 : 30,
    proof: sections.some((section) => ["reviews", "gallery"].includes(section.kind)) ? 70 : 0,
    forms: sections.some((section) => ["contact", "booking", "quote"].includes(section.kind)) ? 70 : 0,
    cta: ctaPages ? coverage(ctaPages, pages.length) : 0,
    visualHierarchy: 0,
    designSystem: designed ? 70 : 0,
    rendererExecution: 0,
  };
  const score = clamp(Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length);
  return {
    actions,
    score,
    domains: scores,
    directionId: direction.id,
    trace: [
      "Ultimate visual direction: " + direction.name + ".",
      "Compiled " + actions.length + " bounded output actions.",
      "Evaluated " + pages.length + " visible pages and " + sections.length + " visible sections.",
      "Unmeasured browser and perceptual domains remain at zero until rendered evidence exists.",
      "Requested instruction: " + instruction.slice(0, 180),
    ],
  };
}
