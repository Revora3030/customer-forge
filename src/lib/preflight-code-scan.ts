/**
 * PRE-FLIGHT CODE AND EMBED SCAN (COMP-5)
 * =======================================
 *
 * Reads the text a customer's pages carry (headings, body copy, section and
 * component settings) and reports, in plain language, anything that looks like
 * pasted custom code or an embed that could hurt them:
 *
 * - an exposed secret or API key             -> BLOCKER (stops the publish)
 * - an inline script, or a script from an unknown host   -> warning
 * - a form that posts to another website     -> warning
 * - an iframe from a host Revora does not frame -> warning
 * - an asset loaded over http:// (mixed content) -> BLOCKER (LOV-10)
 *
 * Deterministic and browser-safe: no network, no external service, no AI.
 * Pattern ideas follow the free gitleaks rule set used by the repo's CI
 * (security-scans.md); the patterns here are our own small, high-precision
 * subset so a normal sentence never blocks a publish. Matched secret values
 * are NEVER returned: findings carry only the kind of secret and where it is.
 */

import { EMBED_PROVIDERS } from "@/lib/site-embed";
import type { ContentPage } from "@/lib/website-content";

export type CodeFindingKind =
  | "secret-key"
  | "secret-key-maybe"
  | "inline-script"
  | "unknown-script-host"
  | "offsite-form"
  | "unknown-frame-host"
  | "mixed-content";

export type CodeFinding = {
  kind: CodeFindingKind;
  /** Blockers stop a publish; warnings never do. Only exposed keys are blockers. */
  severity: "blocker" | "warning";
  pageTitle: string;
  /** Plain-language name of the section, e.g. "the Contact section". */
  where: string;
  /** What was found, never the secret itself. */
  what: string;
  /** Host involved (script, form or frame), when there is one. */
  host?: string;
};

/** Script hosts the live site already allows in its content security policy. */
export const TRUSTED_SCRIPT_HOSTS = [
  "js.stripe.com",
  "maps.googleapis.com",
  "maps.gstatic.com",
  "www.googletagmanager.com",
  "pagead2.googlesyndication.com",
  "googleads.g.doubleclick.net",
  "www.clarity.ms",
  "scripts.clarity.ms",
] as const;

type SecretRule = { id: string; label: string; re: RegExp; severity: "blocker" | "warning" };

const SECRET_RULES: SecretRule[] = [
  { id: "stripe-secret", label: "a Stripe secret key", re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/, severity: "blocker" },
  { id: "stripe-webhook", label: "a Stripe webhook signing secret", re: /\bwhsec_[A-Za-z0-9]{24,}/, severity: "blocker" },
  { id: "private-key", label: "a private key", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/, severity: "blocker" },
  { id: "aws-access-key", label: "an AWS access key", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/, severity: "blocker" },
  { id: "github-token", label: "a GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/, severity: "blocker" },
  { id: "slack-token", label: "a Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{20,}/, severity: "blocker" },
  { id: "sendgrid-key", label: "a SendGrid API key", re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/, severity: "blocker" },
  { id: "anthropic-key", label: "an Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/, severity: "blocker" },
  { id: "openai-key", label: "an OpenAI API key", re: /\bsk-(?:proj-)?(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{32,}/, severity: "blocker" },
  { id: "resend-key", label: "a Resend API key", re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/, severity: "blocker" },
  { id: "twilio-key", label: "a Twilio API key", re: /\bSK[0-9a-f]{32}\b/, severity: "blocker" },
  // Google browser keys are public by design but must be restricted; ask, don't block.
  { id: "google-api-key", label: "a Google API key (fine for a restricted maps key, never for anything else)", re: /\bAIza[0-9A-Za-z_-]{35}\b/, severity: "warning" },
  {
    id: "generic-secret",
    label: "something that looks like a password, token or secret key",
    re: /\b(?:api[_-]?key|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|client[_-]?secret|password)["']?\s*[:=]\s*["'][A-Za-z0-9_\-/+=.]{20,}["']/i,
    severity: "warning",
  },
];

function isServiceRoleJwt(text: string): boolean {
  for (const m of text.matchAll(/\beyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g)) {
    try {
      const payload = atob((m[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"));
      if (/"role"\s*:\s*"service_role"/.test(payload)) return true;
    } catch {
      // not decodable: not a JWT we can judge
    }
  }
  return false;
}

/** Placeholder text such as sk_live_xxxxxxxx or YOUR_API_KEY is not a real key. */
function looksLikePlaceholder(match: string): boolean {
  const tail = match.replace(/^[A-Za-z]+[_-](?:live|test|proj)?[_-]?/, "");
  return /^(.)\1{7,}$/.test(tail) || /x{6,}|\*{4,}|your[_-]?|example|placeholder|changeme/i.test(match);
}

/** Every string inside an arbitrary settings value, depth- and size-limited. */
function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (out.length > 400 || depth > 6) return;
  if (typeof value === "string") {
    out.push(value.slice(0, 20_000));
  } else if (Array.isArray(value)) {
    for (const v of value.slice(0, 100)) collectStrings(v, out, depth + 1);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>).slice(0, 100)) {
      collectStrings(v, out, depth + 1);
    }
  }
}

function hostOf(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;
  try {
    return new URL(raw.startsWith("//") ? `https:${raw}` : raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const FRAME_HOSTS = new Set<string>([
  ...EMBED_PROVIDERS.flatMap((p) => p.hosts),
  "js.stripe.com",
  "hooks.stripe.com",
]);

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}

/**
 * Mixed content: an ASSET (image, script, frame, stylesheet, media, CSS url())
 * loaded over http:// from an https page. A plain http:// link someone clicks
 * is not mixed content and is ignored here.
 */
export function hasMixedContent(text: string): boolean {
  if (/<(?:img|script|iframe|source|video|audio|embed)\b[^>]*\s(?:src|poster|srcset)\s*=\s*["']?\s*http:\/\//i.test(text)) return true;
  if (/<link\b[^>]*\bhref\s*=\s*["']?\s*http:\/\//i.test(text) && /<link\b[^>]*\brel\s*=\s*["']?(?:stylesheet|preload|icon)/i.test(text)) return true;
  return /url\(\s*["']?http:\/\//i.test(text);
}

/** A stored media URL (image/video field) that is plain http://. */
export function isInsecureMediaUrl(value: string | null | undefined): boolean {
  return typeof value === "string" && /^\s*http:\/\//i.test(value);
}

export type ScanOptions = {
  /** The site's own public host, so a form posting to it is not "off-site". */
  publicHost?: string | null | undefined;
};

/** Scans one block of text. Exported for tests and for other callers. */
export function scanText(
  text: string,
  place: { pageTitle: string; where: string },
  options: ScanOptions = {},
): CodeFinding[] {
  const findings: CodeFinding[] = [];
  const push = (f: Omit<CodeFinding, "pageTitle" | "where">) =>
    findings.push({ ...f, pageTitle: place.pageTitle, where: place.where });
  const own = (options.publicHost ?? "").toLowerCase().replace(/^www\./, "");

  for (const rule of SECRET_RULES) {
    const m = text.match(rule.re);
    if (!m || looksLikePlaceholder(m[0])) continue;
    push({
      kind: rule.severity === "blocker" ? "secret-key" : "secret-key-maybe",
      severity: rule.severity,
      what: rule.label,
    });
  }
  if (isServiceRoleJwt(text)) {
    push({ kind: "secret-key", severity: "blocker", what: "a Supabase service-role key" });
  }

  if (hasMixedContent(text)) {
    push({ kind: "mixed-content", severity: "blocker", what: "an image, file or script loaded over plain http:// (browsers block it on a secure site)" });
  }

  const seenHosts = new Set<string>();
  for (const m of text.matchAll(/<script\b[^>]*>/gi)) {
    const src = attr(m[0], "src");
    if (src === null) {
      push({ kind: "inline-script", severity: "warning", what: "a script written straight into the page" });
      continue;
    }
    const host = hostOf(src);
    if (host && !(TRUSTED_SCRIPT_HOSTS as readonly string[]).includes(host) && !seenHosts.has(`s:${host}`)) {
      seenHosts.add(`s:${host}`);
      push({ kind: "unknown-script-host", severity: "warning", what: "a script loaded from a website Revora does not know", host });
    }
  }
  if (/<[a-z][^>]*\son[a-z]{3,}\s*=\s*["']/i.test(text) || /\bjavascript\s*:/i.test(text)) {
    push({ kind: "inline-script", severity: "warning", what: "a button or link that runs code when clicked" });
  }

  for (const m of text.matchAll(/<form\b[^>]*>/gi)) {
    const action = attr(m[0], "action");
    const host = action ? hostOf(action) : null;
    if (!host) continue; // relative or empty action stays on the site
    const bare = host.replace(/^www\./, "");
    if (bare === own || bare.endsWith(".revoragrowthsystems.com") || bare === "revoragrowthsystems.com") continue;
    if (!seenHosts.has(`f:${host}`)) {
      seenHosts.add(`f:${host}`);
      push({ kind: "offsite-form", severity: "warning", what: "a form that sends visitors' details to another website", host });
    }
  }

  for (const m of text.matchAll(/<iframe\b[^>]*>/gi)) {
    const host = hostOf(attr(m[0], "src") ?? "");
    if (host && !FRAME_HOSTS.has(host) && !seenHosts.has(`i:${host}`)) {
      seenHosts.add(`i:${host}`);
      push({ kind: "unknown-frame-host", severity: "warning", what: "an embedded frame from a website Revora does not frame", host });
    }
  }
  return findings;
}

function sectionName(section: ContentPage["sections"][number]): string {
  const heading = (section.heading ?? "").trim();
  const kind = section.kind.replace(/[_-]+/g, " ");
  return heading ? `the "${heading.slice(0, 50)}" section` : `the ${kind} section`;
}

/** Scans every visible section and component of every visible page. */
export function scanPagesForRiskyCode(pages: ContentPage[], options: ScanOptions = {}): CodeFinding[] {
  const out: CodeFinding[] = [];
  for (const page of pages) {
    if (!page.is_visible) continue;
    for (const section of page.sections) {
      if (!section.is_visible) continue;
      const seen = new Set<string>();
      const strings: string[] = [section.heading ?? "", section.subheading ?? "", section.body ?? ""];
      collectStrings(section.settings, strings);
      for (const c of section.components) {
        if (!c.is_visible) continue;
        strings.push(c.label ?? "", c.body ?? "", c.link_url ?? "", c.link_label ?? "");
        if (isInsecureMediaUrl(c.media_url)) {
          const key = "mixed-content|media";
          if (!seen.has(key)) {
            seen.add(key);
            out.push({ kind: "mixed-content", severity: "blocker", pageTitle: page.title, where: sectionName(section), what: "an image or video loaded over plain http:// (browsers block it on a secure site)" });
          }
        }
        collectStrings(c.settings, strings);
      }
      for (const text of strings) {
        if (!text) continue;
        for (const f of scanText(text, { pageTitle: page.title, where: sectionName(section) }, options)) {
          const key = `${f.kind}|${f.what}|${f.host ?? ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(f);
        }
      }
    }
  }
  return out;
}

/** One plain sentence for a finding, naming the page and block. Never repeats the secret. */
export function describeFinding(f: CodeFinding): string {
  const place = `${f.where} on "${f.pageTitle}"`;
  const host = f.host ? ` (${f.host})` : "";
  return `${place} contains ${f.what}${host}.`;
}
