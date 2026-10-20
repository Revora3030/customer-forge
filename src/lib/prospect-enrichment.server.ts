import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isRoleJunkAddress,
  isValidEmailSyntax,
  noEnrichment,
  parseMxAnswer,
  type EmailVerification,
  type ProspectEnrichment,
} from "@/lib/prospect-enrichment";

/**
 * Free-only prospect email enrichment.
 *
 * In order: the Places listing's own link (a social or directory page; a
 * business with a real website is never a prospect) → the SSRF-guarded public
 * email lookup on that page (mailto, visible text, then the profile's meta
 * tags) → verification: syntax, not a role/system mailbox, the domain accepts
 * mail (MX over DNS-over-HTTPS, bounded by a timeout) and not do-not-contact.
 * Addresses are never guessed.
 */

export const DNS_TIMEOUT_MS = 3_000;

/** Fixed public resolvers; the queried name is data, never a fetched host. */
const DOH_ENDPOINTS = [
  (domain: string) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
  (domain: string) => `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
];

export type EnrichmentDeps = {
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
};

/** Does the domain list a mail exchanger? "unknown" when neither resolver answered. */
export async function mxStatus(domain: string, deps: EnrichmentDeps = {}): Promise<"yes" | "no" | "unknown"> {
  const fetcher = deps.fetch ?? fetch;
  for (const endpoint of DOH_ENDPOINTS) {
    try {
      const response = await fetcher(endpoint(domain), {
        headers: { accept: "application/dns-json" },
        redirect: "manual",
        signal: AbortSignal.timeout(deps.timeoutMs ?? DNS_TIMEOUT_MS),
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        continue;
      }
      const answer = parseMxAnswer(await response.json());
      if (answer !== "unknown") return answer;
    } catch {
      // Resolver slow or unreachable: try the next one.
    }
  }
  return "unknown";
}

/** Verifies one published address. DNS trouble is "unverified" (retry later), never "verified". */
export async function verifyProspectEmail(db: SupabaseClient, value: string, deps: EnrichmentDeps = {}): Promise<EmailVerification> {
  const email = value.trim().toLowerCase();
  if (!isValidEmailSyntax(email)) return { status: "rejected", reason: "invalid_syntax" };
  if (isRoleJunkAddress(email)) return { status: "rejected", reason: "role_address" };
  const { isDoNotContact } = await import("@/lib/prospect-outreach.server");
  if (await isDoNotContact(db, email)) return { status: "rejected", reason: "do_not_contact" };
  const mx = await mxStatus(email.slice(email.lastIndexOf("@") + 1), deps);
  if (mx === "no") return { status: "rejected", reason: "no_mx" };
  if (mx === "unknown") return { status: "unverified", reason: "dns_unavailable" };
  return { status: "verified", reason: "ok" };
}

/** Finds and verifies the email a prospect published on its listed page. */
export async function enrichProspectEmail(
  db: SupabaseClient,
  listingUrl: string | null,
  deps: EnrichmentDeps = {},
): Promise<ProspectEnrichment> {
  const now = deps.now ?? (() => new Date());
  if (!listingUrl) return noEnrichment("no_listing_link", now());
  const { lookupPublicEmail } = await import("@/lib/prospect-email.server");
  const hit = await lookupPublicEmail(listingUrl).catch(() => null);
  if (!hit) return noEnrichment("no_published_email", now());
  const verification = await verifyProspectEmail(db, hit.email, deps);
  return {
    status: verification.status,
    email: hit.email,
    source: hit.source,
    sourceUrl: hit.url.slice(0, 300),
    reason: verification.reason,
    checkedAt: now().toISOString(),
  };
}
