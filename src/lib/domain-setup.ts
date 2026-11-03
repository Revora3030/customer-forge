/**
 * Browser-safe helpers for the client-facing Domain Center.
 *
 * Two jobs: help a business owner find and buy a domain name, and help them
 * point a domain they already own at their Revora website. Nothing here talks
 * to the database — availability checks and DNS verification are server work.
 */

export const DOMAIN_IP = "185.158.133.1";

export const SUGGESTION_TLDS = [".com", ".co", ".net", ".services", ".pro"] as const;

/** Where owners can register a name. Links open a pre-filled search. */
export const REGISTRARS: {
  id: string;
  name: string;
  note: string;
  search: (domain: string) => string;
}[] = [
  {
    id: "cloudflare",
    name: "Cloudflare Registrar",
    note: "At-cost pricing, no upsells. Best value if you're comfortable with DNS.",
    search: (d) => `https://domains.cloudflare.com/?domain=${encodeURIComponent(d)}`,
  },
  {
    id: "porkbun",
    name: "Porkbun",
    note: "Cheap renewals, free WHOIS privacy, simple DNS screens.",
    search: (d) => `https://porkbun.com/checkout/search?q=${encodeURIComponent(d)}`,
  },
  {
    id: "namecheap",
    name: "Namecheap",
    note: "Popular and beginner-friendly with 24/7 chat support.",
    search: (d) =>
      `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(d)}`,
  },
  {
    id: "godaddy",
    name: "GoDaddy",
    note: "The most familiar name. Watch for add-ons at checkout.",
    search: (d) =>
      `https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(d)}`,
  },
];

/** Registrar-specific pointers for where the DNS screen lives. */
export const DNS_HELP: { registrar: string; where: string }[] = [
  { registrar: "Cloudflare", where: "Websites → your domain → DNS → Records → Add record" },
  { registrar: "Porkbun", where: "Domain Management → your domain → DNS → Add record" },
  { registrar: "Namecheap", where: "Domain List → Manage → Advanced DNS → Add New Record" },
  { registrar: "GoDaddy", where: "My Products → DNS → Add / edit records" },
  {
    registrar: "Squarespace / Google Domains",
    where: "Domains → your domain → DNS → Custom records",
  },
  { registrar: "Wix", where: "Domains → your domain → Advanced → Edit DNS" },
];

export function normalizeInput(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/\s+/g, "");
}

export function looksLikeDomain(value: string) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(value);
}

/** Compact word used to build candidate names. */
function stem(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\b(the|and|llc|inc|co|company|services|service)\b/g, "")
    .replace(/\s+/g, "");
}

/**
 * Candidate names built only from facts the owner already gave us — business
 * name, city and trade. No invented brand words.
 */
export function domainSuggestions(input: {
  businessName?: string | null | undefined;
  city?: string | null | undefined;
  industry?: string | null | undefined;
  slug?: string | null | undefined;
}): string[] {
  const name = stem(input.businessName) || stem(input.slug);
  const city = stem(input.city);
  const trade = stem(input.industry);

  const roots = new Set<string>();
  if (name) roots.add(name);
  if (name && city) roots.add(`${name}${city}`);
  if (name && trade && !name.includes(trade)) roots.add(`${name}${trade}`);
  if (trade && city) roots.add(`${city}${trade}`);
  if (trade && city) roots.add(`${trade}${city}`);
  if (name) roots.add(`${name}pro`);
  if (name) roots.add(`get${name}`);

  const out: string[] = [];
  for (const root of roots) {
    if (root.length < 3 || root.length > 40) continue;
    for (const tld of SUGGESTION_TLDS) {
      const candidate = `${root}${tld}`;
      if (!out.includes(candidate)) out.push(candidate);
      if (out.length >= 20) break;
    }
    if (out.length >= 20) break;
  }
  return out;
}

export type DnsRecordRow = {
  type: string;
  name: string;
  value: string;
  ttl: string;
  why: string;
  /** True while the value is not known yet: show the note, never a placeholder to copy. */
  pending?: boolean;
};

/** Host label of the ownership TXT record the hosting platform checks. */
export const LOVABLE_TXT_NAME = "_lovable";
const LOVABLE_VERIFY_PREFIX = "lovable_verify=";

export const LOVABLE_TXT_PENDING_NOTE =
  "Pending — Revora will send your verification value. Add this record once you have it.";

/**
 * The per-domain ownership values the hosting platform issues when Revora adds
 * the domain (apex and www are separate domains, each with its own value).
 * Stored in website_settings.generation.domainVerification (no migration).
 */
export type LovableVerification = { apex: string | null; www: string | null };

/** A pasted value, trimmed; null unless it is a real `lovable_verify=…` token. */
export function normalizeLovableVerifyValue(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().replace(/^"|"$/g, "").trim();
  if (!value.toLowerCase().startsWith(LOVABLE_VERIFY_PREFIX)) return null;
  const token = value.slice(LOVABLE_VERIFY_PREFIX.length);
  if (!/^[A-Za-z0-9._-]{4,200}$/.test(token)) return null;
  return `${LOVABLE_VERIFY_PREFIX}${token}`;
}

/** The stored values for this exact domain; a value saved for another domain is ignored. */
export function readLovableVerification(generation: unknown, domain: string | null | undefined): LovableVerification {
  const empty = { apex: null, www: null };
  const host = normalizeInput(domain ?? "");
  if (!host || !generation || typeof generation !== "object") return empty;
  const stored = (generation as Record<string, unknown>)["domainVerification"];
  if (!stored || typeof stored !== "object") return empty;
  const v = stored as Record<string, unknown>;
  if (normalizeInput(String(v["domain"] ?? "")) !== host) return empty;
  return { apex: normalizeLovableVerifyValue(v["apex"]), www: normalizeLovableVerifyValue(v["www"]) };
}

/** generation with the domain's verification values set (other keys untouched). */
export function writeLovableVerification(
  generation: unknown,
  domain: string,
  values: { apex?: unknown; www?: unknown },
  now: Date = new Date(),
): Record<string, unknown> {
  const base = generation && typeof generation === "object" ? { ...(generation as Record<string, unknown>) } : {};
  base["domainVerification"] = {
    domain: normalizeInput(domain),
    apex: normalizeLovableVerifyValue(values.apex),
    www: normalizeLovableVerifyValue(values.www),
    updatedAt: now.toISOString(),
  };
  return base;
}

/** Exactly what the owner types into their registrar's DNS screen. */
export function dnsRows(domain: string, verification?: LovableVerification | null): DnsRecordRow[] {
  const shown = domain || "yourdomain.com";
  const txt = (name: string, value: string | null | undefined, host: string): DnsRecordRow =>
    value
      ? { type: "TXT", name, value, ttl: "Automatic", why: `Proves you own ${host} so HTTPS can be issued` }
      : {
          type: "TXT",
          name,
          value: LOVABLE_TXT_PENDING_NOTE,
          ttl: "Automatic",
          why: `Proves you own ${host} so HTTPS can be issued`,
          pending: true,
        };
  return [
    {
      type: "A",
      name: "@",
      value: DOMAIN_IP,
      ttl: "Automatic",
      why: `Sends ${domain || "your domain"} to your Revora website`,
    },
    {
      type: "A",
      name: "www",
      value: DOMAIN_IP,
      ttl: "Automatic",
      why: `Makes www.${shown} work too`,
    },
    txt(LOVABLE_TXT_NAME, verification?.apex, shown),
    txt(`${LOVABLE_TXT_NAME}.www`, verification?.www, `www.${shown}`),
  ];
}

/** Certificate authorities the hosting platform issues HTTPS certificates from. */
export const ALLOWED_CAA_ISSUERS = ["letsencrypt.org", "pki.goog"] as const;

export type CaaRecord = { flags: number; tag: string; value: string };

/**
 * One CAA answer from DNS-over-HTTPS. Accepts the presentation form
 * (`0 issue "letsencrypt.org"`) and the RFC 3597 hex form some resolvers return
 * (`\\# 19 00 05 69 73 73 75 65 ...`). Null when it can't be read.
 */
export function parseCaaRecord(data: string): CaaRecord | null {
  const text = (data ?? "").trim();
  const hex = text.match(/^\\#\s+\d+\s+([0-9a-fA-F\s]+)$/);
  if (hex) {
    const bytes = (hex[1] ?? "").replace(/\s+/g, "").match(/../g)?.map((b) => parseInt(b, 16)) ?? [];
    if (bytes.length < 2) return null;
    const flags = bytes[0]!;
    const tagLen = bytes[1]!;
    if (bytes.length < 2 + tagLen) return null;
    const tag = String.fromCharCode(...bytes.slice(2, 2 + tagLen)).toLowerCase();
    const value = String.fromCharCode(...bytes.slice(2 + tagLen));
    return { flags, tag, value };
  }
  const m = text.match(/^(\d+)\s+([A-Za-z0-9]+)\s+"?(.*?)"?$/);
  if (!m) return null;
  return { flags: Number(m[1]), tag: (m[2] ?? "").toLowerCase(), value: m[3] ?? "" };
}

/**
 * Whether the domain's CAA records let the platform get a certificate.
 * No CAA records, or no `issue` records, means any CA may issue (ok).
 * Otherwise at least one `issue` record must name Let's Encrypt or Google
 * Trust Services; if none does, `warning` explains what to add.
 */
export function caaAllowsCertificates(answers: string[]): { ok: boolean; issuers: string[]; warning: string | null } {
  const records = answers.map(parseCaaRecord).filter((r): r is CaaRecord => r !== null);
  const issuers = records
    .filter((r) => r.tag === "issue")
    .map((r) => (r.value.split(";")[0] ?? "").trim().toLowerCase());
  if (issuers.length === 0) return { ok: true, issuers, warning: null };
  const ok = issuers.some((i) => (ALLOWED_CAA_ISSUERS as readonly string[]).includes(i));
  return {
    ok,
    issuers,
    warning: ok
      ? null
      : `Your domain's CAA records only allow ${issuers.filter(Boolean).join(", ") || "no certificate authority"} to issue certificates, so HTTPS can't be issued. Add a CAA record: 0 issue "letsencrypt.org" (and 0 issue "pki.goog"), or remove the CAA records.`,
  };
}

/** The CAA warning saved by the last domain check (website_settings.domain_records). */
export function readCaaWarning(domainRecords: unknown): string | null {
  if (!domainRecords || typeof domainRecords !== "object") return null;
  const w = (domainRecords as Record<string, unknown>)["caaWarning"];
  return typeof w === "string" && w ? w : null;
}

export const DOMAIN_STEPS = [
  {
    id: "choose",
    title: "Choose your address",
    detail: "Buy a new name or use one you already own.",
  },
  { id: "connect", title: "Save it in Revora", detail: "We store it and start watching your DNS." },
  {
    id: "dns",
    title: "Add your DNS records",
    detail: "Two A records and two _lovable TXT records, exactly as shown.",
  },
  {
    id: "verify",
    title: "Verify and secure",
    detail: "We confirm DNS, then HTTPS is issued automatically.",
  },
  { id: "live", title: "Go live", detail: "Publish your website and your domain serves it." },
] as const;

/**
 * Registrar-specific, click-by-click instructions. Written for an owner who has
 * never touched DNS: exactly where to click and exactly what to type.
 */
export const REGISTRAR_GUIDES: {
  id: string;
  name: string;
  steps: string[];
}[] = [
  {
    id: "godaddy",
    name: "GoDaddy",
    steps: [
      "Sign in at godaddy.com and open My Products.",
      "Find your domain and click DNS (or Manage DNS).",
      "If an A record named @ already exists, click the pencil to edit it instead of adding a new one.",
      "Set Type A, Name @, Value 185.158.133.1, TTL 1 hour, then Save.",
      "Click Add, choose Type A, Name www, Value 185.158.133.1, then Save.",
      "Delete any other A record or CNAME for @ or www — two answers keep the site offline.",
    ],
  },
  {
    id: "namecheap",
    name: "Namecheap",
    steps: [
      "Sign in and open Domain List, then click Manage next to your domain.",
      "Open the Advanced DNS tab.",
      "Remove the default 'Parking page' / URL redirect records for @ and www.",
      "Add New Record → A Record, Host @, Value 185.158.133.1, TTL Automatic.",
      "Add New Record → A Record, Host www, Value 185.158.133.1, TTL Automatic.",
      "Save all changes with the green checkmarks.",
    ],
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    steps: [
      "Sign in, open Websites and pick your domain.",
      "Open DNS → Records.",
      "Add record → A, Name @, IPv4 address 185.158.133.1.",
      "Add record → A, Name www, IPv4 address 185.158.133.1.",
      "Set Proxy status to DNS only (grey cloud) for both A records. Proxied (orange cloud) records stop the HTTPS certificate from being issued.",
      "Add record → TXT, Name _lovable, Content: the verification value Revora sent you. Add another TXT, Name _lovable.www, with the www value.",
      "Save. Delete any older A/CNAME record for @ or www.",
    ],
  },
  {
    id: "squarespace",
    name: "Squarespace / Google Domains",
    steps: [
      "Sign in and open Domains, then your domain.",
      "Click DNS → DNS Settings → Custom records.",
      "Add Host @, Type A, Data 185.158.133.1.",
      "Add Host www, Type A, Data 185.158.133.1.",
      "Remove any existing A or CNAME rows for @ and www, then Save.",
    ],
  },
  {
    id: "porkbun",
    name: "Porkbun",
    steps: [
      "Sign in and open Domain Management.",
      "Click the DNS icon next to your domain.",
      "Delete the default ALIAS/CNAME records for the bare domain and www.",
      "Add Type A, Host blank, Answer 185.158.133.1.",
      "Add Type A, Host www, Answer 185.158.133.1.",
    ],
  },
  {
    id: "wix",
    name: "Wix",
    steps: [
      "Sign in and open Domains from your dashboard.",
      "Click your domain → Advanced → Edit DNS.",
      "Under A (Host) set the value to 185.158.133.1.",
      "Under CNAME (Aliases) delete the www row, then add an A record for www pointing to 185.158.133.1.",
      "Save changes.",
    ],
  },
];

/** Plain-English answers to what owners ask while they wait. */
export const DOMAIN_FAQ: { q: string; a: string }[] = [
  {
    q: "Will my site go down while I do this?",
    a: "No. Your Revora share link keeps serving the live site the entire time. Your own domain only takes over after both checks below pass.",
  },
  {
    q: "How long does it take?",
    a: "Usually 5–60 minutes after you save the records. Some registrars take up to 48 hours to publish the change worldwide.",
  },
  {
    q: "Do I need to buy an SSL certificate?",
    a: "No. HTTPS is issued automatically and renews itself once DNS points here and the _lovable TXT records are in place. If your domain has CAA records, they must allow Let's Encrypt (letsencrypt.org) or Google Trust Services (pki.goog).",
  },
  {
    q: "What about my email on this domain?",
    a: "Leave your MX and existing TXT records exactly as they are. You only change the A records for @ and www and add the two _lovable TXT records, so email keeps working.",
  },
];
