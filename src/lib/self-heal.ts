/**
 * REVORA SELF-HEALING — deterministic repair planner.
 *
 * Pre-Flight reports what a visitor would actually experience. This module
 * turns the subset of those findings Revora can safely correct into concrete,
 * reviewable repairs. It is pure and browser-safe so it can be unit tested and
 * previewed before anything is written.
 *
 * Rules:
 * - Only facts the business already supplied are used. Nothing is invented:
 *   no reviews, prices, credentials, locations or claims.
 * - Every repair names the exact row and field it changes, so the server can
 *   apply it transactionally and undo the exact same writes on failure.
 * - Anything Revora cannot determine safely is left alone for the owner.
 */

import { safeLinkUrl } from "@/lib/website-content";

export type HealPage = {
  id: string;
  slug: string;
  title: string | null;
  kind: string;
  is_visible: boolean;
  seo_title: string | null;
  seo_description: string | null;
};

export type HealSection = {
  id: string;
  page_id: string;
  kind: string;
  heading: string | null;
  body: string | null;
  is_visible: boolean;
  sort_order: number;
};

export type HealComponent = {
  id: string;
  section_id: string;
  kind: string;
  label: string | null;
  body: string | null;
  link_label: string | null;
  link_url: string | null;
  media_url: string | null;
};

export type HealFacts = {
  businessName: string | null;
  city: string | null;
  serviceArea: string | null;
  phone: string | null;
  /** Service names the owner entered — used for wording, never invented. */
  services: string[];
  siteSeoTitle: string | null;
  siteSeoDescription: string | null;
};

export type Repair =
  | { kind: "site_seo"; field: "title" | "description"; value: string; label: string }
  | {
      kind: "page_seo";
      id: string;
      field: "seo_title" | "seo_description";
      value: string;
      label: string;
    }
  | { kind: "section_heading"; id: string; value: string; label: string }
  | { kind: "component_alt"; id: string; value: string; label: string }
  | { kind: "component_link"; id: string; value: string; label: string };

const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const clean = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max);

const area = (facts: HealFacts) =>
  text(facts.serviceArea) ? facts.serviceArea : text(facts.city) ? facts.city : null;

const pageLabel = (page: HealPage) =>
  text(page.title) ? page.title : page.slug.replace(/[-_]+/g, " ") || "Home";

/** Title Revora can defend: the page name, the business, and the real area. */
function pageTitle(page: HealPage, facts: HealFacts): string {
  const parts = [pageLabel(page)];
  if (text(facts.businessName)) parts.push(facts.businessName);
  const where = area(facts);
  if (where && page.kind !== "home") parts.push(where);
  return clean(parts.join(" — "), 60);
}

function pageDescription(page: HealPage, facts: HealFacts): string {
  const who = text(facts.businessName) ? facts.businessName : "This business";
  const where = area(facts);
  const what = facts.services.filter(text).slice(0, 3).join(", ");
  const bits = [
    `${who}${where ? ` in ${where}` : ""}`,
    what ? `${what}.` : `${pageLabel(page)}.`,
    "Get a price, see what's included and book a time.",
  ];
  return clean(bits.join(" — ").replace(/—\s*—/g, "—"), 155);
}

/** Best safe destination for a button whose link is missing or unpublishable. */
export function repointLink(
  component: HealComponent,
  pages: HealPage[],
  facts: HealFacts,
): string | null {
  const wording = `${component.link_label ?? ""} ${component.label ?? ""} ${component.kind}`
    .toLowerCase()
    .trim();
  if (/call|phone|ring|speak/.test(wording) && text(facts.phone))
    return `tel:${facts.phone.replace(/[^\d+]/g, "")}`;

  const slugs = pages.filter((p) => p.is_visible).map((p) => `/${p.slug}`.replace(/\/+/g, "/"));
  const wants = (needle: RegExp) => slugs.find((slug) => needle.test(slug));
  if (/quote|price|estimate/.test(wording)) {
    const quote = wants(/quote|pricing|price/);
    if (quote) return quote;
  }
  if (/book|appoint|schedule|slot/.test(wording)) {
    const book = wants(/book|appoint|schedule/);
    if (book) return book;
  }
  if (/service|what we do/.test(wording)) {
    const services = wants(/service/);
    if (services) return services;
  }
  // A contact page is the safest catch-all; the home page is the last resort.
  return (
    wants(/contact|get-in-touch/) ?? slugs.find((slug) => slug === "/home") ?? slugs[0] ?? null
  );
}

/**
 * Plans every repair Revora can make from information the business already
 * gave. Returns an empty list when there is nothing safe to correct.
 */
export function planRepairs(
  pages: HealPage[],
  sections: HealSection[],
  components: HealComponent[],
  facts: HealFacts,
): Repair[] {
  const repairs: Repair[] = [];
  const visible = pages.filter((p) => p.is_visible);
  const home = pages.find((p) => p.kind === "home" || p.slug === "home") ?? visible[0];

  if (!text(facts.siteSeoTitle) && home) {
    repairs.push({
      kind: "site_seo",
      field: "title",
      value: pageTitle(home, facts),
      label: "Write the search title for your site",
    });
  }
  if (!text(facts.siteSeoDescription) && home) {
    repairs.push({
      kind: "site_seo",
      field: "description",
      value: pageDescription(home, facts),
      label: "Write the search description for your site",
    });
  }

  for (const page of visible) {
    if (!text(page.seo_title)) {
      repairs.push({
        kind: "page_seo",
        id: page.id,
        field: "seo_title",
        value: pageTitle(page, facts),
        label: `Add a search title to "${pageLabel(page)}"`,
      });
    }
    if (!text(page.seo_description)) {
      repairs.push({
        kind: "page_seo",
        id: page.id,
        field: "seo_description",
        value: pageDescription(page, facts),
        label: `Add a search description to "${pageLabel(page)}"`,
      });
    }
  }

  // A visible page with no headline at all reads as unfinished. The page's own
  // name is a truthful headline, so Revora can set it on the first section.
  for (const page of visible) {
    const own = sections
      .filter((s) => s.page_id === page.id && s.is_visible)
      .sort((a, b) => a.sort_order - b.sort_order);
    if (!own.length || own.some((s) => text(s.heading))) continue;
    const first = own[0]!;
    repairs.push({
      kind: "section_heading",
      id: first.id,
      value: clean(pageLabel(page), 80),
      label: `Give "${pageLabel(page)}" a headline`,
    });
  }

  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const pageById = new Map(pages.map((p) => [p.id, p]));

  for (const component of components) {
    // Image with no description — describe it from its own section, not a guess.
    if (text(component.media_url) && !text(component.label) && !text(component.body)) {
      const section = sectionById.get(component.section_id);
      const page = section ? pageById.get(section.page_id) : undefined;
      const source =
        (section && text(section.heading) ? section.heading : null) ??
        (page ? pageLabel(page) : null) ??
        facts.businessName;
      if (text(source)) {
        repairs.push({
          kind: "component_alt",
          id: component.id,
          value: clean(`${source} — photo of our work`, 120),
          label: "Describe an image for screen readers",
        });
      }
    }

    const isButton = /button|cta|link/i.test(component.kind);
    const raw = component.link_url;
    const safe = safeLinkUrl(raw);
    const brokenInternal =
      safe && !/^https?:|^mailto:|^tel:|^sms:/i.test(safe)
        ? !pages.some(
            (p) =>
              `/${p.slug}`.replace(/\/+/g, "/") ===
              ((safe.split("#")[0] || "/").replace(/\/+$/, "") || "/"),
          )
        : false;
    const needsLink = (isButton && !safe) || (text(raw) && !safe) || brokenInternal;
    if (!needsLink) continue;

    const destination = repointLink(component, pages, facts);
    if (!destination) continue;
    repairs.push({
      kind: "component_link",
      id: component.id,
      value: destination,
      label: `Point "${component.link_label ?? component.label ?? "a button"}" at ${destination}`,
    });
  }

  return repairs;
}

/** Plain-language grouping for the owner-facing report. */
export function describeRepairs(repairs: Repair[]): string {
  if (!repairs.length) return "Revora found nothing it could safely fix on its own.";
  const counts = new Map<string, number>();
  for (const repair of repairs) counts.set(repair.kind, (counts.get(repair.kind) ?? 0) + 1);
  const words: Record<Repair["kind"], string> = {
    site_seo: "search listing",
    page_seo: "page search details",
    section_heading: "missing headline",
    component_alt: "image description",
    component_link: "button destination",
  };
  return [...counts.entries()]
    .map(([kind, count]) => `${count} ${words[kind as Repair["kind"]]}${count === 1 ? "" : "s"}`)
    .join(", ");
}

/** Identity of a repair: the exact row and field it changes (not the value). */
export function repairKey(repair: Repair): string {
  if (repair.kind === "site_seo") return `site_seo:${repair.field}`;
  if (repair.kind === "page_seo") return `page_seo:${repair.id}:${repair.field}`;
  return `${repair.kind}:${repair.id}`;
}

/**
 * Verify step: a repair only counts as fixed when a fresh read no longer plans
 * it. A write the database accepted that did not change what the planner sees
 * (e.g. RLS matched no row) is reported as still open, never as fixed.
 */
export function verifiedRepairs(
  applied: readonly Repair[],
  stillPlanned: readonly Repair[],
): { fixed: Repair[]; unverified: Repair[] } {
  const open = new Set(stillPlanned.map(repairKey));
  const fixed: Repair[] = [];
  const unverified: Repair[] = [];
  for (const repair of applied) (open.has(repairKey(repair)) ? unverified : fixed).push(repair);
  return { fixed, unverified };
}
