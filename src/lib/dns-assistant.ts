/**
 * DNS assistant (B12-11): pure, browser-safe helpers.
 *
 * - detect where a domain's DNS is hosted from its public NS records, and say
 *   "we can't tell" whenever the evidence is missing, mixed or unrecognised;
 * - map a real domain check to one of four honest states (never "live" early);
 * - decide when the Domain page may poll again (visible tab, back-off, cap).
 */
import { REGISTRAR_GUIDES } from "@/lib/domain-setup";

export type NsRule = {
  /** REGISTRAR_GUIDES id the owner is shown the exact A/CNAME steps for. */
  guideId: string;
  /** Name server suffixes (label boundary match) that unambiguously identify the DNS host. */
  suffixes: readonly string[];
};

/**
 * Only suffixes that identify exactly one provider. Google Domains' default
 * `ns-cloud-*.googledomains.com` is deliberately absent: Google Cloud DNS
 * customers use the same names, so matching it would be a guess.
 */
export const NS_RULES: readonly NsRule[] = [
  { guideId: "godaddy", suffixes: ["domaincontrol.com"] },
  { guideId: "namecheap", suffixes: ["registrar-servers.com"] },
  { guideId: "cloudflare", suffixes: ["ns.cloudflare.com"] },
  { guideId: "squarespace", suffixes: ["squarespacedns.com"] },
  { guideId: "porkbun", suffixes: ["ns.porkbun.com"] },
  { guideId: "wix", suffixes: ["wixdns.net"] },
];

export const CANT_TELL_MESSAGE =
  "We can't tell where your DNS is hosted. Pick the company you bought the domain from below.";

export type DnsHostDetection =
  | { state: "detected"; guideId: string; name: string; nameservers: string[] }
  | { state: "unknown"; reason: "no-nameservers" | "unrecognised" | "mixed"; nameservers: string[] };

export function normalizeNameserver(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function matchesSuffix(host: string, suffix: string) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

/** Which known DNS host owns every one of these name servers; "unknown" otherwise. */
export function detectDnsHost(rawNameservers: readonly string[]): DnsHostDetection {
  const nameservers = [...new Set(rawNameservers.map(normalizeNameserver).filter(Boolean))].sort();
  if (!nameservers.length) return { state: "unknown", reason: "no-nameservers", nameservers };
  const ids = new Set<string | null>(
    nameservers.map(
      (host) =>
        NS_RULES.find((rule) => rule.suffixes.some((s) => matchesSuffix(host, s)))?.guideId ?? null,
    ),
  );
  if (ids.size > 1) return { state: "unknown", reason: "mixed", nameservers };
  const [only] = [...ids];
  if (!only) return { state: "unknown", reason: "unrecognised", nameservers };
  const guide = REGISTRAR_GUIDES.find((g) => g.id === only);
  if (!guide) return { state: "unknown", reason: "unrecognised", nameservers };
  return { state: "detected", guideId: guide.id, name: guide.name, nameservers };
}

/** The host names whose NS set could answer for `domain`, most specific first, never a bare TLD. */
export function nsCandidates(domain: string): string[] {
  const labels = domain
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .split(".")
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i <= labels.length - 2; i += 1) out.push(labels.slice(i).join("."));
  return out;
}

export type NsQuery = (name: string) => Promise<string[]>;

/** Walks up from the saved host to the first name that publishes NS records. */
export async function findNameservers(domain: string, query: NsQuery): Promise<string[]> {
  for (const name of nsCandidates(domain)) {
    const answers = await query(name);
    if (answers.length) return answers;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Live status
// ---------------------------------------------------------------------------

export type DnsLiveState = "waiting_dns" | "dns_found" | "certificate_pending" | "live";

export const DNS_LIVE_STATES: Record<
  DnsLiveState,
  { label: string; tone: "attention" | "info" | "signal"; help: string }
> = {
  waiting_dns: {
    label: "Waiting for DNS",
    tone: "attention",
    help: "Your domain doesn't point at your website yet. Changes can take up to 48 hours to spread.",
  },
  dns_found: {
    label: "DNS found",
    tone: "info",
    help: "Your domain points here and HTTPS answers, but your website isn't being served on it yet. Publish your website, then check again.",
  },
  certificate_pending: {
    label: "Certificate pending",
    tone: "info",
    help: "Your domain points here. HTTPS isn't answering yet while the security certificate is issued — usually within a few hours.",
  },
  live: {
    label: "Live",
    tone: "signal",
    help: "Your domain points here and serves your website over HTTPS.",
  },
};

export type DomainCheckEvidence = {
  status?: string | null | undefined;
  dnsOk?: boolean | null | undefined;
  sslOk?: boolean | null | undefined;
  /** website_settings.domain_records from the real lookup. */
  records?: unknown;
};

/**
 * One saved/returned domain check -> one state. "live" needs the check itself
 * to have said so (status ssl_active with DNS and HTTPS both proven); anything
 * unknown is treated as the less-advanced state, never the more-advanced one.
 * Returns null when there is no check to read.
 */
export function mapDnsLiveState(check: DomainCheckEvidence | null | undefined): DnsLiveState | null {
  if (!check || (check.status == null && check.dnsOk == null)) return null;
  if (check.status === "not_connected") return null;
  const dnsOk = check.dnsOk === true;
  const sslOk = check.sslOk === true;
  if (dnsOk && sslOk && check.status === "ssl_active") return "live";
  if (!dnsOk) return "waiting_dns";
  const httpsStatus =
    check.records && typeof check.records === "object"
      ? (check.records as Record<string, unknown>)["httpsStatus"]
      : null;
  // HTTPS answered with a real HTTP status but the site isn't being served there.
  if (typeof httpsStatus === "number") return "dns_found";
  return "certificate_pending";
}

// ---------------------------------------------------------------------------
// Polling policy
// ---------------------------------------------------------------------------

export const POLL_MAX_ATTEMPTS = 30;
export const POLL_MAX_CONSECUTIVE_ERRORS = 3;

/** Delay before poll number `attempt` (0-based): 10 s, then slowing down. */
export function pollDelayMs(attempt: number): number {
  if (attempt < 6) return 10_000;
  if (attempt < 12) return 20_000;
  if (attempt < 18) return 30_000;
  return 60_000;
}

export type PollContext = {
  tabVisible: boolean;
  state: DnsLiveState | null;
  attempts: number;
  consecutiveErrors: number;
  domainConnected: boolean;
};

export type PollStopReason = "live" | "cap" | "errors" | "no-domain";

/** Why polling must stop for good (until the owner restarts it); null = keep going. */
export function pollStopReason(ctx: PollContext): PollStopReason | null {
  if (!ctx.domainConnected) return "no-domain";
  if (ctx.state === "live") return "live";
  if (ctx.attempts >= POLL_MAX_ATTEMPTS) return "cap";
  if (ctx.consecutiveErrors >= POLL_MAX_CONSECUTIVE_ERRORS) return "errors";
  return null;
}

/** Poll only while the tab is visible and there is no reason to stop. */
export function shouldPollNow(ctx: PollContext): boolean {
  return ctx.tabVisible && pollStopReason(ctx) === null;
}

/** An error back-off: doubles the normal delay per consecutive failure, up to 2 minutes. */
export function nextPollDelayMs(attempt: number, consecutiveErrors: number): number {
  const base = pollDelayMs(attempt);
  return Math.min(base * 2 ** consecutiveErrors, 120_000);
}
