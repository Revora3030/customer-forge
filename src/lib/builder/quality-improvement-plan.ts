import type { LaunchQualityFinding, LaunchQualityReport } from './launch-quality-gate';

export type QualityImprovementScope = 'hero' | 'content' | 'visuals' | 'mobile' | 'accessibility' | 'seo' | 'trust' | 'performance' | 'launch';

export type QualityImprovementPlan = {
  id: string;
  scope: QualityImprovementScope;
  label: string;
  instruction: string;
  reason: string;
  requiresPreview: true;
  reversible: true;
};

const scopeFor: Record<LaunchQualityFinding['dimension'], QualityImprovementScope> = {
  conversion: 'hero',
  messaging: 'hero',
  content: 'content',
  visual_design: 'visuals',
  mobile: 'mobile',
  accessibility: 'accessibility',
  seo: 'seo',
  trust: 'trust',
  performance: 'performance',
  publishing: 'launch',
};

const instructionFor: Record<LaunchQualityFinding['dimension'], string> = {
  conversion: 'Improve the primary conversion path. Keep the business facts intact, make the hero action explicit, and repeat one consistent CTA at decision points. Do not publish automatically.',
  messaging: 'Rewrite the value proposition for specificity. State the target customer, desired outcome, and differentiator in the first screen. Preserve factual claims and do not invent credentials.',
  content: 'Add the highest-value missing decision content: service detail, a simple process, FAQs, and practical next steps. Keep all existing pages and require preview before applying.',
  visual_design: 'Upgrade the visual hierarchy with a coherent premium direction, stronger type scale, spacing rhythm, and intentional media placement. Keep accessibility contrast and mobile readability intact.',
  mobile: 'Optimize the current site for phone widths. Prioritize the primary action, simplify dense layouts, protect readable text sizes, and preserve desktop content.',
  accessibility: 'Improve accessibility without changing the offer: semantic heading order, descriptive controls, contrast-safe colors, keyboard access, and reduced-motion-safe effects.',
  seo: 'Improve on-page search foundations. Draft unique metadata, one clear H1, and natural service and location intent. Do not add unsupported claims or keyword stuffing.',
  trust: 'Add trust-building structure near conversion points using only verified customer facts, real testimonials, credentials, guarantees, project evidence, or transparent process information.',
  performance: 'Reduce visual and technical page weight. Prefer responsive assets, defer nonessential media, and remove costly decorative effects while preserving the intended design.',
  publishing: 'Prepare a launch-readiness checklist for domain, contact routes, analytics, privacy links, and publish state. Do not change publishing or domain settings automatically.',
};

export function planQualityImprovements(report: LaunchQualityReport, limit = 3): QualityImprovementPlan[] {
  const requestedLimit = Number.isFinite(limit) ? Math.floor(limit) : 3;
  const safeLimit = Math.max(1, Math.min(5, requestedLimit));

  return report.findings.slice(0, safeLimit).map((finding) => ({
    id: `quality-${finding.dimension}`,
    scope: scopeFor[finding.dimension],
    label: finding.title,
    instruction: instructionFor[finding.dimension],
    reason: finding.recommendation,
    requiresPreview: true,
    reversible: true,
  }));
}
