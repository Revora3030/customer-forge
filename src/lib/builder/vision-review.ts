/**
 * VISION REVIEW
 * =============
 *
 * The honest half of "have a model look at the page and say what's wrong".
 *
 * A free multimodal model is shown a real screenshot of the rendered page and
 * asked for a strict list of visible problems. Everything the model says is
 * treated as untrusted text: this module validates it, throws away anything
 * outside the known problem vocabulary, caps the list, and maps only the
 * problems Revora can genuinely repair onto its existing repair actions.
 *
 * The model is never allowed to state a fact about the business, a price, or a
 * result — any finding carrying digits that look like a claim is dropped.
 */

import type { SectionEffectId } from "@/lib/site-effects";

/** The only problems a review may report. Anything else is discarded. */
export const VISION_ISSUE_KINDS = [
  "low_contrast_text",
  "text_over_busy_image",
  "cramped_spacing",
  "overlapping_elements",
  "unbalanced_layout",
  "heading_too_small",
  "heading_too_long",
  "cta_not_prominent",
  "too_much_movement",
  "image_badly_cropped",
  "image_stretched",
  "inconsistent_style",
  "empty_space_excess",
  "content_cut_off",
] as const;

export type VisionIssueKind = (typeof VISION_ISSUE_KINDS)[number];

export type VisionSeverity = "blocking" | "major" | "minor";

export type VisionFinding = {
  kind: VisionIssueKind;
  severity: VisionSeverity;
  /** Where on the page, in the model's words — cleaned and length-capped. */
  where: string;
  /** What the visitor sees, in plain language. */
  detail: string;
};

export type VisionReview = {
  /** 0–100, computed here from the findings. The model's own score is ignored. */
  score: number;
  verdict: "good" | "needs_work" | "poor";
  findings: VisionFinding[];
  /** Problems named by the model that Revora could not understand. */
  discarded: number;
  /** True when the model answered but named no problem. */
  clean: boolean;
};

const SEVERITIES = new Set<VisionSeverity>(["blocking", "major", "minor"]);
const KINDS = new Set<string>(VISION_ISSUE_KINDS);

/** Digits that look like a price, a percentage or a count of results. */
const CLAIM_LIKE = /(?:[$£€]\s?\d|\d+\s?%|\b\d{3,}\b|\b\d+\s?(?:customers?|clients?|years?|reviews?|stars?)\b)/i;

const MAX_FINDINGS = 12;

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (CLAIM_LIKE.test(text)) return "";
  return text.slice(0, max);
}

/** The instruction sent with the screenshot. Deliberately narrow. */
export function visionReviewPrompt(context: {
  pageTitle: string;
  viewportWidth: number;
}): string {
  const kinds = VISION_ISSUE_KINDS.join(", ");
  return [
    "You are reviewing a screenshot of a business web page for visual quality only.",
    `The page is titled "${clean(context.pageTitle, 80) || "this page"}" and the screenshot is ${Math.round(context.viewportWidth)} pixels wide.`,
    "Report ONLY problems you can actually see in the image.",
    `Each problem must use one of these exact kinds: ${kinds}.`,
    'Answer with JSON only: {"issues":[{"kind":"...","severity":"blocking|major|minor","where":"short location","detail":"one short sentence"}]}',
    "Do not comment on the wording, the prices, the business itself, or anything you cannot see.",
    "Never state a fact, figure or claim about the business.",
    "If the page looks fine, answer {\"issues\":[]}.",
    "Report at most 8 problems, most serious first.",
  ].join("\n");
}

/**
 * Validates a model's answer into a review. Never throws: an unusable answer
 * becomes an empty review with a discarded count, so the caller can honestly
 * report that the review did not produce anything.
 */
export function parseVisionReview(data: unknown): VisionReview {
  const raw = Array.isArray((data as { issues?: unknown })?.issues)
    ? ((data as { issues: unknown[] }).issues as unknown[])
    : [];
  const findings: VisionFinding[] = [];
  let discarded = 0;

  for (const entry of raw) {
    if (findings.length >= MAX_FINDINGS) {
      discarded += 1;
      continue;
    }
    if (!entry || typeof entry !== "object") {
      discarded += 1;
      continue;
    }
    const record = entry as Record<string, unknown>;
    const kind = typeof record["kind"] === "string" ? record["kind"].trim() : "";
    if (!KINDS.has(kind)) {
      discarded += 1;
      continue;
    }
    const severity = record["severity"];
    const resolved: VisionSeverity =
      typeof severity === "string" && SEVERITIES.has(severity as VisionSeverity)
        ? (severity as VisionSeverity)
        : "minor";
    const detail = clean(record["detail"], 200);
    if (!detail) {
      discarded += 1;
      continue;
    }
    if (findings.some((existing) => existing.kind === kind)) {
      discarded += 1;
      continue;
    }
    findings.push({
      kind: kind as VisionIssueKind,
      severity: resolved,
      where: clean(record["where"], 80) || "on the page",
      detail,
    });
  }

  const weight = { blocking: 22, major: 10, minor: 4 } as const;
  const penalty = findings.reduce((total, finding) => total + weight[finding.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const verdict: VisionReview["verdict"] =
    findings.some((finding) => finding.severity === "blocking") || score < 55
      ? "poor"
      : score < 85
        ? "needs_work"
        : "good";

  return { score, verdict, findings, discarded, clean: raw.length > 0 && findings.length === 0 };
}

/* ----------------------------------------------------------------- repairs */

export type VisionRepair =
  | { action: "set_section_effect"; effect: SectionEffectId; reason: string; kind: VisionIssueKind }
  | { action: "set_density"; density: "compact" | "balanced" | "airy"; reason: string; kind: VisionIssueKind }
  | { action: "set_image_overlay"; overlay: "scrim-strong"; reason: string; kind: VisionIssueKind }
  | { action: "set_image_fit"; fit: "cover"; reason: string; kind: VisionIssueKind }
  | { action: "emphasise_cta"; reason: string; kind: VisionIssueKind }
  | { action: "shorten_heading"; reason: string; kind: VisionIssueKind }
  | { action: "raise_contrast"; reason: string; kind: VisionIssueKind };

/**
 * The problems Revora can genuinely fix, and how. Anything not listed here is
 * reported to the owner as "needs a human eye" rather than silently ignored.
 */
export function visionRepairs(review: VisionReview): {
  repairs: VisionRepair[];
  unfixable: VisionFinding[];
} {
  const repairs: VisionRepair[] = [];
  const unfixable: VisionFinding[] = [];

  for (const finding of review.findings) {
    switch (finding.kind) {
      case "low_contrast_text":
        repairs.push({ action: "raise_contrast", reason: finding.detail, kind: finding.kind });
        break;
      case "text_over_busy_image":
        repairs.push({ action: "set_image_overlay", overlay: "scrim-strong", reason: finding.detail, kind: finding.kind });
        break;
      case "cramped_spacing":
        repairs.push({ action: "set_density", density: "airy", reason: finding.detail, kind: finding.kind });
        break;
      case "empty_space_excess":
        repairs.push({ action: "set_density", density: "balanced", reason: finding.detail, kind: finding.kind });
        break;
      case "too_much_movement":
        repairs.push({ action: "set_section_effect", effect: "none", reason: finding.detail, kind: finding.kind });
        break;
      case "image_stretched":
      case "image_badly_cropped":
        repairs.push({ action: "set_image_fit", fit: "cover", reason: finding.detail, kind: finding.kind });
        break;
      case "cta_not_prominent":
        repairs.push({ action: "emphasise_cta", reason: finding.detail, kind: finding.kind });
        break;
      case "heading_too_long":
        repairs.push({ action: "shorten_heading", reason: finding.detail, kind: finding.kind });
        break;
      default:
        unfixable.push(finding);
        break;
    }
  }

  return { repairs, unfixable };
}

/** Plain-language summary for the owner. Never overstates what happened. */
export function visionSummary(review: VisionReview): string {
  if (review.findings.length === 0) {
    return review.clean
      ? "The reviewer looked at the page and found nothing to flag."
      : "The reviewer could not produce a usable review of this page.";
  }
  const blocking = review.findings.filter((finding) => finding.severity === "blocking").length;
  const head = `${review.findings.length} visual problem${review.findings.length === 1 ? "" : "s"} spotted`;
  return blocking > 0 ? `${head}, ${blocking} serious enough to fix first.` : `${head}.`;
}
