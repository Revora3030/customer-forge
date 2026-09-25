/** Renderer-safe shapes for an image campaign authored entirely by AI. */
export type CampaignImageSlot =
  | "hero"
  | "service"
  | "about"
  | "proof"
  | "background"
  | "cta"
  | "social"
  | "icon";

export type PlannedShot = {
  slot: CampaignImageSlot;
  label: string;
  purpose: string;
  aspect: "16:9" | "4:3" | "1:1" | "3:2";
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