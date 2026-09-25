/**
 * AI-AUTHORED PAGE ARCHITECTURE.
 *
 * Which pages a site has, which sections live on each one and in what order is
 * a creative decision, so the AI authors it. This module is the safety boundary
 * around that decision: it turns the renderer's available material into a
 * candidate architecture the AI can reason about, parses the AI's answer, and
 * normalizes it against what actually exists.
 *
 * The AI may REORDER, OMIT, RETITLE and INVENT. An invented section or page is
 * accepted when it carries its own AI-written heading (and optional body); the
 * composition pass then designs it from those words. Working features (forms,
 * booking, contact, embeds) can never be invented — they need real setup.
 * Rejections are reported, never silently patched back to a built-in order.
 *
 * Pure module: no environment, no network, no secrets.
 */

import type { PageArchitecture } from "@/lib/builder/creative-authority";

export type ArchitectureRejection = { field: string; reason: string };

export type ArchitectureNormalization = {
  /** The AI's architecture, restricted to material that genuinely exists. */
  architecture: PageArchitecture[];
  rejected: ArchitectureRejection[];
  /** True when the result differs from the candidate the renderer offered. */
  changed: boolean;
};

type MaterialLike = {
  slug: string;
  title: string;
  kind: string;
  sections: { kind: string }[];
};

/**
 * The architecture the renderer can currently fill — the menu the AI chooses
 * from. This is NOT a template: it is the inventory of safe building blocks.
 */
export function deriveCandidateArchitecture(
  pages: MaterialLike[],
  primaryAction: string,
): PageArchitecture[] {
  return pages.map((page) => ({
    slug: page.slug,
    title: page.title,
    purpose: page.kind,
    primaryAction,
    sections: page.sections.map((section) => ({ role: section.kind })),
  }));
}

type RawPage = {
  slug?: unknown;
  title?: unknown;
  purpose?: unknown;
  primaryAction?: unknown;
  sections?: unknown;
};

/** Parses the AI's answer. Anything that is not the agreed shape returns null. */
export function parsePageArchitecture(raw: string): RawPage[] | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const pages = (parsed as { pages?: unknown }).pages;
  if (!Array.isArray(pages) || pages.length === 0) return null;
  return pages.filter((entry): entry is RawPage => Boolean(entry) && typeof entry === "object");
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const UNSAFE_HEADING = /<|>|javascript:|\{|\}/i;

/** An AI-written section heading, bounded and free of markup. */
function headingText(value: unknown, max: number): string | null {
  const value2 = text(value);
  if (!value2 || value2.length > max || UNSAFE_HEADING.test(value2)) return null;
  return value2;
}

type RawSection = { role: string; heading: string | null; subheading: string | null; body: string | null; layout: string | null; intent: string | null; media: "none" | "optional" | "required" | null };

function sectionRoles(value: unknown): RawSection[] {
  if (!Array.isArray(value)) return [];
  const roles: RawSection[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const role = text(entry);
      if (role) roles.push({ role, heading: null, subheading: null, body: null, layout: null, intent: null, media: null });
      continue;
    }
    if (entry && typeof entry === "object") {
      const row = entry as { role?: unknown; heading?: unknown; subheading?: unknown; body?: unknown; layout?: unknown; intent?: unknown; media?: unknown };
      const role = text(row.role);
      const media = row.media === "required" || row.media === "optional" || row.media === "none" ? row.media : null;
      if (role) roles.push({ role, heading: headingText(row.heading, 120), subheading: headingText(row.subheading, 260), body: headingText(row.body, 1200), layout: headingText(row.layout, 100), intent: headingText(row.intent, 300), media });
    }
  }
  return roles;
}

function sameShape(a: PageArchitecture[], b: PageArchitecture[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((page, index) => {
    const other = b[index];
    if (!other || other.slug !== page.slug) return false;
    if (other.sections.length !== page.sections.length) return false;
    return page.sections.every((section, i) => other.sections[i]?.role === section.role);
  });
}

/**
 * Restricts the AI's architecture to material that exists.
 *
 * A proposal that keeps no home page, or that fills no page with real sections,
 * is refused outright: the caller then retries or fails the build rather than
 * quietly reverting to the deterministic order.
 */
/** Section roles that are working features and can never be invented. */
const FEATURE_ROLES = new Set(["quote", "booking", "contact", "sticky_cta", "embed", "post_list", "composition", "hero", "gallery", "feature_media"]);
const SAFE_ROLE = /^[a-z][a-z0-9_]{1,30}$/;
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
/** Resource ceiling only; it is not a prescribed site size. */
export const MAX_INVENTED_PAGES = 24;

export function normalizePageArchitecture(input: {
  proposal: RawPage[];
  candidate: PageArchitecture[];
}): ArchitectureNormalization | null {
  const rejected: ArchitectureRejection[] = [];
  const bySlug = new Map(input.candidate.map((page) => [page.slug, page]));
  const architecture: PageArchitecture[] = [];
  const seen = new Set<string>();
  let invented = 0;

  const inventedSection = (slug: string, s: RawSection) => {
    if (!SAFE_ROLE.test(s.role) || FEATURE_ROLES.has(s.role)) {
      rejected.push({ field: `page.${slug}.${s.role}`, reason: "a new section needs a plain name and cannot invent an unavailable functional feature" });
      return null;
    }
    if (!s.heading) {
      rejected.push({ field: `page.${slug}.${s.role}`, reason: "a new section needs its own heading" });
      return null;
    }
    return { role: s.role, heading: s.heading, subheading: s.subheading, body: s.body, custom: true, layout: s.layout ?? undefined, intent: s.intent ?? undefined, media: s.media ?? "none" as const };
  };

  for (const raw of input.proposal) {
    const slug = text(raw.slug);
    if (!slug) {
      rejected.push({ field: "page.slug", reason: "a page was proposed without a slug" });
      continue;
    }
    if (seen.has(slug)) {
      rejected.push({ field: `page.${slug}`, reason: "the same page was proposed twice" });
      continue;
    }
    const source = bySlug.get(slug);
    const available = new Map<string, number>();
    for (const section of source?.sections ?? [])
      available.set(section.role, (available.get(section.role) ?? 0) + 1);
    if (!source) {
      if (!SAFE_SLUG.test(slug) || invented >= MAX_INVENTED_PAGES) {
        rejected.push({ field: `page.${slug}`, reason: invented >= MAX_INVENTED_PAGES ? `no more than ${MAX_INVENTED_PAGES} new pages` : "unsafe page address" });
        continue;
      }
    }

    const sections: PageArchitecture["sections"] = [];
    for (const entry of sectionRoles(raw.sections)) {
      const { role, heading, subheading, body, layout, intent, media } = entry;
      const left = available.get(role) ?? 0;
      if (left > 0) {
        available.set(role, left - 1);
        sections.push({ role, heading, subheading, body, layout: layout ?? undefined, intent: intent ?? undefined, media: media ?? "none" });
        continue;
      }
      const made = inventedSection(slug, entry);
      if (made) sections.push(made);
    }
    if (sections.length === 0) {
      rejected.push({ field: `page.${slug}`, reason: "the page was left with no sections" });
      continue;
    }

    const title = text(raw.title) ?? source?.title ?? null;
    if (!source && (!title || title.length > 60 || UNSAFE_HEADING.test(title))) {
      rejected.push({ field: `page.${slug}`, reason: "a new page needs a short plain title" });
      continue;
    }
    if (!source) invented += 1;
    seen.add(slug);
    architecture.push({
      slug,
      title: title ?? slug,
      purpose: text(raw.purpose) ?? source?.purpose ?? "page",
      primaryAction: text(raw.primaryAction) ?? source?.primaryAction ?? input.candidate[0]?.primaryAction ?? "",
      sections,
    });
  }

  const home = input.candidate[0]?.slug ?? "home";
  if (!architecture.some((page) => page.slug === home)) return null;
  if (architecture.length === 0) return null;

  return { architecture, rejected, changed: !sameShape(architecture, input.candidate) };
}
