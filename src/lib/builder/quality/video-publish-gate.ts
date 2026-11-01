/**
 * Publish block, pure part: what the video bar means for a publish, and what the owner is told.
 *
 * `VIDEO_BAR_GATE` = `enforce` | `warn` (default until the generator calls runVideoGate) | `off`.
 *  - enforce: a site under the bar cannot go live.
 *  - warn:    the score is shown and logged, nothing is blocked.
 *  - off:     the check is skipped.
 * A live edit (Jarvis, or the builder's straight-to-live apply) on a site that is already live is only stopped when it
 * makes the score worse than the version that is live now, so an existing site is never frozen by a bar it never had
 * to meet. A platform admin can override a block, with a written reason, and every override is logged.
 */
import type { IntakeFacts } from "@/lib/builder/quality/facts-guard";
import { ownerFixList, type VideoScore } from "@/lib/builder/quality/video-score";
import type { SiteTheme } from "@/lib/builder/quality/video-site-model";

export type GateMode = "enforce" | "warn" | "off";

export const gateMode = (env: Record<string, string | undefined> = process.env): GateMode => {
  const v = (env["VIDEO_BAR_GATE"] ?? "").trim().toLowerCase();
  return v === "enforce" || v === "off" ? v : "warn";
};

export type PublishDecision = {
  /** The video-bar readiness check passes (or does not apply). */
  ok: boolean;
  reason: "passed" | "mode_off" | "mode_warn" | "no_regression" | "below_bar";
};

export function decidePublish(input: {
  score: number;
  bar: number;
  mode: GateMode;
  liveEdit?: boolean;
  /** Score of the version that is live now, when there is one. */
  previousScore?: number | null;
}): PublishDecision {
  if (input.mode === "off") return { ok: true, reason: "mode_off" };
  if (input.score >= input.bar) return { ok: true, reason: "passed" };
  if (input.mode === "warn") return { ok: true, reason: "mode_warn" };
  if (input.liveEdit && typeof input.previousScore === "number" && input.score >= input.previousScore) return { ok: true, reason: "no_regression" };
  return { ok: false, reason: "below_bar" };
}

/** The owner-facing text for a block. Plain words, what to fix, no jargon. */
export function ownerBlockMessage(score: VideoScore, max = 5, opts: { autoFixTried?: boolean } = {}): string {
  const fixes = ownerFixList(score, max);
  const head = `Your website is not at our quality bar yet (${score.score} out of 100, it needs ${score.bar}).`;
  // A phone problem is named first, in plain words (G-A5): it is what a visitor sees before anything else.
  const phone = score.criteria.find((c) => c.id === "mobile_390" && !c.met);
  const lead = phone
    ? `Your site isn't ready to publish yet: ${phone.detail.charAt(0).toLowerCase()}${phone.detail.slice(1)}${opts.autoFixTried ? " We tried to fix it automatically." : ""} Ask the builder chat to fix it, then publish again. `
    : "";
  if (!fixes.length) return `${lead}${head} Ask Revora to improve the page and try again.`;
  return `${lead}${head} Fix these, then publish again: ${fixes.map((f, i) => `${i + 1}. ${f}`).join(" ")}`;
}

/** One-line detail for the readiness list. */
export function readinessDetail(score: VideoScore, decision: PublishDecision, previousScore?: number | null): string {
  const base = `Quality bar ${score.score}/100 (needs ${score.bar}).`;
  switch (decision.reason) {
    case "passed": return `${base} Meets the bar.`;
    case "mode_off": return "Quality bar check is switched off.";
    case "mode_warn": return `${base} Below the bar, shown as a warning only.`;
    case "no_regression": return `${base} Below the bar, but this edit does not lower the score of the live site (${previousScore}).`;
    default: return ownerBlockMessage(score);
  }
}

type ProfileRow = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

const flatten = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v);
  else if (typeof v === "number") out.push(String(v));
  else if (Array.isArray(v)) v.forEach((x) => flatten(x, out));
  else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach((x) => flatten(x, out));
  return out;
};

/** The owner's own facts, from their profile and services. Nothing here is generated. */
export function intakeFromWorkspace(input: {
  businessName?: unknown;
  profile?: ProfileRow | null;
  services?: readonly { name?: unknown; description?: unknown; price?: unknown; starting_price?: unknown }[] | null;
}): IntakeFacts {
  const p = input.profile ?? {};
  const services = (input.services ?? [])
    .filter((s) => str(s.name))
    .map((s) => ({ name: String(s.name), description: str(s.description), price: (s.price ?? s.starting_price ?? null) as string | number | null }));
  const ownerText = [str(p["tagline"]), str(p["description"]), str(p["awards"]), str(p["certifications"]), ...flatten(p["hours"]), ...flatten(p["testimonials"])]
    .filter(Boolean)
    .join("\n");
  const years = typeof p["years_in_business"] === "number" ? (p["years_in_business"] as number) : null;
  return {
    businessName: str(input.businessName),
    phone: str(p["phone"]),
    email: str(p["email"]) ?? str(p["support_email"]) ?? str(p["owner_email"]),
    address: str(p["address"]),
    city: str(p["city"]),
    serviceArea: str(p["service_area"]),
    description: str(p["description"]),
    services,
    websiteUrl: str(p["website"]),
    yearsInBusiness: years,
    ownerText,
  };
}

/** Fonts and colours the owner's site really uses. Missing values stay missing so they are not judged. */
export function themeFromProfile(profile: ProfileRow | null | undefined): SiteTheme {
  const p = profile ?? {};
  const fonts = (str(p["font_preference"]) ?? "").split("|").map((f) => f.trim()).filter(Boolean);
  const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toUpperCase() : null);
  const accent = hex(p["accent_color"]) ?? hex(p["primary_color"]);
  const palette: NonNullable<SiteTheme["palette"]> = {};
  if (accent) palette.accent = accent;
  return {
    ...(fonts.length ? { fonts } : {}),
    ...(Object.keys(palette).length ? { palette } : {}),
  };
}
