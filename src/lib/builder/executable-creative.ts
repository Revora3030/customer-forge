import type { CreativeBrief } from "@/lib/builder/creative-brief";
import type { DesignFingerprint } from "@/lib/builder/design-fingerprint";

export const CREATIVE_CONTRACT_VERSION = 1 as const;

export type ExecutableCreativeSection = {
  version: typeof CREATIVE_CONTRACT_VERSION;
  family: string;
  composition: string;
  rhythm: "quiet" | "balanced" | "dramatic";
  headingTreatment: "clean" | "editorial" | "statement";
  mediaRole: "none" | "supporting" | "feature" | "background";
  mobileOrder: "content-first" | "media-first";
};

const token = (value: string) => value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);

function sourceFor(kind: string, fingerprint: DesignFingerprint): string {
  if (kind === "hero") return fingerprint.heroComposition;
  if (kind === "services") return fingerprint.cardSystem;
  if (kind === "reviews") return fingerprint.proofLayout;
  if (kind === "pricing") return fingerprint.pricingLayout;
  if (kind === "faq") return fingerprint.faqLayout;
  if (kind === "gallery") return fingerprint.galleryLayout;
  if (kind === "stats") return fingerprint.statsLayout;
  if (kind === "process") return fingerprint.timelineLayout;
  if (["quote", "booking", "contact"].includes(kind)) return fingerprint.formLayout;
  if (["cta", "offer"].includes(kind)) return fingerprint.ctaSystem;
  return fingerprint.sectionRhythm;
}

/**
 * Compiles the approved creative direction into a small renderer contract.
 * It is data-only, finite, backwards compatible, and contains no visitor claims.
 */
export function compileExecutableCreativeSection(
  kind: string,
  fingerprint: DesignFingerprint,
  brief: CreativeBrief | null | undefined,
): ExecutableCreativeSection {
  const source = token(sourceFor(kind, fingerprint));
  const editorial = /editorial|magazine|portrait|quote|serif|lede/.test(
    `${source} ${fingerprint.typeSystem} ${brief?.cardLanguage ?? ""}`.toLowerCase(),
  );
  const statement = /poster|statement|spotlight|impact|full-bleed|cinematic/.test(
    `${source} ${fingerprint.family} ${brief?.heroComposition ?? ""}`.toLowerCase(),
  );
  const featureMedia = ["hero", "gallery", "services", "reviews", "cta"].includes(kind);
  return {
    version: CREATIVE_CONTRACT_VERSION,
    family: token(fingerprint.family),
    composition: source,
    rhythm: fingerprint.density === "airy" ? "dramatic" : fingerprint.density === "compact" ? "quiet" : "balanced",
    headingTreatment: editorial ? "editorial" : statement ? "statement" : "clean",
    mediaRole: kind === "hero" && /full-bleed|poster|spotlight|banner/.test(source)
      ? "background"
      : featureMedia
        ? "feature"
        : kind === "intro" || kind === "process"
          ? "supporting"
          : "none",
    mobileOrder: /image-left|media-first|portrait/.test(
      `${source} ${(brief?.mobileStrategy ?? []).join(" ")}`.toLowerCase(),
    ) ? "media-first" : "content-first",
  };
}

export function writeExecutableCreativeSection(
  settings: Record<string, unknown>,
  contract: ExecutableCreativeSection,
): Record<string, unknown> {
  return { ...settings, creative: contract };
}

export function readExecutableCreativeSection(settings: unknown): ExecutableCreativeSection | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  const raw = (settings as Record<string, unknown>)["creative"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const rhythm = value["rhythm"];
  const headingTreatment = value["headingTreatment"];
  const mediaRole = value["mediaRole"];
  const mobileOrder = value["mobileOrder"];
  if (
    value["version"] !== CREATIVE_CONTRACT_VERSION ||
    typeof value["family"] !== "string" ||
    typeof value["composition"] !== "string" ||
    !["quiet", "balanced", "dramatic"].includes(String(rhythm)) ||
    !["clean", "editorial", "statement"].includes(String(headingTreatment)) ||
    !["none", "supporting", "feature", "background"].includes(String(mediaRole)) ||
    !["content-first", "media-first"].includes(String(mobileOrder))
  ) return null;
  return value as unknown as ExecutableCreativeSection;
}

/**
 * Backwards-compatible renderer contract for sites created before executable
 * creative settings were persisted. Existing settings always win. Image-backed
 * dark/luxury heroes receive the cinematic treatment instead of remaining in
 * the old split-template anatomy until the owner runs a destructive rebuild.
 */
export function resolveExecutableCreativeSection(input: {
  kind: string;
  settings: unknown;
  fingerprint: DesignFingerprint;
  hasMedia: boolean;
}): ExecutableCreativeSection {
  const stored = readExecutableCreativeSection(input.settings);
  if (stored) return stored;
  const inferred = compileExecutableCreativeSection(input.kind, input.fingerprint, null);
  if (
    input.kind === "hero" &&
    input.hasMedia &&
    /cinematic|dark-focused|luxury-editorial|elegant-classic/.test(input.fingerprint.family)
  ) {
    return {
      ...inferred,
      composition: "full-bleed-overlay",
      headingTreatment: /luxury|elegant/.test(input.fingerprint.family) ? "editorial" : "statement",
      mediaRole: "background",
    };
  }
  return inferred;
}