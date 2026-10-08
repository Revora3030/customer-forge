/**
 * Headings that keep repeating the business name ("The Test Business Co.
 * Process", "Test Business Co. Services") read as templated. The name belongs in
 * the logo, the page title and — at most — the home page's opening heading.
 */
import type { PageArchitecture } from "@/lib/builder/creative-authority";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namePattern(businessName: string): RegExp | null {
  const name = businessName.trim();
  if (name.length < 3) return null;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(name)}(?=$|[^a-z0-9])`, "i");
}

export type NamedHeading = { page: string; section: number; heading: string };

/** Every heading that repeats the business name, except the home page opening. */
export function businessNameHeadlines(pages: PageArchitecture[], businessName: string): NamedHeading[] {
  const pattern = namePattern(businessName);
  if (!pattern) return [];
  const found: NamedHeading[] = [];
  for (const page of pages) {
    page.sections.forEach((section, index) => {
      const heading = section.heading ?? "";
      if (!heading) return;
      if (page.slug === "home" && index === 0) return;
      if (pattern.test(heading)) found.push({ page: page.slug, section: index, heading });
    });
  }
  return found;
}

/**
 * Last-resort tidy-up after the AI was already asked once to drop the name:
 * "The Test Business Co. Process" → "Our process", "Test Business Co.'s
 * Services" → "Our services". A heading that is only the name is left alone.
 */
export function withoutBusinessName(heading: string, businessName: string): string {
  const name = businessName.trim();
  if (name.length < 3) return heading;
  const lead = new RegExp(`^\\s*(?:the\\s+)?${escapeRegExp(name)}(?:['’]s)?[\\s:—–-]+(.+)$`, "i");
  const match = heading.match(lead);
  if (match?.[1]?.trim()) {
    const rest = match[1].trim();
    return `Our ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
  }
  const tail = new RegExp(`^(.+?)[\\s,]+(?:at|by|from|with)\\s+(?:the\\s+)?${escapeRegExp(name)}\\s*$`, "i");
  const trailing = heading.match(tail);
  if (trailing?.[1]?.trim()) return trailing[1].trim();
  return heading;
}

/** Apply {@link withoutBusinessName} to every flagged heading in place-safe copy. */
export function stripBusinessNameHeadlines(pages: PageArchitecture[], businessName: string): PageArchitecture[] {
  const flagged = new Set(businessNameHeadlines(pages, businessName).map((h) => `${h.page}#${h.section}`));
  if (!flagged.size) return pages;
  return pages.map((page) => ({
    ...page,
    sections: page.sections.map((section, index) =>
      flagged.has(`${page.slug}#${index}`) && section.heading
        ? { ...section, heading: withoutBusinessName(section.heading, businessName) }
        : section,
    ),
  }));
}
