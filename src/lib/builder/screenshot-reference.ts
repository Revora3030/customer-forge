/**
 * Screenshot reference fingerprinting.
 *
 * A reference screenshot can influence layout, hierarchy, spacing, type feel,
 * colour mood and interaction language, but it must never copy brand assets,
 * wording, logos, exact colours or claims. This module accepts only bounded
 * structured observations and maps them into Revora's finite design vocabulary.
 */
import type { DesignFingerprint } from "@/lib/builder/design-fingerprint";
import type { CreativeBrief } from "@/lib/builder/first-build-contract";

export type ScreenshotReferenceObservation = {
  layout?: unknown;
  hierarchy?: unknown;
  typography?: unknown;
  spacing?: unknown;
  color?: unknown;
  interactions?: unknown;
  components?: unknown;
};

export type NormalizedScreenshotReferenceObservation = {
  layout: string[];
  hierarchy: string[];
  typography: string[];
  spacing: string[];
  color: string[];
  interactions: string[];
  components: string[];
};

export type ScreenshotReferenceBrief = {
  version: 1;
  applied: boolean;
  fingerprint: DesignFingerprint;
  signals: {
    layout: string[];
    hierarchy: string[];
    typography: string[];
    spacing: string[];
    color: string[];
    interactions: string[];
  };
  antiCloning: {
    copiedTextAllowed: false;
    copiedAssetsAllowed: false;
    copiedBrandAllowed: false;
    excluded: string[];
  };
  warnings: string[];
};

type SignalKey = keyof ScreenshotReferenceBrief["signals"];

const SIGNAL_KEYS: SignalKey[] = [
  "layout",
  "hierarchy",
  "typography",
  "spacing",
  "color",
  "interactions",
];

const OBSERVATION_KEYS = [...SIGNAL_KEYS, "components"] as const;

const CLONING_WORDS = /\b(logo|brand name|trademark|watermark|exact copy|verbatim|same text|same wording|clone|identical|pixel perfect|copy the|steal|screenshot text)\b/i;
const URL_OR_EMAIL = /(https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[\w.-]+)/i;
const HEX_COLOUR = /#[0-9a-f]{3,8}\b/i;

const asList = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
};

const cleanSignal = (value: string, blocked: string[]): string | null => {
  if (URL_OR_EMAIL.test(value) || HEX_COLOUR.test(value) || CLONING_WORDS.test(value)) return null;
  let text = value.replace(URL_OR_EMAIL, "").replace(HEX_COLOUR, "").trim().toLowerCase();
  for (const word of blocked) {
    const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (escaped) text = text.replace(new RegExp(escaped, "ig"), "").trim();
  }
  if (!text || CLONING_WORDS.test(text)) return null;
  return text.slice(0, 80);
};

function addSignal(
  signals: ScreenshotReferenceBrief["signals"],
  key: SignalKey,
  value: string,
) {
  const list = signals[key];
  if (!list.includes(value)) list.push(value);
}

function boundedObservations(
  observations: unknown,
  blocked: string[],
): { signals: ScreenshotReferenceBrief["signals"]; warnings: string[]; text: string } {
  const signals: ScreenshotReferenceBrief["signals"] = {
    layout: [],
    hierarchy: [],
    typography: [],
    spacing: [],
    color: [],
    interactions: [],
  };
  const warnings: string[] = [];
  if (!observations || typeof observations !== "object" || Array.isArray(observations)) {
    warnings.push("No structured screenshot observations were available, so nothing was passed to the design team.");
    return { signals, warnings, text: "" };
  }

  const raw = observations as ScreenshotReferenceObservation;
  for (const key of SIGNAL_KEYS) {
    for (const item of asList(raw[key])) {
      if (CLONING_WORDS.test(item) || URL_OR_EMAIL.test(item) || HEX_COLOUR.test(item)) {
        warnings.push(`${key} contained copy-like or exact asset detail and was ignored.`);
      }
      const cleaned = cleanSignal(item, blocked);
      if (cleaned) addSignal(signals, key, cleaned);
    }
  }
  for (const item of asList(raw.components)) {
    const cleaned = cleanSignal(item, blocked);
    if (cleaned) addSignal(signals, "layout", cleaned);
  }
  const text = SIGNAL_KEYS.flatMap((key) => signals[key]).join(" ");
  return { signals, warnings, text };
}

export function normalizeScreenshotReferenceObservations(
  observations: unknown,
  input: { businessName?: string | null; blockedNames?: string[]; maxPerField?: number } = {},
): NormalizedScreenshotReferenceObservation {
  const blocked = [input.businessName ?? "", ...(input.blockedNames ?? [])]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const maxPerField = Math.max(1, Math.min(input.maxPerField ?? 6, 8));
  const normal: NormalizedScreenshotReferenceObservation = {
    layout: [],
    hierarchy: [],
    typography: [],
    spacing: [],
    color: [],
    interactions: [],
    components: [],
  };
  if (!observations || typeof observations !== "object" || Array.isArray(observations)) return normal;
  const raw = observations as ScreenshotReferenceObservation;
  for (const key of OBSERVATION_KEYS) {
    for (const item of asList(raw[key])) {
      const cleaned = cleanSignal(item, blocked);
      if (cleaned && !normal[key].includes(cleaned)) normal[key].push(cleaned);
      if (normal[key].length >= maxPerField) break;
    }
  }
  return normal;
}

export function deriveScreenshotReferenceFingerprint(input: {
  observations: unknown;
  base: DesignFingerprint;
  businessName?: string | null;
  blockedNames?: string[];
}): ScreenshotReferenceBrief {
  const blocked = [input.businessName ?? "", ...(input.blockedNames ?? [])]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const { signals, warnings, text } = boundedObservations(input.observations, blocked);
  // No keyword → style mapping: the cleaned signals go to Sol as inspiration
  // and the saved look is never patched here.
  const applied = text.length > 0;
  const fingerprint = input.base;
  return {
    version: 1,
    applied,
    fingerprint,
    signals,
    antiCloning: {
      copiedTextAllowed: false,
      copiedAssetsAllowed: false,
      copiedBrandAllowed: false,
      excluded: [
        "logos",
        "brand names",
        "exact copy",
        "exact colours",
        "exact coordinates",
        "watermarks",
        "recognisable proprietary assets",
        "business claims from the reference",
      ],
    },
    warnings: warnings.slice(0, 8),
  };
}

export function applyScreenshotReferenceToCreative<
  T extends { fingerprint: DesignFingerprint; brief: CreativeBrief; referenceSignals?: Record<string, string[]> | null },
>(input: {
  creative: T;
  observations: unknown;
  businessName?: string | null;
  blockedNames?: string[];
}): { creative: T; reference: ScreenshotReferenceBrief } {
  const reference = deriveScreenshotReferenceFingerprint({
    observations: input.observations,
    base: input.creative.fingerprint,
    ...(input.businessName === undefined ? {} : { businessName: input.businessName }),
    ...(input.blockedNames === undefined ? {} : { blockedNames: input.blockedNames }),
  });
  if (!reference.applied) return { creative: input.creative, reference };
  return {
    creative: { ...input.creative, referenceSignals: reference.signals } as T,
    reference,
  };
}
