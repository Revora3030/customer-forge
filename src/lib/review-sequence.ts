/**
 * Post-job review sequence with private feedback routing (pure helpers).
 *
 * When a booking is marked completed and the owner has switched the sequence
 * on (business_profiles.review_sequence_enabled) with a review link saved
 * (their Google Place ID, turned into the free writereview link by the review
 * kit), the customer gets an email 1 hour later and a reminder on day 3. Both
 * carry one private link, /feedback/<token>, where they tap a star rating:
 *
 *   4–5 stars → straight on to the public Google review page;
 *   1–3 stars → a private note to the owner first.
 *
 * Google's review policy forbids "selectively soliciting positive reviews",
 * so the public review link stays on the page for every rating: unhappy
 * customers are offered the private route first, never kept from posting.
 */

export const REVIEW_SEQUENCE_TRIGGER = "review_request";
export const REVIEW_SEQUENCE_STEPS = [
  { key: "ask", delayMinutes: 60 },
  { key: "reminder", delayMinutes: 3 * 24 * 60 },
] as const;

/** Ratings at or above this go straight to the public review page. */
export const PUBLIC_REVIEW_MIN_RATING = 4;
export const FEEDBACK_MAX_LENGTH = 2000;

const SITE = "https://revoragrowthsystems.com";
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

export const isFeedbackToken = (value: unknown): value is string => typeof value === "string" && TOKEN.test(value);

/** 32-character unguessable token (24 random bytes, base64url). */
export function newFeedbackToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const feedbackUrl = (token: string) => `${SITE}/feedback/${token}`;

/** The feedback link inside a queued run's body, if it has one. */
export function feedbackUrlFromBody(body: string | null | undefined): string | null {
  const match = String(body ?? "").match(/https:\/\/revoragrowthsystems\.com\/feedback\/([A-Za-z0-9_-]{32,64})(?![A-Za-z0-9_-])/);
  return match ? feedbackUrl(match[1]!) : null;
}

export function parseRating(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.trim()) : typeof value === "number" ? value : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

export const routeForRating = (rating: number): "google" | "private" =>
  rating >= PUBLIC_REVIEW_MIN_RATING ? "google" : "private";

/** Trims, strips control characters and caps the private note. Empty → null. */
export function cleanFeedback(value: unknown): string | null {
  const text = String(value ?? "")
    // eslint-disable-next-line no-control-regex -- strip control characters except newline/tab
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .trim()
    .slice(0, FEEDBACK_MAX_LENGTH);
  return text || null;
}

/** The only https link a feedback page may send someone on to. */
export function safeReviewUrl(link: string | null | undefined): string | null {
  const raw = String(link ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export function reviewSequenceMessages(input: { customerName: string; businessName: string | null | undefined; url: string }) {
  const first = input.customerName.trim().split(/\s+/)[0] || "there";
  const business = input.businessName?.trim() || "our team";
  return [
    {
      ...REVIEW_SEQUENCE_STEPS[0],
      subject: `How did we do, ${first}?`,
      body: `Hi ${first}, thanks for choosing ${business}. How did we do? Tap a star to rate your visit. It takes 10 seconds.\n\n${input.url}`,
    },
    {
      ...REVIEW_SEQUENCE_STEPS[1],
      subject: `A quick favour, ${first}?`,
      body: `Hi ${first}, if you have a moment, we'd love to hear how your visit with ${business} went. One tap is all it takes.\n\n${input.url}`,
    },
  ];
}
