/**
 * PUBLISH-TIME SECURITY CHECK (COMP-5 + LOV-10)
 * =============================================
 *
 * One check for the Pre-Flight panel with one result line:
 *   "Security check: passed"   or   "Security check: N things to fix"
 *
 * Built from real data only: the text of the owner's visible pages
 * (preflight-code-scan.ts) and, when the caller has them, the response headers
 * of the served page. Headers that were not read are SKIPPED and never
 * reported as passing.
 *
 * Only serious findings block a publish: exposed keys and mixed content.
 * Everything else warns.
 *
 * FIX HOOK (LOV-5): each item carries `{ title, plainReason, scope }`, the exact
 * props of the shared "Fix it with AI" finding card. Until that card is merged
 * the panel renders a plain fallback; when it lands, pass it as
 * `renderFix` to <SecurityCheckLine> and nothing else changes.
 */

import {
  describeFinding,
  scanPagesForRiskyCode,
  type CodeFinding,
  type CodeFindingKind,
} from "@/lib/preflight-code-scan";
import type { ContentPage } from "@/lib/website-content";

export type SecurityItem = {
  key: string;
  severity: "blocker" | "warning";
  /** LOV-5 card prop: short heading. */
  title: string;
  /** LOV-5 card prop: one plain sentence naming the page and block. */
  plainReason: string;
  /** LOV-5 card prop: what a fix may touch, e.g. "page:contact" or "site". */
  scope: string;
  /** True when only the owner can resolve it (a key must be rotated by them). */
  needsOwner: boolean;
};

export type SecurityCheck = {
  passed: boolean;
  /** Things to fix, blockers and warnings together. */
  count: number;
  blockers: number;
  /** Exactly "Security check: passed" or "Security check: N things to fix". */
  line: string;
  items: SecurityItem[];
  /** Whether the served page's headers were read. False means skipped, not passed. */
  headersChecked: boolean;
};

const TITLES: Record<CodeFindingKind, string> = {
  "secret-key": "A secret key is visible on your site",
  "secret-key-maybe": "Something may be a secret",
  "inline-script": "A script is written into a page",
  "unknown-script-host": "A script comes from an unknown website",
  "offsite-form": "A form sends details to another website",
  "unknown-frame-host": "An embed comes from an unknown website",
  "mixed-content": "Something loads over an insecure address",
};

const REQUIRED_HEADERS: { name: string; label: string; ok?: (v: string) => boolean }[] = [
  { name: "strict-transport-security", label: "HTTPS-only (HSTS)" },
  { name: "content-security-policy", label: "content security policy" },
  { name: "x-content-type-options", label: "no content sniffing", ok: (v) => /nosniff/i.test(v) },
  { name: "referrer-policy", label: "referrer policy" },
];

/** Names of the required security headers the served page is missing. */
export function missingSecurityHeaders(headers: Record<string, string>): string[] {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  return REQUIRED_HEADERS.filter((h) => {
    const value = lower.get(h.name);
    return !value || (h.ok ? !h.ok(value) : false);
  }).map((h) => h.label);
}

function scopeOf(f: CodeFinding, pages: ContentPage[]): string {
  const page = pages.find((p) => p.title === f.pageTitle);
  return page ? `page:${page.slug || "home"}` : "site";
}

export function securityCheck(
  pages: ContentPage[],
  options: { publicHost?: string | null; servedHeaders?: Record<string, string> | null } = {},
): SecurityCheck {
  const items: SecurityItem[] = scanPagesForRiskyCode(pages, { publicHost: options.publicHost }).map(
    (f) => ({
      key: `${f.kind}:${f.pageTitle}:${f.where}:${f.host ?? ""}`,
      severity: f.severity,
      title: TITLES[f.kind],
      plainReason: describeFinding(f),
      scope: scopeOf(f, pages),
      needsOwner: f.kind === "secret-key" || f.kind === "secret-key-maybe",
    }),
  );

  const headersChecked = !!options.servedHeaders;
  if (options.servedHeaders) {
    const missing = missingSecurityHeaders(options.servedHeaders);
    if (missing.length) {
      items.push({
        key: "headers",
        severity: "warning",
        title: "Your live page is missing safety settings",
        plainReason: `Your published page does not send: ${missing.join(", ")}.`,
        scope: "site",
        needsOwner: true,
      });
    }
  }

  const blockers = items.filter((i) => i.severity === "blocker").length;
  const count = items.length;
  return {
    passed: count === 0,
    count,
    blockers,
    line: count === 0 ? "Security check: passed" : `Security check: ${count} thing${count === 1 ? "" : "s"} to fix`,
    items,
    headersChecked,
  };
}
