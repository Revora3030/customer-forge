/**
 * AI-AUTHORED PAGE ARCHITECTURE.
 *
 * Which pages a site has, which sections live on each one and in what order is
 * a creative decision, so the AI authors it. This module is the safety boundary
 * around that decision: it turns the renderer's available material into a
 * candidate architecture the AI can reason about, parses the AI's answer, and
 * normalizes it against what actually exists.
 *
 * The AI may REORDER, OMIT and RETITLE. It may never invent a page slug or a
 * section role the renderer cannot fill — that would produce an empty container
 * on a real customer's website. Rejections are reported, never silently patched
 * back to the old deterministic order.
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

type RawSection = { role: string; heading: string | null; subheading: string | null };

function sectionRoles(value: unknown): RawSection[] {
  if (!Array.isArray(value)) return [];
  const roles: RawSection[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const role = text(entry);
      if (role) roles.push({ role, heading: null, subheading: null });
      continue;
    }
    if (entry && typeof entry === "object") {
      const row = entry as { role?: unknown; heading?: unknown; subheading?: unknown };
      const role = text(row.role);
      if (role) roles.push({ role, heading: headingText(row.heading, 120), subheading: headingText(row.subheading, 260) });
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
export function normalizePageArchitecture(input: {
  proposal: RawPage[];
  candidate: PageArchitecture[];
}): ArchitectureNormalization | null {
  const rejected: ArchitectureRejection[] = [];
  const bySlug = new Map(input.candidate.map((page) => [page.slug, page]));
  const architecture: PageArchitecture[] = [];
  const seen = new Set<string>();

  for (const raw of input.proposal) {
    const slug = text(raw.slug);
    if (!slug) {
      rejected.push({ field: "page.slug", reason: "a page was proposed without a slug" });
      continue;
    }
    const source = bySlug.get(slug);
    if (!source) {
      rejected.push({ field: `page.${slug}`, reason: "no real content exists for that page" });
      continue;
    }
    if (seen.has(slug)) {
      rejected.push({ field: `page.${slug}`, reason: "the same page was proposed twice" });
      continue;
    }

    const available = new Map<string, number>();
    for (const section of source.sections)
      available.set(section.role, (available.get(section.role) ?? 0) + 1);

    const sections: PageArchitecture["sections"] = [];
    for (const { role, heading, subheading } of sectionRoles(raw.sections)) {
      const left = available.get(role) ?? 0;
      if (left <= 0) {
        rejected.push({
          field: `page.${slug}.${role}`,
          reason: left === 0 && !source.sections.some((section) => section.role === role)
            ? "that section does not exist on this page"
            : "that section was placed more times than there is content for",
        });
        continue;
      }
      available.set(role, left - 1);
      sections.push({ role, heading, subheading });
    }
    if (sections.length === 0) {
      rejected.push({ field: `page.${slug}`, reason: "the page was left with no fillable sections" });
      continue;
    }

    seen.add(slug);
    architecture.push({
      slug,
      title: text(raw.title) ?? source.title,
      purpose: text(raw.purpose) ?? source.purpose,
      primaryAction: text(raw.primaryAction) ?? source.primaryAction,
      sections,
    });
  }

  const home = input.candidate[0]?.slug ?? "home";
  if (!architecture.some((page) => page.slug === home)) return null;
  if (architecture.length === 0) return null;

  return { architecture, rejected, changed: !sameShape(architecture, input.candidate) };
}
