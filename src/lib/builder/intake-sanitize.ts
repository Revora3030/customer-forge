/**
 * Intake hygiene for business facts that reach a customer website.
 *
 * Two kinds of contamination have reached live customer data:
 *  1. Platform UI wording ("Build my site", "All", "Submit") saved as a
 *     business service, then rendered as a real service on the site.
 *  2. Revora's own contact address (hello@revoragrowthsystems.com) saved as a
 *     customer's business email, so the customer's site advertised Revora.
 *
 * These helpers never invent replacement facts. A rejected service is dropped
 * and a rejected email becomes "not supplied", so the site simply omits it.
 */
import { PLATFORM_OWNER_ORG_ID } from "@/lib/platform-owner";

/**
 * Labels from Revora's own interface (command center buttons, wizard actions,
 * filter chips). Compared case-insensitively after whitespace/punctuation
 * normalisation. A real business service is never exactly one of these.
 */
export const PLATFORM_UI_LABELS: readonly string[] = [
  "all",
  "any",
  "none",
  "other",
  "n/a",
  "na",
  "build my site",
  "build site",
  "build my website",
  "generate site",
  "generate my site",
  "generate website",
  "rebuild site",
  "publish my site",
  "publish site",
  "apply this improvement",
  "improve my search preview",
  "command center",
  "growth command center",
  "submit",
  "save",
  "continue",
  "next",
  "back",
  "cancel",
  "click here",
  "get started",
  "start",
  "service",
  "services",
  "my service",
  "service 1",
  "service name",
  "add service",
  "new service",
];

const LABELS = new Set(PLATFORM_UI_LABELS);

function normaliseLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a service name is platform/UI wording rather than a real business service. */
export function isPlatformLabel(name: unknown): boolean {
  if (typeof name !== "string") return true;
  const normalised = normaliseLabel(name);
  if (!normalised) return true;
  return LABELS.has(normalised);
}

/**
 * Keeps only real services. Drops empty names, platform UI wording and exact
 * duplicates (case-insensitive). Order is preserved; nothing is invented.
 */
export function sanitizeServices<T extends { name?: unknown }>(services: readonly T[]): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const service of services) {
    const name = typeof service?.name === "string" ? service.name.trim() : "";
    if (!name || isPlatformLabel(name)) continue;
    const key = normaliseLabel(name);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(service);
  }
  return kept;
}

/** Domains that belong to the Revora platform itself, never to a customer business. */
export const PLATFORM_EMAIL_DOMAINS: readonly string[] = ["revoragrowthsystems.com", "revoraweb.site"];

/** True when an address belongs to the Revora platform rather than a customer business. */
export function isPlatformEmail(email: unknown): boolean {
  if (typeof email !== "string") return false;
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.trim().toLowerCase().slice(at + 1);
  return PLATFORM_EMAIL_DOMAINS.some((platform) => domain === platform || domain.endsWith(`.${platform}`));
}

/**
 * The business email a customer site may show. A Revora platform address is
 * only allowed on Revora's own internal workspace; for any other tenant it is
 * treated as "not supplied" so the site never advertises Revora's inbox.
 */
export function customerBusinessEmail(email: unknown, organizationId: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim();
  if (!trimmed) return null;
  if (isPlatformEmail(trimmed) && organizationId !== PLATFORM_OWNER_ORG_ID) return null;
  return trimmed;
}
