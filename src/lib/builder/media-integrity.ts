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
import type { CreativeSiteContract } from "@/lib/builder/creative-site-contract";

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

export function assertMediaIntegrity(pages: MaterialPage[], contract: AiDesignContract): void {
  const violations = inspectMediaIntegrity(pages, contract);
  if (violations.length > 0) throw new MediaIntegrityError(violations);
}

export function assertCreativeSiteMediaIntegrity(
  pages: Array<{ slug: string; sections: Array<{ kind: string; components?: Array<{ kind?: string; media_url?: string | null }> }> }>,
  contract: CreativeSiteContract,
): void {
  const required = new Map<string, Set<string>>();
  for (const page of contract.pages) {
    required.set(
      page.slug,
      new Set(
        page.sections
          .filter((section) => section.media?.required)
          .map((section) => section.role),
      ),
    );
  }
  const violations: MediaViolation[] = [];
  for (const page of pages) {
    const roles = required.get(page.slug) ?? new Set<string>();
    for (const section of page.sections) {
      if (!roles.has(section.kind)) continue;
      const hasMedia = (section.components ?? []).some(
        (component) =>
          typeof component.media_url === "string" &&
          component.media_url.trim().length > 0,
      );
      if (!hasMedia)
        violations.push({
          page: page.slug,
          section: section.kind,
          kind: "empty_required_media",
          detail: "the AI contract requires media but no resolved asset was materialized",
          remedy: "generate_image",
        });
    }
  }
  if (violations.length) throw new MediaIntegrityError(violations);
}
