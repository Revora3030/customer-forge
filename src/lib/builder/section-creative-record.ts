/**
 * SAVED SECTION CREATIVE RECORD (read-only)
 *
 * Reads the per-section creative record stored in section settings and shows
 * it as saved. Nothing here infers a look from a style list: a section with no
 * saved record renders plain until the AI writes one. The only adjustment is a
 * readability safety rule (no light-on-scrim text without a picture behind it).
 */
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

const BLANK: ExecutableCreativeSection = {
  version: CREATIVE_CONTRACT_VERSION,
  family: "",
  composition: "",
  rhythm: "balanced",
  headingTreatment: "clean",
  mediaRole: "none",
  mobileOrder: "content-first",
};

export function resolveExecutableCreativeSection(input: {
  kind: string;
  settings: unknown;
  hasMedia: boolean;
}): ExecutableCreativeSection {
  const stored = readExecutableCreativeSection(input.settings);
  if (stored) return withMediaReality(stored, input.hasMedia);
  return { ...BLANK, mediaRole: input.hasMedia ? "supporting" : "none" };
}

/**
 * A background media role paints light copy over a dark scrim, which only reads
 * when a picture is actually behind it. Without media the same contract left
 * near-white headings on a pale page — unreadable. The role is downgraded to a
 * media-free composition so the section renders in the site's own colours.
 */
function withMediaReality(
  contract: ExecutableCreativeSection,
  hasMedia: boolean,
): ExecutableCreativeSection {
  if (hasMedia || contract.mediaRole !== "background") return contract;
  return { ...contract, composition: "content-led", mediaRole: "none" };
}