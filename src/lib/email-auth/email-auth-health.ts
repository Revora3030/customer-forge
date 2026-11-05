/**
 * Pure parsers that grade a domain's email authentication (SPF, DKIM, DMARC)
 * from DNS TXT records into pass / warn / fail with plain-language fix hints.
 *
 * Input is what Cloudflare's DoH JSON API returns (see email-auth-health.server.ts);
 * nothing here does I/O, so every rule is unit-tested against fixtures.
 */

export type AuthStatus = "pass" | "warn" | "fail";
export type AuthCheck = "spf" | "dkim" | "dmarc";

export type AuthResult = {
  check: AuthCheck;
  status: AuthStatus;
  /** The record we graded (joined TXT strings), when there is exactly one. */
  record: string | null;
  summary: string;
  hints: string[];
};

export type DohAnswer = { name: string; type: number; TTL?: number; data: string };
export type DohResponse = { Status: number; Answer?: DohAnswer[] };

const TXT = 16;
/** RFC 7208 §4.6.4: more than 10 DNS-querying terms is a permanent error. */
export const SPF_LOOKUP_LIMIT = 10;

/** Common DKIM selectors by provider (Google, Microsoft 365, Resend, SendGrid, Mailchimp, Zoho, Fastmail, Proton, generic). */
export const COMMON_DKIM_SELECTORS = [
  "google",
  "selector1",
  "selector2",
  "resend",
  "s1",
  "s2",
  "k1",
  "zmail",
  "fm1",
  "protonmail",
  "default",
  "mail",
] as const;

/**
 * DoH returns TXT data as one or more quoted character-strings
 * (`"v=spf1 include:a" " -all"`); a record is their concatenation.
 */
export function unquoteTxt(data: string): string {
  const parts = [...data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
    (m[1] ?? "").replace(/\\(.)/g, "$1"),
  );
  return parts.length ? parts.join("") : data.trim();
}

/** TXT records from a DoH response. NXDOMAIN (Status 3) is "no records", not an error. */
export function txtRecords(response: DohResponse): string[] {
  if (response.Status !== 0 && response.Status !== 3) {
    throw new Error(`DNS lookup failed (rcode ${response.Status})`);
  }
  return (response.Answer ?? []).filter((a) => a.type === TXT).map((a) => unquoteTxt(a.data));
}

const worst = (a: AuthStatus, b: AuthStatus): AuthStatus =>
  a === "fail" || b === "fail" ? "fail" : a === "warn" || b === "warn" ? "warn" : "pass";

export function overallStatus(results: AuthResult[]): AuthStatus {
  return results.reduce<AuthStatus>((acc, r) => worst(acc, r.status), "pass");
}

// ---------------------------------------------------------------- SPF

export function gradeSpf(domain: string, txts: string[]): AuthResult {
  const spf = txts.filter((t) => /^v=spf1(\s|$)/i.test(t.trim()));
  const base = { check: "spf" as const };
  if (spf.length === 0) {
    return {
      ...base,
      status: "fail",
      record: null,
      summary: "No SPF record, so receivers can't tell which servers may send as you.",
      hints: [
        `Add one TXT record at ${domain} (host "@"): v=spf1 include:<your email provider> ~all — your provider's setup page gives the exact include.`,
      ],
    };
  }
  if (spf.length > 1) {
    return {
      ...base,
      status: "fail",
      record: null,
      summary: `${spf.length} SPF records found. Receivers treat that as an error and SPF fails.`,
      hints: [
        "Merge them into a single v=spf1 record: keep every include:, then end with one ~all or -all.",
      ],
    };
  }

  const record = spf[0]!.trim();
  const terms = record.split(/\s+/).slice(1).filter(Boolean);
  const hints: string[] = [];
  let status: AuthStatus = "pass";

  const lookups = terms.filter((t) =>
    /^[+~?-]?(include:|a(?=$|[:/])|mx(?=$|[:/])|ptr|exists:)|^redirect=/i.test(t),
  ).length;
  if (lookups > SPF_LOOKUP_LIMIT) {
    status = "fail";
    hints.push(
      `It needs ${lookups} DNS lookups; the limit is ${SPF_LOOKUP_LIMIT}. Remove includes for services you no longer use.`,
    );
  } else if (lookups >= 8) {
    status = worst(status, "warn");
    hints.push(
      `It uses ${lookups} of ${SPF_LOOKUP_LIMIT} DNS lookups at the top level, and nested includes count too. Trim unused includes before adding more.`,
    );
  }
  if (terms.some((t) => /^[+~?-]?ptr/i.test(t))) {
    status = worst(status, "warn");
    hints.push("Remove the ptr mechanism. It is deprecated and some receivers ignore it.");
  }

  const all = terms.map((t) => t.toLowerCase()).find((t) => /^[+~?-]?all$/.test(t));
  const hasRedirect = terms.some((t) => /^redirect=/i.test(t));
  if (all === "+all" || all === "all") {
    status = "fail";
    hints.push("+all lets anyone on the internet send as your domain. Change it to ~all or -all.");
  } else if (all === "?all") {
    status = worst(status, "warn");
    hints.push("?all is neutral and protects nothing. Use ~all (soft fail) or -all (hard fail).");
  } else if (!all && !hasRedirect) {
    status = worst(status, "warn");
    hints.push("The record has no ending all rule. Finish it with ~all or -all.");
  }

  const summary =
    status === "pass"
      ? `SPF is set (${all ?? "redirect"}).`
      : status === "warn"
        ? "SPF is set but could be stronger."
        : "SPF is set but broken or unsafe.";
  return { ...base, status, record, summary, hints };
}

// ---------------------------------------------------------------- DMARC

export function parseTags(record: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const part of record.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    if (key && !(key in tags)) tags[key] = part.slice(eq + 1).trim();
  }
  return tags;
}

export function gradeDmarc(domain: string, txts: string[]): AuthResult {
  const dmarc = txts.filter((t) => /^v\s*=\s*DMARC1\s*(;|$)/i.test(t.trim()));
  const base = { check: "dmarc" as const };
  const starter = `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`;
  if (dmarc.length === 0) {
    return {
      ...base,
      status: "fail",
      record: null,
      summary:
        "No DMARC record. Gmail and Yahoo require one from bulk senders, and spoofers can use your name.",
      hints: [`Add a TXT record at _dmarc.${domain}: ${starter}`],
    };
  }
  if (dmarc.length > 1) {
    return {
      ...base,
      status: "fail",
      record: null,
      summary: `${dmarc.length} DMARC records found. Receivers ignore DMARC entirely when there is more than one.`,
      hints: [`Keep exactly one TXT record at _dmarc.${domain}.`],
    };
  }

  const record = dmarc[0]!.trim();
  const tags = parseTags(record);
  const policy = (tags["p"] ?? "").toLowerCase();
  const hints: string[] = [];
  let status: AuthStatus;

  if (!["none", "quarantine", "reject"].includes(policy)) {
    return {
      ...base,
      status: "fail",
      record,
      summary: "The DMARC record has no valid policy (p=), so receivers ignore it.",
      hints: [`Replace it with: ${starter}`],
    };
  }
  if (policy === "none") {
    status = "warn";
    hints.push(
      "p=none only monitors. Once your reports show your real mail passing, move to p=quarantine, then p=reject.",
    );
  } else {
    status = "pass";
  }

  const pct = tags["pct"] === undefined ? 100 : Number(tags["pct"]);
  if (policy !== "none" && Number.isFinite(pct) && pct < 100) {
    status = worst(status, "warn");
    hints.push(`pct=${pct} applies the policy to only part of your mail. Raise it to 100.`);
  }
  const sub = (tags["sp"] ?? "").toLowerCase();
  if (policy !== "none" && sub === "none") {
    status = worst(status, "warn");
    hints.push("sp=none leaves subdomains unprotected. Remove sp= or match your main policy.");
  }
  if (!tags["rua"]) {
    hints.push(
      `Add rua=mailto:dmarc@${domain} to receive daily reports of who sends as your domain.`,
    );
  }

  const summary =
    status === "pass"
      ? `DMARC is enforced (p=${policy}).`
      : policy === "none"
        ? "DMARC is set to monitor only (p=none)."
        : `DMARC is set (p=${policy}) but only partly applied.`;
  return { ...base, status, record, summary, hints };
}

// ---------------------------------------------------------------- DKIM

export type DkimLookup = { selector: string; txts: string[] };

/** Rough RSA modulus size from the base64 public key (SPKI DER): 1024-bit ≈ 216 chars, 2048-bit ≈ 392. */
export function rsaKeyBits(p: string): number {
  const bytes = Math.floor((p.replace(/[^A-Za-z0-9+/]/g, "").length * 3) / 4);
  if (bytes >= 500) return 4096;
  if (bytes >= 270) return 2048;
  if (bytes >= 140) return 1024;
  return 512;
}

export function gradeDkim(domain: string, lookups: DkimLookup[]): AuthResult {
  const base = { check: "dkim" as const };
  const found: Array<{ selector: string; record: string; tags: Record<string, string> }> = [];
  for (const { selector, txts } of lookups) {
    for (const txt of txts) {
      const tags = parseTags(txt);
      if ("p" in tags && (!tags["v"] || /^DKIM1$/i.test(tags["v"]))) {
        found.push({ selector, record: txt.trim(), tags });
      }
    }
  }

  const live = found.filter((f) => f.tags["p"]!.replace(/\s/g, "").length > 0);
  const revoked = found.filter((f) => f.tags["p"]!.replace(/\s/g, "").length === 0);
  if (live.length === 0) {
    return {
      ...base,
      status: revoked.length ? "fail" : "warn",
      record: null,
      summary: revoked.length
        ? `The DKIM key at ${revoked.map((r) => r.selector).join(", ")} is revoked (empty p=).`
        : "No DKIM key found at the common selectors we check.",
      hints: [
        "Turn on DKIM signing in your email provider (Google Workspace, Microsoft 365, Resend…) and add the TXT or CNAME record it shows you under <selector>._domainkey." +
          ` We checked: ${lookups.map((l) => l.selector).join(", ")}.`,
      ],
    };
  }

  const hints: string[] = [];
  let status: AuthStatus = "pass";
  const weak = live.filter(
    (f) => (f.tags["k"] ?? "rsa").toLowerCase() === "rsa" && rsaKeyBits(f.tags["p"]!) < 2048,
  );
  if (weak.length) {
    status = "warn";
    hints.push(
      `The key at ${weak.map((w) => w.selector).join(", ")} is shorter than 2048 bits. Generate a 2048-bit key in your email provider and publish it.`,
    );
  }
  if (live.some((f) => (f.tags["t"] ?? "").split(":").includes("y"))) {
    status = worst(status, "warn");
    hints.push(
      "A key is still in test mode (t=y), so receivers may ignore it. Remove t=y once mail passes.",
    );
  }
  return {
    ...base,
    status,
    record: live.length === 1 ? live[0]!.record : null,
    summary: `DKIM key found for ${domain} (selector ${live.map((l) => l.selector).join(", ")}).`,
    hints,
  };
}

/** Accepts only a plain public hostname: we query DNS for it and show it back. */
export function normalizeMailDomain(input: string | null | undefined): string | null {
  const host = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  if (host.length > 253 || !host.includes(".")) return null;
  const labels = host.split(".");
  const validLabel = (l: string) =>
    /^[a-z0-9-]{1,63}$/.test(l) && !l.startsWith("-") && !l.endsWith("-");
  if (!labels.every(validLabel)) return null;
  if (/^\d+$/.test(labels[labels.length - 1]!)) return null;
  return host;
}
