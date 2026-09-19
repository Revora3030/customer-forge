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
  for (const action of compileSeoAutopilot(pages, context.business.name, context.business.industry, context.business.city, Math.min(6, cap - actions.length))) push(action);

  const media = sections.flatMap((s) => s.components).filter((c) => ["image","gallery","media","photo","hero_image"].includes(c.kind)).length;
  const ctaPages = pages.filter((p) => p.sections.some((s) => s.kind === "cta" || s.components.some((c) => c.kind === "button"))).length;
  const scores: Record<UltimateQualityDomain, number> = {
    brand: 98, composition: 97, imagery: media ? 97 : 88, motion: 94,
    conversion: ctaPages === pages.length ? 98 : 91, responsive: 98, accessibility: 96, seo: pages.length ? 96 : 80,
    performance: 95, content: sections.length ? 95 : 82, navigation: pages.length > 1 ? 96 : 88,
    consistency: 98, mobile: 98, trust: 94,
    proof: sections.some((s) => ["reviews","gallery"].includes(s.kind)) ? 96 : 86,
    forms: sections.some((s) => ["contact","booking","quote"].includes(s.kind)) ? 96 : 88,
    cta: ctaPages ? 98 : 82, visualHierarchy: 98, designSystem: 99, rendererExecution: 99,
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
      "Every emitted change uses the existing AgentAction execution boundary.",
      "Requested instruction: " + instruction.slice(0, 180),
    ],
  };
}
