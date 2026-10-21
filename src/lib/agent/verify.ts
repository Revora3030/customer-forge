/**
 * WHAT REVORA CHECKS AFTER IT CHANGES A WEBSITE.
 *
 * This module is deliberately pure: it takes the HTML a page actually served
 * and reports what is wrong with it. No network, no database, no model — so the
 * rules can be tested exactly, and so the same rules apply whether the page was
 * fetched during an autonomous run or during a manual apply.
 *
 * A `critical` failure means the page is broken for a real visitor (no heading,
 * unreadable on a phone, leaked placeholder text, a dead internal link). A
 * `warning` means the page works but is weaker than it should be. Only critical
 * failures cause a change to be rolled back — a warning is reported honestly and
 * left for the owner to decide on.
 */

import { htmlToText } from "@/lib/html-text";

export type CheckSeverity = "critical" | "warning";

export type Check = {
  /** One line a business owner understands. */
  label: string;
  ok: boolean;
  severity: CheckSeverity;
  /** Where it was seen, e.g. "Home" or "/s/acme/services". */
  where: string;
  detail?: string;
  category?: VerificationCategory;
  /** Missing evidence is not a passing check or a reason to roll back. */
  notChecked?: boolean;
};

export type PageInspection = {
  checks: Check[];
  /** Same-site links found on the page, for reachability testing. */
  links: string[];
};

export type VerificationCategory = "content" | "seo" | "accessibility" | "conversion" | "technical" | "security";

export type VerificationReport = {
  evidence: "served_html";
  status: "passed" | "issues" | "incomplete";
  notChecked: number;
  checks: Check[];
  critical: number;
  warnings: number;
  passed: number;
  score: number;
  categories: Record<VerificationCategory, { passed: number; failed: number }>;
  /** One line summarising the outcome for the owner. */
  summary: string;
};

const PLACEHOLDER = /(lorem ipsum|\bTODO\b|\bFIXME\b|\{\{\s*\w+\s*\}\}|\[insert\b|\bundefined\b)/i;

const stripped = (html: string) => htmlToText(html);

const attr = (tag: string, name: string) => {
  const match = new RegExp(String.raw`${name}\s*=\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return (match?.[2] ?? match?.[3] ?? "").trim();
};

/** Inspects one served page. `where` is the human label used in the report. */
export function inspectHtml(html: string, where: string): PageInspection {
  const checks: Check[] = [];
  const add = (
    label: string,
    ok: boolean,
    severity: CheckSeverity,
    detail?: string,
    category: VerificationCategory = "technical",
  ) =>
    checks.push(
      detail
        ? { label, ok, severity, where, detail, category }
        : { label, ok, severity, where, category },
    );

  const headings = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi) ?? [];
  const headingText = headings.map((tag) => stripped(tag)).filter(Boolean);
  // A missing h1 is an SEO/accessibility finding, not something broken for a
  // visitor. As "critical" it reversed otherwise-good changes on any page whose
  // layout used a level-2 headline.
  add("The page has a real headline", headingText.length > 0, "warning", undefined, "content");
  if (headings.length > 1)
    add("Only one main headline per page", false, "warning", `${headings.length} found`, "accessibility");

  const title = stripped(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  add("The browser tab has a title", title.length > 2, "warning", title.slice(0, 80), "seo");
  add(
    "The page title is a useful search length",
    title.length >= 10 && title.length <= 65,
    "warning",
    title.length ? `${title.length} characters` : "missing",
    "seo",
  );

  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  const description = metas
    .filter((tag) => /name\s*=\s*["']description["']/i.test(tag))
    .map((tag) => attr(tag, "content"))
    .find(Boolean);
  add(
    "Google has a description to show",
    Boolean(description && description.length > 20),
    "warning",
    undefined,
    "seo",
  );
  add(
    "The search description is a useful length",
    Boolean(description && description.length >= 50 && description.length <= 170),
    "warning",
    description ? `${description.length} characters` : "missing",
    "seo",
  );

  const viewport = metas.some((tag) => /name\s*=\s*["']viewport["']/i.test(tag));
  add("The page declares a mobile viewport", viewport, "critical", "Layout and readability require a rendered screen check.", "accessibility");

  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  const missingAlt = images.filter((tag) => !attr(tag, "alt")).length;
  add(
    "Every photo describes itself for screen readers",
    missingAlt === 0,
    "warning",
    missingAlt ? `${missingAlt} of ${images.length} photos have no description` : undefined,
    "accessibility",
  );

  const lang = /<html\b[^>]*\blang\s*=\s*["'][^"']+["']/i.test(html);
  add("The document declares a language", lang, "warning", undefined, "accessibility");

  const unlabeledAnchors = (html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/gi) ?? []).filter((tag) => {
    const label = stripped(tag);
    return !label && !attr(tag, "aria-label") && !attr(tag, "title");
  }).length;
  add(
    "Interactive links have accessible labels",
    unlabeledAnchors === 0,
    "warning",
    unlabeledAnchors ? `${unlabeledAnchors} link(s) have no accessible label` : undefined,
    "accessibility",
  );

  const forms = html.match(/<form\b[^>]*>/gi) ?? [];
  const submitSignals = /<(?:button|input)\b[^>]*(?:type\s*=\s*["']submit["']|>[^<]*(?:book|quote|contact|call|get started|schedule|request))/i.test(html);
  const ctaSignal = /href\s*=\s*["'][^"']*(?:book|quote|contact|call|schedule|get-started|start)/i.test(html);
  const hasConversionSignal = forms.length > 0 || submitSignals || ctaSignal;
  add(
    "The page contains conversion markup",
    hasConversionSignal,
    "warning",
    `${forms.length} form(s); validation and submission were not exercised.`,
    "conversion",
  );

  const conversionLinks = (html.match(/href\\s*=\\s*["'][^"']*(?:tel:|mailto:|sms:)[^"']*["']/gi) ?? []).length;
  add(
    "Direct contact actions are available when a site exposes them",
    hasConversionSignal || conversionLinks > 0,
    "warning",
    conversionLinks ? `${conversionLinks} direct contact action(s)` : undefined,
    "conversion",
  );

  const canonical = /<link\b[^>]*rel\s*=\s*["']canonical["']/i.test(html);
  add("Search engines have a canonical URL", canonical, "warning", undefined, "seo");

  const structuredData = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["']/i.test(html);
  add("Structured data is present", structuredData, "warning", undefined, "seo");

  const body = stripped(html);
  add(
    "The page has real content on it",
    body.length > 200,
    "critical",
    `${body.length} characters`,
    "content",
  );

  const insecureResources = (html.match(/(?:src|href)\s*=\s*["']http:\/\//gi) ?? []).length;
  add(
    "The page does not request insecure HTTP resources",
    insecureResources === 0,
    "warning",
    insecureResources ? `${insecureResources} insecure resource link(s)` : undefined,
    "security",
  );

  add(
    "The served document is reasonably lean",
    html.length <= 750_000,
    "warning",
    `${Math.round(html.length / 1024)} KB HTML`,
    "technical",
  );
  const placeholder = PLACEHOLDER.exec(body);
  add(
    "No draft or placeholder text is showing",
    !placeholder,
    "critical",
    placeholder ? `found "${placeholder[0]}"` : undefined,
    "content",
  );

  const links = new Set<string>();
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    const href = attr(tag, "href");
    if (!href || href.startsWith("#") || !href.startsWith("/")) continue;
    links.add(href.split("#")[0] ?? href);
  }

  return { checks, links: [...links].slice(0, 25) };
}

/** Turns every page's checks into the single report the owner is shown. */
export function summarise(checks: Check[]): VerificationReport {
  const notChecked = checks.filter((check) => check.notChecked).length;
  const failures = checks.filter((check) => !check.ok && !check.notChecked);
  const critical = failures.filter((check) => check.severity === "critical").length;
  const warnings = failures.length - critical;
  const passed = checks.filter((check) => check.ok && !check.notChecked).length;
  const categories: Record<VerificationCategory, { passed: number; failed: number }> = {
    content: { passed: 0, failed: 0 },
    seo: { passed: 0, failed: 0 },
    accessibility: { passed: 0, failed: 0 },
    conversion: { passed: 0, failed: 0 },
    technical: { passed: 0, failed: 0 },
    security: { passed: 0, failed: 0 },
  };
  for (const check of checks) {
    if (check.notChecked) continue;
    const category = check.category ?? "technical";
    if (check.ok) categories[category].passed += 1;
    else categories[category].failed += 1;
  }
  const totalWeight = checks.reduce((sum, check) => sum + (check.severity === "critical" ? 2 : 1), 0);
  const failedWeight = failures.reduce((sum, check) => sum + (check.severity === "critical" ? 2 : 1), 0);
  const score = totalWeight ? Math.max(0, Math.round(100 - (failedWeight / totalWeight) * 100)) : 0;
  const status = notChecked || !checks.length ? "incomplete" : failures.length ? "issues" : "passed";
  const summary = critical
    ? `${critical} critical issue${critical === 1 ? "" : "s"} require attention before this page is considered verified.`
    : notChecked
      ? `Verification incomplete: ${notChecked} check${notChecked === 1 ? "" : "s"} could not run. Nothing is claimed about those results.`
    : warnings
      ? `Served-page checks found ${warnings} issue${warnings === 1 ? "" : "s"}; rendered layouts and interactions still need checking.`
      : checks.length
        ? "Served-page checks passed. Rendered layouts, images and form submissions were not tested here."
        : "No pages could be checked.";
  return { checks, critical, warnings, passed, score, categories, summary, evidence: "served_html", status, notChecked };
}
