/** Deterministic quality dimensions for autonomous builder decisions. */
export type BuilderQualityProfile = {
  overall: number;
  design: number;
  conversion: number;
  content: number;
  mobile: number;
  seo: number;
  trust: number;
  completeness: number;
  priorities: string[];
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function qualityProfile(input: {
  completeness: number;
  conversionReadiness: number;
  contentReadiness: number;
  missingMobileCta: boolean;
  missingTrust: boolean;
  missingFaq: boolean;
  missingHomeHero: boolean;
  pagesMissingOpening?: number;
  totalPages?: number;
  emptySections?: number;
  pagesMissingSeo?: number;
  ctaCount?: number;
}): BuilderQualityProfile {
  const pageGapRatio = (input.pagesMissingOpening ?? (input.missingHomeHero ? 1 : 0)) /
    Math.max(1, input.totalPages ?? 1);
  const design = clamp(92 - pageGapRatio * 35);
  const conversion = clamp(input.conversionReadiness + (input.ctaCount && input.ctaCount > 0 ? 4 : -8));
  const content = clamp(input.contentReadiness - Math.min(15, (input.emptySections ?? 0) * 5));
  const mobile = clamp(input.missingMobileCta ? 74 : 94);
  const seo = clamp(input.completeness - 2 - Math.min(18, (input.pagesMissingSeo ?? 0) * 6));
  const trust = clamp(input.missingTrust ? 72 : 94);
  const completeness = clamp(input.completeness);
  const overall = clamp((design + conversion + content + mobile + seo + trust + completeness) / 7);
  const priorities: string[] = [];

  if (design < 85) priorities.push("design");
  if (conversion < 85) priorities.push("conversion");
  if (content < 85) priorities.push("content");
  if (mobile < 85) priorities.push("mobile");
  if (seo < 85) priorities.push("seo");
  if (trust < 85) priorities.push("trust");
  if (input.missingFaq) priorities.push("faq");
  if ((input.emptySections ?? 0) > 0 && !priorities.includes("content")) priorities.push("content");
  if ((input.pagesMissingSeo ?? 0) > 0 && !priorities.includes("seo")) priorities.push("seo");
  if ((input.ctaCount ?? 0) === 0 && !priorities.includes("conversion")) priorities.push("conversion");

  return {
    overall,
    design,
    conversion,
    content,
    mobile,
    seo,
    trust,
    completeness,
    priorities: [...new Set(priorities)].slice(0, 7),
  };
}
