/**
 * Free Growth Engine — hard-coded compliance and scoring rules.
 * Pure functions so the server re-checks them on every approval and the AI
 * can never override them.
 */

export type RiskLevel = "low" | "medium" | "high";

export type ApprovalItemType =
  | "gbp_post"
  | "review_reply"
  | "directory_submission"
  | "blog"
  | "faq"
  | "qna_reply"
  | "social_post"
  | "review_request"
  | "referral_invite"
  | "partnership_pitch";

export const MODULE_LABEL: Record<ApprovalItemType, string> = {
  gbp_post: "Google profile",
  review_reply: "Review replies",
  directory_submission: "Directories",
  blog: "Content & SEO",
  faq: "Content & SEO",
  qna_reply: "Reddit & Quora",
  social_post: "Social",
  review_request: "Review requests",
  referral_invite: "Referrals",
  partnership_pitch: "Partnerships",
};

/** Items that reach the public or a person are higher risk. */
export function riskFor(type: ApprovalItemType, opts: { negativeReview?: boolean } = {}): RiskLevel {
  if (type === "review_reply") return opts.negativeReview ? "high" : "medium";
  if (type === "qna_reply" || type === "social_post" || type === "gbp_post") return "medium";
  if (type === "review_request" || type === "referral_invite") return "medium";
  if (type === "partnership_pitch") return "low"; // owner sends it manually
  return "low";
}

/** Items Jarvis never executes itself — the owner carries them out by hand. */
export const MANUAL_ONLY: ReadonlySet<ApprovalItemType> = new Set([
  "partnership_pitch",
  "qna_reply",
  "directory_submission",
]);

// ---- Messaging consent ------------------------------------------------------

export type SmsCheck = { ok: true } | { ok: false; reason: string };

export function canSendSms(input: {
  phone: string | null | undefined;
  smsConsentAt: string | null | undefined;
  smsProviderConnected: boolean;
}): SmsCheck {
  if (!input.smsConsentAt) return { ok: false, reason: "No recorded text-message opt-in." };
  if (!input.phone || !/^\+?[0-9 ()-]{10,20}$/.test(input.phone))
    return { ok: false, reason: "No valid phone number." };
  if (!input.smsProviderConnected) return { ok: false, reason: "Texting service is not connected." };
  return { ok: true };
}

export function canSendEmail(input: {
  email: string | null | undefined;
  mailingAddress: string | null | undefined;
}): SmsCheck {
  if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    return { ok: false, reason: "No valid email address." };
  if (!input.mailingAddress?.trim())
    return { ok: false, reason: "A physical mailing address is required on every automated email." };
  return { ok: true };
}

// ---- Daily caps -------------------------------------------------------------

export const DAILY_REPLY_CAP: Record<string, number> = {
  reddit: 3,
  quora: 3,
  instagram: 2,
  gbp: 2,
};

export function capAllows(platform: string, usedToday: number): boolean {
  const cap = DAILY_REPLY_CAP[platform] ?? 0;
  return usedToday < cap;
}

// ---- Re-approval ------------------------------------------------------------

/** Any edit to an approved/executed item returns it to pending. */
export function statusAfterEdit(current: string): "pending" {
  void current;
  return "pending";
}

// ---- NAP consistency --------------------------------------------------------

const normalise = (v: string | null | undefined) =>
  (v ?? "")
    .toLowerCase()
    .replace(/\b(street)\b/g, "st")
    .replace(/\b(avenue)\b/g, "ave")
    .replace(/\b(road)\b/g, "rd")
    .replace(/\b(suite)\b/g, "ste")
    .replace(/\b(llc|inc|co)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");

const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

export type NapField = "name" | "address" | "phone";

export function napMismatches(
  source: { name: string; address?: string | null; phone?: string | null },
  listing: { name?: string | null; address?: string | null; phone?: string | null },
): NapField[] {
  const out: NapField[] = [];
  if (listing.name != null && normalise(listing.name) !== normalise(source.name)) out.push("name");
  if (listing.address != null && source.address && normalise(listing.address) !== normalise(source.address))
    out.push("address");
  if (listing.phone != null && source.phone && digits(listing.phone) !== digits(source.phone)) out.push("phone");
  return out;
}

/** Submission is allowed only when the business record itself is complete. */
export function napReady(source: { name?: string | null; address?: string | null; phone?: string | null }) {
  const missing: NapField[] = [];
  if (!source.name?.trim()) missing.push("name");
  if (!source.address?.trim()) missing.push("address");
  if (!source.phone?.trim()) missing.push("phone");
  return missing;
}

// ---- Google profile score ---------------------------------------------------

export type GbpInput = {
  category?: string | null;
  hasHours: boolean;
  photosCount: number;
  lastPhotoDate?: string | null;
  postsCount: number;
  lastPostDate?: string | null;
  reviewsCount: number;
  avgRating?: number | null;
  hasBookingLink: boolean;
  hasDescription: boolean;
};

const daysSince = (iso: string | null | undefined, now: Date) =>
  iso ? Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000) : Infinity;

export function gbpScore(input: GbpInput, now = new Date()) {
  const fixes: { points: number; fix: string }[] = [];
  let score = 0;
  const add = (ok: boolean, points: number, fix: string) => (ok ? (score += points) : fixes.push({ points, fix }));
  add(Boolean(input.category), 10, "Set an accurate primary category.");
  add(input.hasHours, 10, "Add opening hours.");
  add(input.hasDescription, 10, "Write a business description.");
  add(input.hasBookingLink, 10, "Add a booking or quote link.");
  add(input.photosCount >= 10, 10, "Upload at least 10 photos.");
  add(daysSince(input.lastPhotoDate, now) <= 30, 10, "Add a new photo this month.");
  add(daysSince(input.lastPostDate, now) <= 7, 15, "Publish a post this week.");
  add(input.reviewsCount >= 10, 15, "Reach 10+ reviews.");
  add((input.avgRating ?? 0) >= 4.5, 10, "Raise average rating to 4.5+ by replying and asking happy customers.");
  return { score, fixes: fixes.sort((a, b) => b.points - a.points).map((f) => f.fix) };
}

// ---- Health ------------------------------------------------------------------

export function healthScore(input: {
  gbpScore: number | null;
  reviewsLast30: number;
  contentPublishedLast30: number;
  directoriesLive: number;
  directoriesTotal: number;
}) {
  const gbp = input.gbpScore ?? 0;
  const reviews = Math.min(100, input.reviewsLast30 * 20);
  const content = Math.min(100, input.contentPublishedLast30 * 25);
  const dirs = input.directoriesTotal ? Math.round((input.directoriesLive / input.directoriesTotal) * 100) : 0;
  return Math.round(gbp * 0.35 + reviews * 0.25 + content * 0.2 + dirs * 0.2);
}

// ---- Reference lists --------------------------------------------------------

export const CORE_DIRECTORIES = [
  "Google Business Profile",
  "Bing Places",
  "Apple Business Connect",
  "Yelp",
  "Facebook Page",
  "Nextdoor Business",
  "BBB (free listing)",
  "Alignable",
  "Local Chamber of Commerce",
] as const;

export const NICHE_DIRECTORIES: Record<string, string[]> = {
  home_services: ["Angi (free profile)", "Thumbtack (free profile)", "HomeAdvisor", "Porch", "Houzz"],
  auto: ["CarTalk Mechanics Files", "Thumbtack (free profile)"],
  health: ["Healthgrades", "Zocdoc"],
  legal: ["Avvo", "Justia"],
  food: ["TripAdvisor", "OpenTable"],
};

export function directoriesFor(niche: string | null | undefined): string[] {
  const n = (niche ?? "").toLowerCase();
  const key =
    /hvac|plumb|roof|clean|landscap|electric|contract|paint|pest|handyman|remodel/.test(n)
      ? "home_services"
      : /detail|auto|car|mechanic|tow/.test(n)
        ? "auto"
        : /dent|chiro|clinic|therap|doctor|med/.test(n)
          ? "health"
          : /law|attorney|legal/.test(n)
            ? "legal"
            : /restaurant|cafe|food|bakery|bar/.test(n)
              ? "food"
              : null;
  return [...CORE_DIRECTORIES, ...(key ? NICHE_DIRECTORIES[key] ?? [] : [])];
}

export const PARTNER_TYPES: Record<string, string[]> = {
  detail: ["car dealer", "auto body shop", "car wash"],
  hvac: ["real estate agency", "home inspector", "property management"],
  plumb: ["real estate agency", "home inspector", "property management"],
  roof: ["real estate agency", "insurance agency", "home inspector"],
  clean: ["property management", "real estate agency", "moving company"],
  landscap: ["real estate agency", "property management", "pool contractor"],
};

export function partnerTypesFor(niche: string | null | undefined): string[] {
  const n = (niche ?? "").toLowerCase();
  for (const [k, v] of Object.entries(PARTNER_TYPES)) if (n.includes(k)) return v;
  return ["real estate agency", "chamber of commerce", "complementary local service"];
}

/** Simple relevance score for a forum post: needs both a niche and a location hit. */
export function postRelevance(text: string, niche: string, city: string): number {
  const t = text.toLowerCase();
  const nicheHit = niche
    .toLowerCase()
    .split(/\s+/)
    .some((w) => w.length > 3 && t.includes(w));
  const cityHit = city && t.includes(city.toLowerCase());
  const intent = /\b(recommend|need|looking for|anyone know|suggest|who do you use|best)\b/.test(t);
  return (nicheHit ? 40 : 0) + (cityHit ? 35 : 0) + (intent ? 25 : 0);
}

export const RELEVANCE_THRESHOLD = 75;
