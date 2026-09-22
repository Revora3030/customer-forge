/**
 * SITE-WIDE REDESIGN — AUTHORED, NOT MATCHED
 * ==========================================
 *
 * The owner says how the site should feel, in their own words. The design team
 * reads that sentence and writes the site's new visual identity directly: type
 * system, colour system, composition, card and decorative systems, rhythm,
 * density and movement. Any wording works, because nothing is matched against a
 * keyword list and nothing is chosen from a fixed set of looks.
 *
 * Only two rules survive from the old layer, and neither makes a creative
 * choice: a look the owner previously turned down is never re-applied, and copy,
 * prices, claims and business facts are never touched here.
 */
import type { DesignFingerprint } from "@/lib/builder/design-fingerprint";
import type { MotionIntensity } from "@/lib/builder/motion-pack";
import { callBestThinker } from "@/lib/ai/hall-of-fame.server";

/** Identity fields the design team may rewrite in a site-wide redesign. */
export const REDESIGNABLE_FIELDS = [
  "family",
  "typeSystem",
  "colorSystem",
  "heroComposition",
  "backgroundSystem",
  "sectionRhythm",
  "navSystem",
  "ctaSystem",
  "cardSystem",
  "proofLayout",
  "pricingLayout",
  "faqLayout",
  "galleryLayout",
  "statsLayout",
  "timelineLayout",
  "formLayout",
  "footerSystem",
  "decorativeSystem",
  "sectionTransition",
  "pageShell",
  "imageTreatment",
  "motionPattern",
] as const;

export type RedesignChange = { field: string; from: string; to: string };

export type AuthoredRedesign = {
  /** A short label for the look, in the design team's words. */
  label: string;
  /** One line the owner reads about what changed. */
  describe: string;
  next: DesignFingerprint;
  changes: RedesignChange[];
  blocked: string[];
  model: string | null;
};

const DENSITIES = new Set(["compact", "balanced", "airy"]);
const MOTIONS = new Set(["none", "subtle", "expressive"]);

const SYSTEM = [
  "You are the sole creative authority for an existing business website.",
  "The owner has described how they want it to feel. Rewrite the site's visual identity to deliver that, across every page.",
  "You are not picking from a menu: name the systems you want in your own words (for example a type system, a colour system, a hero composition, a card system).",
  "Change only what genuinely needs to change to deliver the request; leave the rest alone.",
  "Never change wording, prices, claims or business facts — this is a visual identity pass only.",
  "Reply with JSON only.",
].join(" ");

/** A safe identity token: plain words and hyphens, no CSS or markup syntax. */
const SAFE_TOKEN = /^[a-z0-9][a-z0-9-]{0,40}$/;

function token(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase().replace(/\s+/g, "-");
  return SAFE_TOKEN.test(slug) ? slug : null;
}

function line(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, max);
  return trimmed || null;
}

function readJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Authors the new identity. Throws when the design team produced nothing usable
 * — the caller reports that honestly instead of guessing at a look.
 */
export async function authorSiteWideRedesign(input: {
  organizationId: string;
  instruction: string;
  fingerprint: DesignFingerprint;
  industry?: string | null;
  signal?: AbortSignal;
}): Promise<AuthoredRedesign> {
  const current = Object.fromEntries(
    REDESIGNABLE_FIELDS.map((field) => [field, String(input.fingerprint[field] ?? "")]),
  );

  const outcome = await callBestThinker({
    purpose: "creative_direction",
    complexity: "high",
    system: SYSTEM,
    user: [
      `The owner asked: "${input.instruction}"`,
      input.industry ? `Industry: ${input.industry}` : null,
      "",
      "The site's current visual identity:",
      JSON.stringify(
        {
          ...current,
          density: input.fingerprint.density,
          motionLevel: input.fingerprint.motionLevel,
        },
        null,
        2,
      ),
      input.fingerprint.rejected?.length
        ? `The owner has already turned these down — do not use them: ${input.fingerprint.rejected.join(", ")}`
        : null,
      "",
      'Reply as: { "label": "short name for the new look", "describe": "one sentence for the owner", "identity": { ...only the fields you are changing... } }',
      "Inside identity you may set any of these fields: " +
        REDESIGNABLE_FIELDS.join(", ") +
        ', plus "density" (compact, balanced or airy) and "motionLevel" (none, subtle or expressive).',
      "Field values are lowercase words joined by hyphens, e.g. \"serif-display\", \"paper-ink\", \"asymmetric-split\". Invent the ones you need.",
    ]
      .filter((entry) => entry !== null)
      .join("\n"),
    organizationId: input.organizationId,
    json: true,
    maxOutputTokens: 1800,
    ...(input.signal ? { signal: input.signal } : {}),
  });

  if (!outcome.ok || !outcome.text) {
    throw new Error(
      "The design team couldn't work on the new look just now, so nothing was changed. Please try again in a moment.",
    );
  }

  const data = readJson(outcome.text);
  const identityRaw = data?.["identity"];
  const identity =
    identityRaw && typeof identityRaw === "object"
      ? (identityRaw as Record<string, unknown>)
      : null;
  if (!identity) {
    throw new Error(
      "The design team's new look came back incomplete, so nothing was changed. Please try again in a moment.",
    );
  }

  const rejected = new Set(input.fingerprint.rejected ?? []);
  const next: DesignFingerprint = { ...input.fingerprint };
  const changes: RedesignChange[] = [];
  const blocked: string[] = [];

  const record = (field: string, from: string, to: string) => {
    if (!to || to === from) return;
    if (rejected.has(to)) {
      blocked.push(to);
      return;
    }
    changes.push({ field, from, to });
    (next as unknown as Record<string, unknown>)[field] = to;
  };

  for (const field of REDESIGNABLE_FIELDS) {
    if (!(field in identity)) continue;
    const value = token(identity[field]);
    if (!value) continue;
    record(field, String(input.fingerprint[field] ?? ""), value);
  }

  const density = token(identity["density"]);
  if (density && DENSITIES.has(density)) {
    record("density", input.fingerprint.density, density);
  }
  const motion = token(identity["motionLevel"]);
  if (motion && MOTIONS.has(motion)) {
    record("motionLevel", input.fingerprint.motionLevel, motion as MotionIntensity);
  }

  next.updatedAt = new Date().toISOString();

  return {
    label: line(data?.["label"], 60) ?? "New look",
    describe: line(data?.["describe"], 240) ?? "",
    next,
    changes,
    blocked,
    model: outcome.model ?? null,
  };
}

/** Honest one-liner about what a redesign did. */
export function authoredRedesignSummary(result: AuthoredRedesign): string {
  if (result.changes.length === 0) {
    return result.blocked.length > 0
      ? "The design team's choices for that look were ones you'd already turned down, so nothing changed."
      : "The site already has that look, so nothing needed changing.";
  }
  const tail =
    result.blocked.length > 0
      ? ` ${result.blocked.length} option(s) skipped because you turned them down before.`
      : "";
  const count = result.changes.length;
  return `${count} design choice${count === 1 ? "" : "s"} changed across every page. ${result.describe}${tail}`.trim();
}
