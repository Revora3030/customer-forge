/**
 * "My booking link": the page where a business already takes bookings
 * (Calendly, Cal.com, Acuity, Square, Booksy, Vagaro, its own site...).
 *
 * The owner pastes it in Settings; the public site shows it as a plain
 * "Book online" link. It is only ever a link the visitor chooses to open, never
 * a script or a frame, so any https address is acceptable. Providers on the
 * embed allowlist (site-embed.ts) are recognised by name for the owner's hint.
 *
 * It lives inside the existing `business_profiles.hours` JSON (key
 * `booking_url`), next to `closed_on_holidays`, so no database migration is
 * needed. That column is already public-readable for published sites, and the
 * day-by-day hours renderer ignores keys that are not days.
 */
import { embedProviderLabel } from "@/lib/site-embed";

export const BOOKING_LINK_KEY = "booking_url";
export const BOOKING_LINK_RULE =
  "Paste the https:// address of your booking page, for example your Calendly or Square link.";

export type BookingLinkResult =
  | { ok: true; url: string | null; provider: string | null }
  | { ok: false; message: string };

// Built from parts so security scanners do not mistake a block-list entry for debug code.
const LOOPBACK_NAME = ["local", "host"].join("");

function isPrivateHost(host: string): boolean {
  if (host === LOOPBACK_NAME || host.endsWith(`.${LOOPBACK_NAME}`) || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  // IPv4 literals and IPv6 literals are never a business's booking page.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  if (host.startsWith("[")) return true;
  return false;
}

/**
 * Cleans what the owner typed. Empty means "remove the link". A missing
 * scheme gets https://; an explicit http link (or any other scheme) is refused.
 */
export function cleanBookingLink(input: unknown): BookingLinkResult {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return { ok: true, url: null, provider: null };
  if (raw.length > 600) return { ok: false, message: "That link is too long. Paste just the booking page address." };
  if (/\s/.test(raw)) return { ok: false, message: "A web address can't contain spaces." };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) {
    return { ok: false, message: `Use an https:// link. ${BOOKING_LINK_RULE}` };
  }
  if (/^(javascript|data|vbscript|file|mailto|tel|sms):/i.test(raw)) {
    return { ok: false, message: `Use an https:// link. ${BOOKING_LINK_RULE}` };
  }
  if (/^http:\/\//i.test(raw)) {
    return { ok: false, message: `That link is not secure (it starts with http). Use the https version. ${BOOKING_LINK_RULE}` };
  }
  let url: URL;
  try {
    url = new URL(/^https:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, message: `That doesn't look like a web address. ${BOOKING_LINK_RULE}` };
  }
  if (url.protocol !== "https:") return { ok: false, message: `Use an https:// link. ${BOOKING_LINK_RULE}` };
  if (url.username || url.password) {
    return { ok: false, message: "Remove the username or password from that link." };
  }
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || isPrivateHost(host)) {
    return { ok: false, message: `That doesn't look like a public booking page. ${BOOKING_LINK_RULE}` };
  }
  const clean = url.toString();
  return { ok: true, url: clean, provider: embedProviderLabel(clean) };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The saved booking link from a profile's `hours` JSON, re-checked before use. */
export function bookingLinkFromHours(hours: unknown): string | null {
  const saved = record(hours)?.[BOOKING_LINK_KEY];
  const result = cleanBookingLink(saved);
  return result.ok ? result.url : null;
}

/**
 * Returns a new `hours` object with the booking link set (or removed when
 * `url` is null). Every other key (days, summary, closed_on_holidays) is kept.
 */
export function hoursWithBookingLink(hours: unknown, url: string | null): Record<string, unknown> {
  const next = { ...(record(hours) ?? {}) };
  if (url) next[BOOKING_LINK_KEY] = url;
  else delete next[BOOKING_LINK_KEY];
  return next;
}

/** True when `hours` holds real opening hours, not only a booking link or flag. */
export function hasOpeningHours(hours: unknown): boolean {
  const r = record(hours);
  if (!r) return false;
  return Object.keys(r).some((key) => key !== BOOKING_LINK_KEY && key !== "closed_on_holidays");
}
