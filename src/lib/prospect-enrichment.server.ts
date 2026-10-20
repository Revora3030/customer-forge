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

/** Default and ceiling for one reverifyLegacyDemos call (each one is a do-not-contact read plus an MX lookup). */
export const LEGACY_REVERIFY_DEFAULT_LIMIT = 5;
export const LEGACY_REVERIFY_MAX_LIMIT = 25;
/** Demo rows scanned per call to find `limit` candidates; most autopilot demos already carry a record. */
const LEGACY_SCAN_ROWS = 200;

export type LegacyReverifyResult = {
  /** Candidates verified this call (at most `limit`). */
  checked: number;
  /** Records written onto the demo marker (a concurrent writer can win the guard). */
  written: number;
  results: Array<{ organizationId: string; status: ProspectEnrichment["status"]; reason: string; written: boolean }>;
};

const ORG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Row = Record<string, unknown>;

const demoMarker = (generation: unknown): Row | null => {
  const marker = (generation as Row | null)?.["prospectDemo"];
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) return null;
  return (marker as Row)["kind"] === "prospect_demo" ? (marker as Row) : null;
};

/** No enrichment key at all: anything stored there (even unreadable) counts as a record and is never redone. */
const lacksEnrichment = (marker: Row) => marker["enrichment"] === undefined || marker["enrichment"] === null;

/**
 * Backfill for autopilot demos built before enrichment existed: they have no
 * verification record on website_settings.generation.prospectDemo, so the
 * verified-email gate never lets autopilot email them.
 *
 * For at most `limit` such demos (unclaimed, autopilot-made, no record, with a
 * business_profiles email) the stored address is verified with
 * verifyProspectEmail (syntax, role/system mailbox, do-not-contact, MX) and the
 * result is written onto that tenant's demo marker with source
 * "legacy_profile". The address is the one already stored for the business;
 * nothing is looked up or guessed. Every outcome (verified, unverified,
 * rejected) is written, so a demo is checked once; the write is scoped to the
 * organization and only lands while the marker still has no record.
 */
export async function reverifyLegacyDemos(
  db: SupabaseClient,
  options: EnrichmentDeps & { limit?: number } = {},
): Promise<LegacyReverifyResult> {
  const now = options.now ?? (() => new Date());
  const limit = Math.max(0, Math.min(Math.floor(options.limit ?? LEGACY_REVERIFY_DEFAULT_LIMIT), LEGACY_REVERIFY_MAX_LIMIT));
  const result: LegacyReverifyResult = { checked: 0, written: 0, results: [] };
  if (!limit) return result;

  const { data, error } = await db
    .from("website_settings")
    .select("organization_id, generation")
    .not("generation->prospectDemo", "is", null)
    .eq("generation->prospectDemo->>source", "autopilot")
    .is("generation->prospectDemo->enrichment", null)
    .order("created_at", { ascending: true })
    .limit(LEGACY_SCAN_ROWS);
  if (error) throw new Error(`Couldn't read demos to re-verify: ${error.message}`);
  const candidates: string[] = [];
  for (const row of (data ?? []) as Row[]) {
    const organizationId = String(row["organization_id"] ?? "");
    const marker = demoMarker(row["generation"]);
    if (!ORG_ID.test(organizationId) || !marker || marker["source"] !== "autopilot" || !lacksEnrichment(marker)) continue;
    // A claimed demo is a customer now; it is never outreached.
    if (typeof marker["claimedAt"] === "string" && marker["claimedAt"]) continue;
    candidates.push(organizationId);
  }
  if (!candidates.length) return result;

  const profiles = await db.from("business_profiles").select("organization_id, email").in("organization_id", candidates).not("email", "is", null);
  if (profiles.error) throw new Error(`Couldn't read demo emails: ${profiles.error.message}`);
  const emailByOrg = new Map<string, string>();
  for (const row of (profiles.data ?? []) as Row[]) {
    const email = typeof row["email"] === "string" ? row["email"].trim().toLowerCase() : "";
    if (email) emailByOrg.set(String(row["organization_id"]), email);
  }

  for (const organizationId of candidates) {
    if (result.checked >= limit) break;
    const email = emailByOrg.get(organizationId);
    if (!email) continue;
    result.checked += 1;
    const verification = await verifyProspectEmail(db, email, options);
    const enrichment: ProspectEnrichment = {
      status: verification.status,
      email,
      source: "legacy_profile",
      sourceUrl: null,
      reason: verification.reason,
      checkedAt: now().toISOString(),
    };
    // One atomic jsonb_set of just the enrichment key, only while the demo is
    // still unclaimed and unrecorded: a claim or builder write made during the
    // MX lookup is never overwritten. Without the function, nothing is written.
    const { data: updated, error: writeError } = await db.rpc("set_prospect_demo_enrichment", {
      p_organization_id: organizationId,
      p_enrichment: enrichment,
    });
    if (writeError) {
      if (/set_prospect_demo_enrichment|PGRST202|42883/.test(`${writeError.message} ${(writeError as { code?: string }).code ?? ""}`)) {
        console.warn("[prospect-enrichment] set_prospect_demo_enrichment is not deployed yet; legacy re-verify writes skipped");
        return result;
      }
      throw new Error(`Couldn't store the re-verification: ${writeError.message}`);
    }
    const written = Array.isArray(updated) && updated.length > 0;
    if (written) result.written += 1;
    result.results.push({ organizationId, status: enrichment.status, reason: enrichment.reason, written });
  }
  return result;
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
