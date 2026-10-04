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
import type { DesignDirection } from "@/lib/authored-direction";
import { craftBarPrompt } from "@/lib/builder/world-class-craft";
import { readSectionEffects } from "@/lib/authored-direction";
import { isBackdropId, safeBackdropSpec, type BackdropId } from "@/lib/site-effects";
import { safeColor } from "@/lib/site-style";
import { siteHeadingFont } from "@/lib/site-theme";
import { callBestThinker } from "@/lib/ai/hall-of-fame.server";
import { paletteProblems } from "@/lib/builder/palette-guard";

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
  "Choose real typeface families by name (any family available on Google Fonts). Pair a heading face with a body face that genuinely complements it; avoid default system sans pairings unless the business identity truly calls for them.",
  "Industry pairing intelligence: luxury/hospitality should consider an elegant display serif with an understated grotesque body; trades/automotive/engineering should consider a confident geometric or industrial headline with an ultra-legible functional sans; modern tech/SaaS should consider a crisp neo-grotesque headline with a humanist body. Treat these as intelligent starting points, not presets, and adapt them to the actual business.",
  "Palette architecture: design a 60/30/10 balance — roughly 60% dominant brand surface, 30% structural grounding tone, and 10% high-intent action accent. Never wash the entire page in a uniform neon or purple-blue gradient. The three supplied colours must work as roles, not as three equally dominant colours.",
  "Banned: generic grey, greige, silver, plain white-and-black, and any colourless palette. The surface must carry a deliberate tint (for example deep ink-navy, warm bone, forest, oxblood, espresso, midnight, sand) and the action colour must be saturated and memorable. Every colour must look chosen for THIS business, the way a top studio (Lovable, Framer, Pentagram) would brand it.",
  craftBarPrompt("brand_identity"),
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
        primary: "#hex — the high-intent action accent used sparingly (~10%)",
        secondary: "#hex — the dominant tinted brand surface (~60%), never plain grey or plain white",
        accent: "#hex — the structural grounding tone (~30%)",
        headingFont: "Family Name",
        bodyFont: "Family Name",
        fontNote: "one line on why this pairing",
        backdropSpec: {
          layers: [
            { shape: "radial | linear", colors: ["#hex", "#hex"], angle: 0, x: 50, y: 0, size: 80, opacity: 30 },
          ],
          drift: "none | slow | medium",
        },
        sectionEffects: { "<any section type you plan, e.g. hero>": "motion id" },
        defaultEffect: "motion id for section types you did not list",
      },
      null,
      2,
    ),
    "",
    "backdropSpec is optional: compose your own background from up to 8 gradient layers (any colours, positions and sizes), or omit it or set layers to [] for a plain page.",
    "Palette rule: secondary is the dominant surface, accent is the structural grounding tone, primary is the action accent. Do not treat all three as equal-weight fills.",
    "Motion ids the renderer can draw safely: none, float_3d, tilt_3d, glass, rise, parallax_slow. Use none wherever you want no motion. Page-level motion beyond these is authored later on each section's own composition.",
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

function unwrapIdentity(data: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!data) return null;
  for (const key of ["identity", "direction", "design", "visualIdentity", "brandIdentity"]) {
    const nested = data[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested))
      return nested as Record<string, unknown>;
  }
  return data;
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
  let outcome: Awaited<ReturnType<typeof callBestThinker>> | null = null;
  let data: Record<string, unknown> | null = null;
  let primary: string | null = null;
  let secondary: string | null = null;
  let accent: string | null = null;
  let heading: string | null = null;
  let body: string | null = null;
  let repairContext = "";

  // A valid but incomplete model response is repairable AI output, not provider
  // failure. Give the team one explicit correction pass before stopping. This
  // never introduces defaults: every creative value still comes from a model.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    outcome = await callBestThinker({
      purpose: "creative_direction",
      complexity: "high",
      system: SYSTEM,
      user: [
        schemaPrompt(input),
        attempt
          ? `REPAIR: Your previous response was incomplete or invalid (${repairContext || "required fields were missing"}). Return every required field, use literal six-digit hex colours such as #1a2b3c, use plain font family names without CSS fallbacks, and output one complete JSON object only.`
          : null,
      ].filter(Boolean).join("\n\n"),
      organizationId: input.organizationId,
      json: true,
      maxOutputTokens: 1400,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (!outcome.ok || !outcome.text) continue;
    data = unwrapIdentity(readJson(outcome.text));
    primary = safeColor(data?.["primary"]);
    secondary = safeColor(data?.["secondary"]);
    accent = safeColor(data?.["accent"]) ?? primary;
    heading = siteHeadingFont(str(data?.["headingFont"], 42));
    body = siteHeadingFont(str(data?.["bodyFont"], 42));
    const generic = primary && secondary ? paletteProblems({ primary, secondary, accent }) : [];
    if (data && primary && secondary && heading && generic.length === 0) break;
    repairContext = [
      ...generic,
      !data ? "response was not a JSON object" : null,
      !primary ? "primary colour was missing or invalid" : null,
      !secondary ? "secondary colour was missing or invalid" : null,
      !heading ? "heading font was missing or invalid" : null,
    ].filter(Boolean).join(", ");
  }

  if (!outcome?.ok || !data || !primary || !secondary || !heading) {
    // No stock "safe neutral" look is substituted: the identity is the AI
    // team's, or the build stops and is retried.
    const { AiStepUnavailableError } = await import("@/lib/builder/ai-step-error");
    throw new AiStepUnavailableError(
      "brand colours and fonts",
      outcome && !outcome.ok ? (outcome.detail ?? outcome.reason ?? null) : repairContext || null,
    );
  }

  // Nothing is filled in on the AI's behalf: an effect it didn't name is "none".
  const backdrop: BackdropId = isBackdropId(data["backdrop"]) ? data["backdrop"] : "none";

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
      backdropSpec: safeBackdropSpec(data["backdropSpec"]),
      ...readSectionEffects(data),
    },
    model: outcome.model ?? null,
    lane: outcome.lane,
  };
}
