/**
 * Server-only probes for domains: DNS lookups (including MX), redirect
 * behaviour, and the crawl signals search engines rely on.
 *
 * Every result here is measured, never assumed — so the app can never tell a
 * client their domain is working when it isn't.
 */
import { canonicalHost, type EmailForwardProvider, type HostPreference } from "@/lib/domain-ops";
import { guardedFetch as sharedGuardedFetch } from "@/lib/net-guard.server";
import {
  detectDnsHost,
  findNameservers,
  normalizeNameserver,
  type DnsHostDetection,
} from "@/lib/dns-assistant";
import { createSoftRateLimiter } from "@/lib/soft-rate-limit.server";

type DnsAnswer = { name: string; type: number; data: string };

async function dnsQuery(
  name: string,
  type: "A" | "AAAA" | "CNAME" | "TXT" | "MX",
): Promise<DnsAnswer[]> {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    {
      headers: { accept: "application/dns-json" },
    },
  );
  if (!res.ok) throw new Error("DNS lookup failed");
  const json = (await res.json()) as { Answer?: DnsAnswer[] };
  return json.Answer ?? [];
}

export type HopResult = {
  url: string;
  status: number | null;
  location: string | null;
  ok: boolean;
  error: string | null;
};

/**
 * SSRF guard for every outbound probe: only public DNS names, resolving to
 * globally routable addresses, over http(s), are ever fetched. Redirects are
 * never followed automatically, so a public host can't bounce us inward, and
 * embedded credentials (`https://public.example@169.254.169.254/`) are refused.
 */
async function guardedFetch(url: string): Promise<Response> {
  return sharedGuardedFetch(url, { method: "GET" }, async (hostname) => {
    const [a, aaaa] = await Promise.all([
      dnsQuery(hostname, "A").catch(() => [] as DnsAnswer[]),
      dnsQuery(hostname, "AAAA").catch(() => [] as DnsAnswer[]),
    ]);
    return [
      ...a.filter((r) => r.type === 1).map((r) => r.data.trim()),
      ...aaaa.filter((r) => r.type === 28).map((r) => r.data.trim()),
    ];
  });
}

async function probe(url: string): Promise<HopResult> {
  try {
    const res = await guardedFetch(url);
    return {
      url,
      status: res.status,
      location: res.headers.get("location"),
      ok: res.status < 400,
      error: null,
    };
  } catch (error) {
    return {
      url,
      status: null,
      location: null,
      ok: false,
      error: error instanceof Error ? error.message : "No response",
    };
  }
}

/** Checks that http, www and the bare domain all end up on the canonical address. */
export async function checkRedirects(domain: string, preference: HostPreference) {
  const bare = domain.replace(/^www\./, "");
  const target = canonicalHost(domain, preference)!;
  const urls = [`http://${bare}/`, `https://${bare}/`, `https://www.${bare}/`];
  const hops = await Promise.all(urls.map(probe));

  const arrivesAtCanonical = (hop: HopResult) => {
    const host = hop.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (host === target && hop.url.startsWith("https://") && hop.ok) return true;
    if (!hop.location) return false;
    try {
      const dest = new URL(hop.location, hop.url);
      return dest.protocol === "https:" && dest.hostname === target;
    } catch {
      return false;
    }
  };

  const results = hops.map((hop) => ({ ...hop, canonical: arrivesAtCanonical(hop) }));
  const failing = results.filter((r) => !r.canonical);
  return {
    target,
    results,
    allCanonical: failing.length === 0,
    detail:
      failing.length === 0
        ? `Every version of your address ends up on https://${target}.`
        : `${failing.length} address ${failing.length === 1 ? "version doesn't" : "versions don't"} land on https://${target} yet. This usually resolves once DNS and the certificate finish.`,
  };
}

/** robots.txt, sitemap.xml and the canonical tag as a crawler would see them. */
export async function checkCrawlSignals(origin: string) {
  const [robots, sitemap, home] = await Promise.all([
    probe(`${origin}/robots.txt`),
    probe(`${origin}/sitemap.xml`),
    probe(`${origin}/`),
  ]);

  let robotsBlocksAll = false;
  let sitemapUrls = 0;
  let canonicalTag: string | null = null;

  try {
    if (robots.ok) {
      const text = await (await guardedFetch(`${origin}/robots.txt`)).text();
      robotsBlocksAll = /^\s*disallow:\s*\/\s*$/im.test(text) && !/allow:\s*\//i.test(text);
    }
  } catch {
    /* keep the measured default */
  }
  try {
    if (sitemap.ok) {
      const text = await (await guardedFetch(`${origin}/sitemap.xml`)).text();
      sitemapUrls = (text.match(/<loc>/g) ?? []).length;
    }
  } catch {
    /* keep the measured default */
  }
  try {
    if (home.ok) {
      const html = await (await guardedFetch(`${origin}/`)).text();
      canonicalTag =
        html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null;
    }
  } catch {
    /* keep the measured default */
  }

  return {
    robots: { reachable: robots.ok, status: robots.status, blocksEverything: robotsBlocksAll },
    sitemap: { reachable: sitemap.ok, status: sitemap.status, urls: sitemapUrls },
    home: { reachable: home.ok, status: home.status, canonical: canonicalTag },
  };
}

/** Full search-visibility report for a domain change. */
export async function domainSeoReport(domain: string, preference: HostPreference) {
  const target = canonicalHost(domain, preference)!;
  const origin = `https://${target}`;
  const [redirects, crawl] = await Promise.all([
    checkRedirects(domain, preference),
    checkCrawlSignals(origin),
  ]);

  const canonicalMatches = crawl.home.canonical
    ? crawl.home.canonical
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "")
        .startsWith(target)
    : false;

  const issues: { label: string; fix: string }[] = [];
  if (!redirects.allCanonical)
    issues.push({
      label: "Not every address version redirects to the canonical one",
      fix: "Wait for DNS and the certificate to finish, then re-run this report.",
    });
  if (!crawl.home.reachable)
    issues.push({
      label: "The homepage didn't answer on your domain",
      fix: "Publish the website, then re-run the report.",
    });
  if (crawl.robots.blocksEverything)
    issues.push({
      label: "robots.txt blocks all crawlers",
      fix: "Allow crawling so Google can index the site.",
    });
  if (!crawl.sitemap.reachable || crawl.sitemap.urls === 0)
    issues.push({
      label: "No sitemap found on your domain",
      fix: "Publish the site so /sitemap.xml is served.",
    });
  if (!canonicalMatches)
    issues.push({
      label: "The canonical tag doesn't point at your domain yet",
      fix: "Publish after connecting the domain so pages declare the new address.",
    });

  return {
    domain,
    canonicalOrigin: origin,
    redirects,
    crawl,
    canonicalMatches,
    issues,
    checkedAt: new Date().toISOString(),
  };
}

/** Verifies branded email forwarding really is set up in DNS. */
export async function checkEmailForwardingDns(domain: string, provider: EmailForwardProvider) {
  const bare = domain.replace(/^www\./, "");
  const expectedMx = provider === "forwardemail" ? "forwardemail.net" : "improvmx.com";
  const [mx, txt] = await Promise.all([
    dnsQuery(bare, "MX").catch(() => [] as DnsAnswer[]),
    dnsQuery(bare, "TXT").catch(() => [] as DnsAnswer[]),
  ]);

  const mxHosts = mx
    .filter((r) => r.type === 15)
    .map((r) =>
      r.data
        .replace(/^\d+\s+/, "")
        .replace(/\.$/, "")
        .toLowerCase(),
    );
  const txtValues = txt
    .filter((r) => r.type === 16)
    .map((r) => r.data.replace(/"/g, "").trim().toLowerCase());

  const mxOk = mxHosts.some((host) => host.endsWith(expectedMx));
  const spfOk =
    provider === "forwardemail"
      ? txtValues.some((v) => v.startsWith("forward-email="))
      : txtValues.some((v) => v.includes("spf.improvmx.com"));

  return {
    mxOk,
    spfOk,
    mxHosts,
    detail: mxOk
      ? spfOk
        ? "Mail records are live. Send yourself a test message to confirm delivery."
        : "Mail is routing, but the sending record is missing — replies may land in spam until you add the TXT record."
      : mxHosts.length
        ? `Your domain currently sends mail to ${mxHosts.slice(0, 2).join(", ")}. Replace those MX records with the ones below.`
        : "No mail records found yet. Add the MX records below at your registrar.",
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Public NS answers through free, keyless DNS-over-HTTPS: Cloudflare first,
 * Google's resolver as the fallback. A name with no NS records is an empty
 * list; only a resolver that cannot answer at all throws.
 */
async function nsQuery(name: string): Promise<string[]> {
  const urls = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=NS`,
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=NS`,
  ];
  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(4_000),
      });
      if (!res.ok) throw new Error("DNS lookup failed");
      const json = (await res.json()) as { Answer?: DnsAnswer[] };
      return (json.Answer ?? [])
        .filter((r) => r.type === 2)
        .map((r) => normalizeNameserver(r.data));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("DNS lookup failed");
}

/**
 * Likely DNS host for a saved domain, from public NS records only. Any lookup
 * failure is reported as "we can't tell", never as a guess.
 */
export async function detectDomainDnsHost(domain: string): Promise<DnsHostDetection> {
  try {
    return detectDnsHost(await findNameservers(domain, nsQuery));
  } catch {
    return { state: "unknown", reason: "no-nameservers", nameservers: [] };
  }
}

/**
 * Soft per-isolate server limits, keyed by signed-in user + workspace, so a
 * browser tab (or a script) can't turn the live check into a DNS hammer. The
 * page polls every 10 s at most (6/min); these leave room for manual checks.
 */
export const domainLiveCheckLimiter = createSoftRateLimiter({ limit: 12, windowMs: 60_000 });
export const dnsHostLookupLimiter = createSoftRateLimiter({ limit: 6, windowMs: 60_000 });
export const RATE_LIMITED_MESSAGE =
  "Checking too often — wait a few seconds and try again.";
