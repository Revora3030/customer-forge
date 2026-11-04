/**
 * Live SPF / DKIM / DMARC check for a tenant domain over Cloudflare's 1.1.1.1
 * DNS-over-HTTPS JSON API. Uses the `cloudflare-dns.com` hostname because
 * Workers can't fetch bare IP addresses. Read-only: it only reads public DNS.
 */
import {
  COMMON_DKIM_SELECTORS,
  gradeDkim,
  gradeDmarc,
  gradeSpf,
  overallStatus,
  txtRecords,
  type AuthResult,
  type AuthStatus,
  type DohResponse,
} from "./email-auth-health";

export const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";

export type EmailAuthReport = {
  domain: string;
  status: AuthStatus;
  results: AuthResult[];
  checkedAt: string;
};

type Deps = { fetchImpl?: typeof fetch; now?: () => Date; selectors?: readonly string[] };

async function lookupTxt(name: string, fetchImpl: typeof fetch): Promise<string[]> {
  const res = await fetchImpl(`${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=TXT`, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`DNS lookup failed (${res.status})`);
  return txtRecords((await res.json()) as DohResponse);
}

function lookupFailed(check: AuthResult["check"]): AuthResult {
  return {
    check,
    status: "warn",
    record: null,
    summary: "We couldn't reach DNS to check this just now.",
    hints: ["Try the check again in a minute."],
  };
}

export async function checkEmailAuth(domain: string, deps: Deps = {}): Promise<EmailAuthReport> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const selectors = deps.selectors ?? COMMON_DKIM_SELECTORS;

  const [spf, dmarc, dkim] = await Promise.all([
    lookupTxt(domain, fetchImpl).then(
      (txts) => gradeSpf(domain, txts),
      () => lookupFailed("spf"),
    ),
    lookupTxt(`_dmarc.${domain}`, fetchImpl).then(
      (txts) => gradeDmarc(domain, txts),
      () => lookupFailed("dmarc"),
    ),
    Promise.all(
      selectors.map(async (selector) => ({
        selector,
        txts: await lookupTxt(`${selector}._domainkey.${domain}`, fetchImpl).catch(() => null),
      })),
    ).then((lookups) => {
      const answered = lookups.filter(
        (l): l is { selector: string; txts: string[] } => l.txts !== null,
      );
      return answered.length ? gradeDkim(domain, answered) : lookupFailed("dkim");
    }),
  ]);

  const results = [spf, dkim, dmarc];
  return {
    domain,
    status: overallStatus(results),
    results,
    checkedAt: (deps.now ?? (() => new Date()))().toISOString(),
  };
}
