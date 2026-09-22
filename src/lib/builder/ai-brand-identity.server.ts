/**
 * The visual identity of a brand-new website — palette, typefaces and section
 * treatments — authored by the design team rather than picked from a menu.
 *
 * There is no preset direction behind this. The AI names the colours and fonts
 * it wants for this particular business; this module only checks that what came
 * back is a safe colour and a safe family name before it is used. When the
 * design team cannot author an identity, the build fails loudly instead of
 * falling back to a stock look.
 */
import type { DesignDirection } from "@/lib/design-directions";
import {
  isBackdropId,
  isSectionEffectId,
  type BackdropId,
  type SectionEffectId,
} from "@/lib/site-effects";
import { safeColor } from "@/lib/site-style";
import { siteHeadingFont } from "@/lib/site-theme";
import { callBestThinker } from "@/lib/ai/hall-of-fame.server";

export type BrandIdentityInput = {
  organizationId: string;
  businessName: string;
  industry?: string | null;
  description?: string | null;
  city?: string | null;
  services?: { name: string }[];
  /** Font the owner already asked for, which the design team must honour. */
  requestedFont?: string | null;
  signal?: AbortSignal;
};

export type BrandIdentityOutcome = {
  direction: DesignDirection;
  model: string | null;
  lane: string;
};

const SYSTEM = [
  "You are the sole creative authority for a new business website.",
  "You invent this brand's visual identity from scratch. There is no template, no preset palette and no house style to respect.",
  "Choose colours that suit this specific business and would look deliberate to a design critic — not a default blue, and not the same scheme you would give any other business.",
  "Choose real typeface families by name (any family available on Google Fonts). Pair a heading face with a body face that genuinely complements it.",
  "Reply with JSON only.",
].join(" ");

function schemaPrompt(input: BrandIdentityInput): string {
  const services = (input.services ?? [])
    .slice(0, 12)
    .map((service) => service.name)
    .filter(Boolean);
  return [
    `Business name: ${input.businessName || "(unnamed)"}`,
    input.industry ? `Industry: ${input.industry}` : null,
    input.city ? `Location: ${input.city}` : null,
    input.description ? `What they do: ${input.description}` : null,
    services.length ? `Services: ${services.join(", ")}` : null,
    input.requestedFont
      ? `The owner already asked for this heading typeface, so use it: ${input.requestedFont}`
      : null,
    "",
    "Return exactly this JSON shape:",
    JSON.stringify(
      {
        name: "short name for the look",
        mood: "one sentence the owner would understand",
        bestFor: "who this look suits",
        primary: "#hex — the brand colour used for buttons and emphasis",
        secondary: "#hex — the dominant page background",
        accent: "#hex — a supporting highlight",
        headingFont: "Family Name",
        bodyFont: "Family Name",
        fontNote: "one line on why this pairing",
        backdrop: "one of: none, stars, aurora, nebula, grid, spotlight, gradient_mesh",
        heroEffect: "section treatment id",
        ctaEffect: "section treatment id",
        formEffect: "section treatment id",
        bodyEffect: "section treatment id",
      },
      null,
      2,
    ),
    "",
    "Valid section treatment ids: none, float_3d, tilt_3d, glass, gold_glow, rise, parallax_slow, shine.",
    "If an id you want is not listed, pick the closest listed one — the treatment is only a surface hint, the colours and type carry the design.",
  ]
    .filter((line) => line !== null)
    .join("\n");
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

function str(value: unknown, max = 160): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

/**
 * Authors the identity. Throws when the design team produced nothing usable —
 * the caller must retry or stop, never substitute a stock look.
 */
export async function authorBrandIdentity(
  input: BrandIdentityInput,
): Promise<BrandIdentityOutcome> {
  const outcome = await callBestThinker({
    purpose: "creative_direction",
    complexity: "high",
    system: SYSTEM,
    user: schemaPrompt(input),
    organizationId: input.organizationId,
    json: true,
    maxOutputTokens: 1400,
    ...(input.signal ? { signal: input.signal } : {}),
  });

  if (!outcome.ok || !outcome.text) {
    throw new Error(
      "The design team could not author a visual identity for this website, so nothing was created. Please try again in a moment.",
    );
  }

  const data = readJson(outcome.text);
  const primary = safeColor(data?.["primary"]);
  const secondary = safeColor(data?.["secondary"]);
  const accent = safeColor(data?.["accent"]) ?? primary;
  const heading = siteHeadingFont(str(data?.["headingFont"], 42));
  const body = siteHeadingFont(str(data?.["bodyFont"], 42));

  if (!data || !primary || !secondary || !heading) {
    throw new Error(
      "The design team's visual identity came back incomplete, so nothing was created. Please try again in a moment.",
    );
  }

  const backdrop: BackdropId = isBackdropId(data["backdrop"]) ? data["backdrop"] : "none";
  const effect = (key: string): SectionEffectId =>
    isSectionEffectId(data[key]) ? data[key] : "rise";

  return {
    direction: {
      id: "authored",
      name: str(data["name"], 60) ?? "Authored identity",
      mood: str(data["mood"], 200) ?? "",
      bestFor: str(data["bestFor"], 120) ?? "",
      primary,
      secondary,
      accent: accent ?? primary,
      font: body && body !== heading ? `${heading}|${body}` : heading,
      fontNote: str(data["fontNote"], 200) ?? "",
      backdrop,
      heroEffect: effect("heroEffect"),
      ctaEffect: effect("ctaEffect"),
      formEffect: effect("formEffect"),
      bodyEffect: effect("bodyEffect"),
      affinity: [],
    },
    model: outcome.model ?? null,
    lane: outcome.lane,
  };
}
