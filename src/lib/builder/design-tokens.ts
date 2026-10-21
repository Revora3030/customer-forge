/**
 * Site-wide design tokens the AI authors directly (corner radius, spacing
 * rhythm, depth, button shape, and the treatment of questions, cards and
 * buttons). Stored in website_settings.generation so the public site reads
 * them with the rest of the site design.
 *
 * The bounds and enums below are rendering-safety limits only, not creative
 * choices: the AI picks every value, and nothing here supplies a default look.
 */
export const FAQ_STYLES = ["lined", "boxed", "floating", "minimal"] as const;
export const CARD_STYLES = ["tint", "outline", "elevated", "glass", "bare"] as const;
export const BUTTON_STYLES = ["solid", "outline", "soft", "underline"] as const;

export type FaqStyle = (typeof FAQ_STYLES)[number];
export type CardStyle = (typeof CARD_STYLES)[number];
export type ButtonStyle = (typeof BUTTON_STYLES)[number];

export type DesignTokens = {
  /** Corner radius for cards, inputs and panels, px. */
  radius?: number;
  /** Button corner radius, px (999 = pill). */
  buttonRadius?: number;
  /** Section spacing multiplier: 0.6 tight to 1.6 airy. */
  space?: number;
  /** Default depth for cards. */
  shadow?: "none" | "subtle" | "medium" | "strong";
  /** How question lists (FAQ) are drawn. */
  faq?: FaqStyle;
  /** How content cards (steps, services) are drawn. */
  card?: CardStyle;
  /** How buttons are drawn. */
  button?: ButtonStyle;
};

const clamp = (value: unknown, min: number, max: number): number | undefined => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};
const SHADOWS = ["none", "subtle", "medium", "strong"] as const;
const pick = <T extends readonly string[]>(list: T, value: unknown): T[number] | undefined =>
  typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T[number]) : undefined;

export function safeDesignTokens(input: unknown): DesignTokens | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const out: DesignTokens = {};
  const radius = clamp(row["radius"], 0, 40);
  if (radius !== undefined) out.radius = Math.round(radius);
  const buttonRadius = clamp(row["buttonRadius"], 0, 999);
  if (buttonRadius !== undefined) out.buttonRadius = Math.round(buttonRadius);
  const space = clamp(row["space"], 0.6, 1.6);
  if (space !== undefined) out.space = Math.round(space * 100) / 100;
  const shadow = pick(SHADOWS, row["shadow"]);
  if (shadow) out.shadow = shadow;
  const faq = pick(FAQ_STYLES, row["faq"]);
  if (faq) out.faq = faq;
  const card = pick(CARD_STYLES, row["card"]);
  if (card) out.card = card;
  const button = pick(BUTTON_STYLES, row["button"]);
  if (button) out.button = button;
  return Object.keys(out).length ? out : null;
}

/**
 * Component treatments the design team must author for every new site. A
 * missing entry is sent back to the design team; it is never filled in here.
 */
export function missingComponentTokens(tokens: DesignTokens | null): Array<"faq" | "card" | "button"> {
  return (["faq", "card", "button"] as const).filter((key) => !tokens?.[key]);
}

export function readDesignTokens(generation: unknown): DesignTokens | null {
  if (!generation || typeof generation !== "object") return null;
  return safeDesignTokens((generation as Record<string, unknown>)["designTokens"]);
}

export function writeDesignTokens(generation: unknown, tokens: DesignTokens): Record<string, unknown> {
  const base = generation && typeof generation === "object" && !Array.isArray(generation) ? (generation as Record<string, unknown>) : {};
  const merged = safeDesignTokens({ ...(readDesignTokens(base) ?? {}), ...tokens }) ?? {};
  return { ...base, designTokens: merged };
}

const SHADOW_CSS: Record<NonNullable<DesignTokens["shadow"]>, string> = {
  none: "none",
  subtle: "0 1px 2px rgb(0 0 0 / 0.06), 0 2px 8px rgb(0 0 0 / 0.05)",
  medium: "0 4px 12px rgb(0 0 0 / 0.08), 0 12px 32px rgb(0 0 0 / 0.08)",
  strong: "0 10px 24px rgb(0 0 0 / 0.14), 0 24px 60px rgb(0 0 0 / 0.14)",
};

/** CSS variables the public site layout reads. */
export function designTokenVars(tokens: DesignTokens | null): Record<string, string> {
  if (!tokens) return {};
  const vars: Record<string, string> = {};
  if (tokens.radius !== undefined) vars["--radius"] = `${tokens.radius}px`;
  if (tokens.buttonRadius !== undefined) vars["--site-button-radius"] = `${tokens.buttonRadius}px`;
  if (tokens.space !== undefined) vars["--site-space"] = String(tokens.space);
  if (tokens.shadow) vars["--site-card-shadow"] = SHADOW_CSS[tokens.shadow];
  return vars;
}

/** Opt-in classes so an unset token never overrides the site's defaults. */
export function designTokenClasses(tokens: DesignTokens | null): string {
  if (!tokens) return "";
  return [
    tokens.buttonRadius !== undefined ? "rv-btn-radius" : "",
    tokens.shadow ? "rv-card-shadow" : "",
    tokens.faq ? `rv-faq-${tokens.faq}` : "",
    tokens.card ? `rv-card-${tokens.card}` : "",
    tokens.button ? `rv-button-${tokens.button}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
