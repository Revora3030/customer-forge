/**
 * Prospect email enrichment contract (pure; the network steps live in
 * prospect-enrichment.server.ts).
 *
 * An address is only ever one the business published (a mailto link, visible
 * text or the meta tags of its listed page). It is never guessed from a
 * pattern like info@domain. Autopilot emails a demo only when its address is
 * `verified`: valid syntax, not a role/system mailbox, its domain accepts mail
 * (MX), and it is not on the do-not-contact list.
 */
import { isPlatformEmailDomain } from "./prospect-email";

export type EnrichmentStatus = "verified" | "unverified" | "rejected" | "none";
/** Where the address came from. "legacy_profile": the business_profiles email of a demo built before enrichment existed (backfilled by reverifyLegacyDemos). */
export type EnrichmentSource = "public_page" | "social_meta" | "legacy_profile" | "public_listing";

export type ProspectEnrichment = {
  status: EnrichmentStatus;
  email: string | null;
  source: EnrichmentSource | null;
  sourceUrl: string | null;
  /** Why it is not verified (or "ok"). */
  reason: string;
  checkedAt: string;
};

export type EmailVerification = { status: "verified" | "unverified" | "rejected"; reason: string };

export const MAX_EMAIL_LENGTH = 160;

/** Strict enough to refuse anything a mail provider would bounce on shape alone. */
export function isValidEmailSyntax(value: string): boolean {
  const email = value.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH) return false;
  const at = email.lastIndexOf("@");
  if (at < 1 || at !== email.indexOf("@")) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (!/^[a-z0-9._%+-]+$/.test(local)) return false;
  if (domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(domain)) return false;
  return true;
}

/** System and role mailboxes that never reach the owner, or must never get marketing. */
const ROLE_JUNK_LOCAL =
  /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer[-_.]?daemon|postmaster|hostmaster|webmaster|abuse|privacy|security|legal|compliance|dmca|unsubscribe|bounces?|root|spam|test|example|nobody|null|devnull|notifications?|alerts?|support)$/i;

export function isRoleJunkAddress(value: string): boolean {
  const email = value.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return true;
  const local = email.slice(0, at).replace(/\+.*$/, "");
  return ROLE_JUNK_LOCAL.test(local) || isPlatformEmailDomain(email.slice(at + 1));
}

/**
 * Reads a DNS-over-HTTPS JSON answer (Cloudflare or Google) for an MX query.
 * "yes" when a real mail exchanger is listed, "no" for NXDOMAIN, no MX or a
 * null MX (RFC 7505 "0 ."), "unknown" for anything else (try again later).
 */
export function parseMxAnswer(json: unknown): "yes" | "no" | "unknown" {
  if (!json || typeof json !== "object") return "unknown";
  const body = json as { Status?: unknown; Answer?: unknown };
  if (body.Status === 3) return "no";
  if (body.Status !== 0) return "unknown";
  const answers = Array.isArray(body.Answer) ? (body.Answer as { type?: unknown; data?: unknown }[]) : [];
  const exchanges = answers
    .filter((answer) => answer?.type === 15 && typeof answer.data === "string")
    .map((answer) => String(answer.data).trim().split(/\s+/).pop() ?? "")
    .filter((host) => host && host !== ".");
  return exchanges.length ? "yes" : "no";
}

const STATUSES = new Set<EnrichmentStatus>(["verified", "unverified", "rejected", "none"]);
const SOURCES = new Set<EnrichmentSource>(["public_page", "social_meta", "legacy_profile", "public_listing"]);

/** Reads the enrichment stored on a demo marker; anything unreadable is null. */
export function readProspectEnrichment(value: unknown): ProspectEnrichment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const status = raw["status"];
  if (typeof status !== "string" || !STATUSES.has(status as EnrichmentStatus)) return null;
  const source = typeof raw["source"] === "string" && SOURCES.has(raw["source"] as EnrichmentSource) ? (raw["source"] as EnrichmentSource) : null;
  return {
    status: status as EnrichmentStatus,
    email: typeof raw["email"] === "string" ? raw["email"].trim().toLowerCase() : null,
    source,
    sourceUrl: typeof raw["sourceUrl"] === "string" ? raw["sourceUrl"] : null,
    reason: typeof raw["reason"] === "string" ? raw["reason"] : "",
    checkedAt: typeof raw["checkedAt"] === "string" ? raw["checkedAt"] : "",
  };
}

/**
 * The verified-email gate: autopilot may email `to` only when the stored
 * enrichment verified that exact published address.
 */
export function emailVerifiedFor(enrichment: ProspectEnrichment | null, to: string | null | undefined): boolean {
  if (!enrichment || enrichment.status !== "verified" || !enrichment.email || !enrichment.source) return false;
  return Boolean(to) && enrichment.email === String(to).trim().toLowerCase();
}

export const noEnrichment = (reason: string, now: Date): ProspectEnrichment => ({
  status: "none",
  email: null,
  source: null,
  sourceUrl: null,
  reason,
  checkedAt: now.toISOString(),
});
