/**
 * Bridges the website archetypes (what *kind* of website a business needs) into
 * the industry playbooks the deterministic builder already plans with.
 *
 * Effect: a whole-site build or redesign produces the pages and sections that
 * kind of business actually needs — a menu for a restaurant, rooms for a hotel,
 * listings for an estate agent, a timetable for a studio — instead of the same
 * services/about/contact shell for every industry.
 *
 * It only adds structure. It never writes a claim about the business.
 */

import { classifyArchetype, matchArchetype, type SiteArchetype } from "@/lib/site-archetypes";
import type { IndustryPlaybook } from "./industry";

/** Picks the website kind, letting an explicit request outrank the stored industry. */
export function archetypeFor(
  business: { name?: string | null; industry?: string | null; description?: string | null },
  instruction?: string | null,
): SiteArchetype {
  const requested = matchArchetype(instruction ?? null);
  if (requested) return requested;
  return classifyArchetype({
    industry: business.industry ?? null,
    businessName: business.name ?? null,
    description: business.description ?? null,
  });
}

/** Merges archetype pages and home sections into an industry playbook. */
export function enrichPlaybookWithArchetype(
  playbook: IndustryPlaybook,
  archetype: SiteArchetype,
): IndustryPlaybook {
  const slugs = new Set(playbook.pages.map((page) => page.slug));
  const pages = [...playbook.pages];
  for (const page of archetype.pages) {
    if (slugs.has(page.slug)) continue;
    slugs.add(page.slug);
    pages.push({
      kind: page.kind,
      title: page.title,
      slug: page.slug,
      why: `${archetype.name} websites need this page.`,
      priority: 65,
    });
  }

  // Keep closing blocks last so the home page still ends on its call to action.
  const closing = ["cta", "sticky_cta"];
  const body = playbook.homeSections.filter((kind) => !closing.includes(kind));
  const tail = playbook.homeSections.filter((kind) => closing.includes(kind));
  const extra = archetype.homeSections
    .map((section) => section.kind)
    .filter((kind) => !body.includes(kind) && !closing.includes(kind));

  return {
    ...playbook,
    pages,
    homeSections: [...body, ...extra, ...tail],
  };
}
