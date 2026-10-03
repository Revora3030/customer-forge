/**
 * MEDIA INTEGRITY — NO EMPTY VISUAL CONTAINERS, EVER.
 *
 * A hero or gallery that renders as a large blank box is a failed build. This
 * gate inspects the material about to be written to a tenant's site and reports
 * every visual container that has no resolvable picture behind it, together with
 * the remedy: generate the image, attach a verified asset, or let the AI redesign
 * the section so no empty container exists.
 *
 * It never fabricates an asset and never marks an unresolved slot as fine.
 *
 * Pure module: no environment, no network, no secrets.
 */

import type { AiDesignContract, MaterialPage } from "@/lib/builder/ai-design-contract";

export type MediaViolation = {
  page: string;
  section: string;
  kind: "empty_required_media" | "broken_asset_reference" | "image_component_without_source";
  detail: string;
  remedy: "generate_image" | "attach_verified_asset" | "redesign_section";
};

type ComponentLike = { kind?: unknown; media_url?: unknown };

function componentsOf(section: Record<string, unknown>): ComponentLike[] {
  const raw = section["components"];
  return Array.isArray(raw) ? (raw as ComponentLike[]) : [];
}

function hasResolvedMedia(section: Record<string, unknown>): boolean {
  const direct = section["media_url"];
  if (typeof direct === "string" && direct.trim().length > 0) return true;
  return componentsOf(section).some(
    (component) => typeof component.media_url === "string" && component.media_url.trim().length > 0,
  );
}

/**
 * Inspects rendered material against the AI design's stated media needs. A
 * section the design marked `required` must carry a real picture.
 */
export function inspectMediaIntegrity(
  pages: MaterialPage[],
  contract: AiDesignContract,
): MediaViolation[] {
  const violations: MediaViolation[] = [];
  const needs = new Map<string, Map<string, "none" | "optional" | "required">>();
  for (const page of contract.pages) {
    const perRole = new Map<string, "none" | "optional" | "required">();
    for (const section of page.sections) perRole.set(section.role, section.media);
    needs.set(page.slug, perRole);
  }

  for (const page of pages) {
    const perRole = needs.get(page.slug);
    for (const section of page.sections) {
      const record = section as unknown as Record<string, unknown>;
      const need = perRole?.get(section.kind) ?? "none";
      if (need === "required" && !hasResolvedMedia(record))
        violations.push({
          page: page.slug,
          section: section.kind,
          kind: "empty_required_media",
          detail: `the design requires a picture in the ${section.kind} section and none resolved`,
          remedy: "generate_image",
        });

      for (const component of componentsOf(record)) {
        const isImage = component.kind === "image" || component.kind === "hero_image";
        const source = typeof component.media_url === "string" ? component.media_url.trim() : "";
        if (isImage && source.length === 0)
          violations.push({
            page: page.slug,
            section: section.kind,
            kind: "image_component_without_source",
            detail: "an image block has no picture behind it and would render as an empty box",
            remedy: "redesign_section",
          });
        else if (isImage && /^(undefined|null|about:blank)$/i.test(source))
          violations.push({
            page: page.slug,
            section: section.kind,
            kind: "broken_asset_reference",
            detail: `an image block points at "${source}", which cannot load`,
            remedy: "attach_verified_asset",
          });
      }
    }
  }
  return violations;
}

export class MediaIntegrityError extends Error {
  readonly violations: MediaViolation[];
  constructor(violations: MediaViolation[]) {
    super(
      `The build stopped because ${violations.length} visual area${violations.length === 1 ? "" : "s"} would have shown an empty picture box (first: ${violations[0]?.page}/${violations[0]?.section}). Pictures are generated or the section is redesigned — an empty placeholder is never published.`,
    );
    this.name = "MediaIntegrityError";
    this.violations = violations;
  }
}

/**
 * When picture making could not fill a slot, the section is redesigned as a
 * text-led section instead of failing the whole build: image blocks with no
 * picture are removed and the design's "required" picture need is relaxed to
 * "optional" for exactly those sections. Nothing is faked — no placeholder is
 * written — and broken references ("undefined", "about:blank") still fail.
 * Returns the adapted pages, contract and the list of sections it adapted.
 */
export function adaptMissingMedia<P extends MaterialPage>(
  pages: P[],
  contract: AiDesignContract,
): { pages: P[]; contract: AiDesignContract; adapted: { page: string; section: string }[] } {
  const violations = inspectMediaIntegrity(pages, contract);
  const adapted: { page: string; section: string }[] = [];
  const relax = new Set<string>();
  for (const violation of violations) {
    if (violation.kind === "broken_asset_reference") continue;
    relax.add(`${violation.page}::${violation.section}`);
  }
  if (!relax.size) return { pages, contract, adapted };
  const nextPages = pages.map((page) => ({
    ...page,
    sections: page.sections.map((section) => {
      if (!relax.has(`${page.slug}::${section.kind}`)) return section;
      adapted.push({ page: page.slug, section: section.kind });
      const record = section as unknown as Record<string, unknown>;
      const kept = componentsOf(record).filter((component) => {
        const isImage = component.kind === "image" || component.kind === "hero_image";
        const source = typeof component.media_url === "string" ? component.media_url.trim() : "";
        return !isImage || source.length > 0;
      });
      return { ...section, components: kept };
    }),
  })) as P[];
  const nextContract: AiDesignContract = {
    ...contract,
    pages: contract.pages.map((page) => ({
      ...page,
      sections: page.sections.map((section) =>
        relax.has(`${page.slug}::${section.role}`) && section.media === "required"
          ? { ...section, media: "optional" as const }
          : section,
      ),
    })),
  };
  return { pages: nextPages, contract: nextContract, adapted };
}

export function assertMediaIntegrity(pages: MaterialPage[], contract: AiDesignContract): void {
  const violations = inspectMediaIntegrity(pages, contract);
  if (violations.length > 0) throw new MediaIntegrityError(violations);
}
