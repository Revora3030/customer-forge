import type { AgentAction } from "@/lib/site-agent";

const CTA_KINDS = new Set(["cta", "offer", "sticky_cta", "contact", "booking", "quote"]);

export type ConversionSignal = { pages: number; pagesWithPrimaryPath: number; pagesMissingCta: number; proofSections: number };

export function conversionSignals(pages: Array<{ sections: Array<{ kind: string; components: Array<{ kind: string; link_url?: string | null }> }> }>): ConversionSignal {
  let pagesWithPrimaryPath = 0, pagesMissingCta = 0, proofSections = 0;
  for (const page of pages) {
    const hasCta = page.sections.some((s) => CTA_KINDS.has(s.kind) || s.components.some((c) => c.kind === "button" && Boolean(c.link_url)));
    if (hasCta) pagesWithPrimaryPath++; else pagesMissingCta++;
    proofSections += page.sections.filter((s) => ["reviews", "testimonials", "proof", "case_study"].includes(s.kind)).length;
  }
  return { pages: pages.length, pagesWithPrimaryPath, pagesMissingCta, proofSections };
}

export function compileConversionArchitecture(
  pages: Array<{ id: string; sections: Array<{ id: string; kind: string; components: Array<{ kind: string; link_url?: string | null }> }> }>,
  targetUrl: string | null,
  label: string,
  cap: number,
): AgentAction[] {
  if (!targetUrl) return [];
  const actions: AgentAction[] = [];
  for (const page of pages) {
    if (actions.length >= cap) break;
    const hero = page.sections.find((s) => s.kind === "hero") ?? page.sections[0];
    if (!hero) continue;
    const hasButton = hero.components.some((c) => c.kind === "button" && c.link_url === targetUrl);
    if (!hasButton) actions.push({ type: "add_component", sectionId: hero.id, kind: "button", label, link_url: targetUrl, link_label: label });
  }
  return actions;
}
