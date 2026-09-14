/** Lightweight deterministic UX audit used by autonomous planning. */

export type ExperienceAudit = {
  mobile: number;
  accessibility: number;
  performance: number;
  priorities: string[];
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function experienceAudit(input: {
  sectionCount: number;
  componentCount: number;
  hasStickyCta: boolean;
  hasImages: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  hasHero: boolean;
}): ExperienceAudit {
  let mobile = 70;
  let accessibility = 78;
  let performance = 88;
  const priorities: string[] = [];

  if (input.hasStickyCta) mobile += 12;
  else priorities.push("mobile_cta");
  if (input.hasHero) mobile += 6;
  else priorities.push("hero_hierarchy");
  if (input.sectionCount > 14) mobile -= 8;
  if (input.componentCount > 60) mobile -= 6;

  if (input.hasPhone || input.hasEmail) accessibility += 8;
  if (!input.hasPhone && !input.hasEmail) priorities.push("contact_accessibility");
  if (!input.hasHero) accessibility -= 5;

  if (input.hasImages) performance -= 4;
  if (input.componentCount > 70) performance -= 10;
  if (input.sectionCount > 18) performance -= 8;
  if (performance < 85) priorities.push("performance");
  if (mobile < 85) priorities.push("mobile");
  if (accessibility < 85) priorities.push("accessibility");

  return {
    mobile: clamp(mobile),
    accessibility: clamp(accessibility),
    performance: clamp(performance),
    priorities: [...new Set(priorities)],
  };
}
