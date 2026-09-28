/**
 * Executable creative section — compatibility adapter for legacy published sites.
 *
 * Resolves a section's kind + settings into a creative rendering directive.
 * For AI-authored sections this is not used; the contract is applied directly.
 */

import type { DesignFingerprint } from "@/lib/builder/design-fingerprint";

export type ExecutableCreativeSection = {
  mediaRole: "background" | "inline" | "none";
  layout: string;
  treatment: string;
  hasMedia: boolean;
  headingTreatment?: string;
  rhythm?: string;
  mobileOrder?: string;
};

export function resolveExecutableCreativeSection(input: {
  kind: string;
  settings: unknown;
  fingerprint: DesignFingerprint | null;
  hasMedia: boolean;
}): ExecutableCreativeSection | null {
  if (!input.fingerprint) return null;
  const hasMedia = input.hasMedia;
  switch (input.kind) {
    case "hero":
      return {
        mediaRole: hasMedia ? "background" : "none",
        layout: input.fingerprint.heroComposition,
        treatment: input.fingerprint.imageTreatment,
        hasMedia,
      };
    case "gallery":
      return {
        mediaRole: "inline",
        layout: input.fingerprint.galleryLayout,
        treatment: input.fingerprint.imageTreatment,
        hasMedia,
      };
    case "services":
      return {
        mediaRole: "none",
        layout: input.fingerprint.sectionComposition,
        treatment: input.fingerprint.cardSystem,
        hasMedia,
      };
    case "about":
      return {
        mediaRole: hasMedia ? "inline" : "none",
        layout: input.fingerprint.sectionComposition,
        treatment: input.fingerprint.imageTreatment,
        hasMedia,
      };
    case "testimonials":
      return {
        mediaRole: "none",
        layout: input.fingerprint.proofLayout,
        treatment: input.fingerprint.cardSystem,
        hasMedia,
      };
    default:
      return {
        mediaRole: "none",
        layout: input.fingerprint.sectionComposition,
        treatment: input.fingerprint.cardSystem,
        hasMedia,
      };
  }
}

export function compileExecutableCreativeSection(
  kind: string,
  fingerprint: DesignFingerprint | null,
  creativeBrief?: unknown,
): ExecutableCreativeSection | null {
  return resolveExecutableCreativeSection({
    kind,
    settings: null,
    fingerprint,
    hasMedia: false,
  });
}

export function writeExecutableCreativeSection(settings: Record<string, unknown>, creative: ExecutableCreativeSection | null): Record<string, unknown> {
  if (!creative) return settings;
  return { ...settings, creative };
}
