/** Renderer-safe shapes for an image campaign authored entirely by AI. */
/** An AI-authored semantic role. It is data, never a built-in layout choice. */
export type CampaignImageSlot = string;

export type PlannedShot = {
  slot: CampaignImageSlot;
  label: string;
  purpose: string;
  /** Positive renderer-safe ratio authored by the AI, normalized to `a:b`. */
  aspect: string;
  placement: string[];
  subjectHint?: string | undefined;
};

export type ImageQualityIssue = { level: "fix" | "warn"; message: string };

/** Safety/readiness checks only; this function makes no creative choices. */
export function checkImageQuality(input: {
  width?: number | null;
  height?: number | null;
  sizeBytes?: number | null;
  altText?: string | null;
  slot?: CampaignImageSlot;
}): ImageQualityIssue[] {
  const issues: ImageQualityIssue[] = [];
  const { width, height, sizeBytes, altText } = input;
  if (width && height) {
    if (width < 1200 && (input.slot === "hero" || input.slot === "cta"))
      issues.push({ level: "fix", message: `Only ${width}px wide — hero images look soft below 1200px.` });
    const ratio = width / height;
    if (input.slot === "hero" && (ratio < 1.4 || ratio > 2.2))
      issues.push({ level: "warn", message: "Shape is off for a banner — it will crop hard on desktop." });
  }
  if (sizeBytes && sizeBytes > 600 * 1024)
    issues.push({ level: "warn", message: "Over 600 KB — it will slow the page on mobile data." });
  if (!altText?.trim())
    issues.push({ level: "fix", message: "No alt text, so search engines and screen readers can't read it." });
  return issues;
}
/**
 * The site's fixed picture shapes: the opening/hero frame is 16:9 and card-like pictures (services, gallery,
 * features, team-free supporting shots) are 4:3, so every picture on a page crops the same way and the
 * renderer can reserve its space before it loads. Other placements keep the AI's ratio.
 */
export function standardShotAspect(input: { slot?: string | null; placement?: readonly string[] | string | null; aspect?: string | null }): string {
  const where = [input.slot ?? "", ...(Array.isArray(input.placement) ? input.placement : [input.placement ?? ""])].join(" ").toLowerCase();
  if (/hero|masthead|opening|banner|\blead\b/.test(where)) return "16:9";
  if (/card|service|offering|gallery|feature|project|work|menu|treatment|listing/.test(where)) return "4:3";
  return input.aspect && /^\d{1,2}:\d{1,2}$/.test(input.aspect) ? input.aspect : "4:3";
}

/** Intrinsic width/height for an `a:b` ratio, so an <img> reserves its box before it loads (no layout shift). */
export function intrinsicSize(aspect: string | null | undefined, width = 1600): { width: number; height: number } | null {
  const m = /^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/.exec(String(aspect ?? "").trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!(a > 0 && b > 0)) return null;
  return { width, height: Math.round((width * b) / a) };
}

/**
 * One shared style line for every picture of a site, taken from the hero's AI-authored art direction, so
 * the whole campaign reads as one shoot (same grade, light and lens) instead of unrelated stock frames.
 */
export function sharedCampaignStyle(inventory: readonly { slot?: string; lighting?: string | null; palette?: string | null; mood?: string | null; camera?: string | null }[] | null | undefined): string {
  const list = inventory ?? [];
  const lead = list.find((item) => /hero|opening/i.test(item.slot ?? "")) ?? list[0];
  if (!lead) return "";
  const parts = [lead.lighting, lead.palette, lead.mood, lead.camera].map((v) => (typeof v === "string" ? v.trim().slice(0, 140) : "")).filter(Boolean);
  return parts.length
    ? `Shared campaign style, identical on every picture of this site: ${parts.join("; ")}. Same colour grade, lens character and time of day as the opening picture.`
    : "";
}
