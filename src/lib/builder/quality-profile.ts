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
}): BuilderQualityProfile {
  const design = clamp(input.missingHomeHero ? 70 : 92);
  const conversion = clamp(input.conversionReadiness);
  const content = clamp(input.contentReadiness);
  const mobile = clamp(input.missingMobileCta ? 74 : 94);
  const seo = clamp(input.completeness - 2);
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
