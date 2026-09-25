/**
 * Revora AI website auditor (pure layer).
 *
 * Two kinds of checks live here:
 *
 * 1. Structure checks over the stored page → section tree, so the auditor works
 *    before a site is published.
 * 2. Live-page checks over the HTML actually served for a published page, so the
 *    audit reflects what a customer and a search engine really receive.
 *
 * Nothing here guesses. Every issue names the page it was found on and the
 * change that resolves it.
 */

import type { ContentPage } from "@/lib/website-content";
import type { ConversionGoal } from "@/lib/conversion-engine";

export type AuditSeverity = "critical" | "warning" | "opportunity";

export type AuditIssue = {
  key: string;
  /** Human page label, or "Site" for whole-site issues. */
  scope: string;
  title: string;
  detail: string;
  action: string;
  severity: AuditSeverity;
  points: number;
  max: number;
  /** Upgrade this issue can be fixed by, when Revora can do it safely. */
  upgrade?: string;
  pageId?: string;
};

const CAPTURE_SECTIONS = new Set(["quote", "booking", "contact", "lead_magnet"]);
const TRUST_SECTIONS = new Set(["reviews", "trust_bar", "guarantee", "stats", "gallery"]);

const filled = (value: unknown) => typeof value === "string" && value.trim().length > 0;

export type StructureAuditInput = {
  pages: ContentPage[];
  goal?: ConversionGoal | null;
  /** Sections hidden on purpose still count as absent for the visitor. */
  metaDescription: string | null;
  headline: string | null;
};

/** Audits the stored structure page by page. */
export function auditStructure(input: StructureAuditInput) {
  const issues: AuditIssue[] = [];
  const visible = input.pages.filter((page) => page.is_visible !== false);

  if (!visible.length) {
    issues.push({
      key: "no-pages",
      scope: "Site",
      title: "No pages to audit",
      detail: "The website structure has not been generated yet.",
      action: "Run the Revora build to lay out pages and sections from your business information.",
      severity: "critical",
      points: 0,
      max: 12,
      upgrade: "rebuild_site",
    });
    return { issues, pageScores: [] as { pageId: string; title: string; score: number }[] };
  }

  const allKinds = new Set<string>();
  const pageScores: { pageId: string; title: string; score: number }[] = [];

  for (const page of visible) {
    const sections = page.sections.filter((section) => section.is_visible);
    const kinds = new Set(sections.map((section) => section.kind));
    for (const kind of kinds) allKinds.add(kind);
    let earned = 0;
    let max = 0;

    const check = (
      ok: boolean,
      finding: Omit<AuditIssue, "points" | "max" | "scope" | "pageId"> & { weight: number },
    ) => {
      const { weight, ...rest } = finding;
      max += weight;
      if (ok) earned += weight;
      else
        issues.push({
          ...rest,
          scope: page.title,
          pageId: page.id,
          points: 0,
          max: weight,
        });
    };

    check(sections.length >= 3, {
      key: `thin-${page.id}`,
      title: "Thin page",
      detail: `${page.title} has ${sections.length} visible section${sections.length === 1 ? "" : "s"}.`,
      action:
        "Add proof, service detail and a closing call to action — thin pages rank and convert poorly.",
      severity: "warning",
      weight: 3,
      upgrade: "rebuild_site",
    });

    check(filled(sections[0]?.heading) || kinds.has("hero"), {
      key: `no-h1-${page.id}`,
      title: "No headline at the top",
      detail: `${page.title} opens without a hero heading, so visitors don't know what they landed on.`,
      action: "Add a hero section whose heading names the service and the town.",
      severity: "critical",
      weight: 4,
      upgrade: "rebuild_site",
    });

    check(
      kinds.has("cta") ||
        kinds.has("sticky_cta") ||
        [...kinds].some((k) => CAPTURE_SECTIONS.has(k)),
      {
        key: `no-cta-${page.id}`,
        title: "Dead-end page",
        detail: `${page.title} has no call to action or capture block, so a visitor who reaches the bottom has nowhere to go.`,
        action: "Add a closing call-to-action section to this page.",
        severity: "critical",
        weight: 4,
        upgrade: "add_cta_section",
      },
    );

    check(filled(page.seo_title) && filled(page.seo_description), {
      key: `page-seo-${page.id}`,
      title: "Missing page SEO",
      detail: `${page.title} ${filled(page.seo_title) ? "has no search description" : "has no search title"}.`,
      action:
        "Give this page its own search title and description mentioning the service and area.",
      severity: "warning",
      weight: 3,
      upgrade: "page_seo",
    });

    check(page.noindex !== true, {
      key: `noindex-${page.id}`,
      title: "Hidden from search engines",
      detail: `${page.title} is marked noindex, so Google will not list it.`,
      action: "Remove noindex unless this page is intentionally private.",
      severity: "warning",
      weight: 2,
      upgrade: "page_index",
    });

    pageScores.push({
      pageId: page.id,
      title: page.title,
      score: max ? Math.round((earned / max) * 100) : 100,
    });
  }

  /* whole-site structure checks */
  const siteCheck = (
    ok: boolean,
    finding: Omit<AuditIssue, "points" | "max" | "scope"> & { weight: number },
  ) => {
    const { weight, ...rest } = finding;
    if (!ok) issues.push({ ...rest, scope: "Site", points: 0, max: weight });
  };

  siteCheck(
    [...allKinds].some((kind) => CAPTURE_SECTIONS.has(kind)),
    {
      key: "no-capture",
      title: "Nothing captures a lead",
      detail: "No quote, booking or contact block is visible anywhere on the site.",
      action: "Add a quote or booking section so enquiries reach your CRM automatically.",
      severity: "critical",
      weight: 6,
      upgrade: "add_capture_section",
    },
  );

  siteCheck(
    [...allKinds].some((kind) => TRUST_SECTIONS.has(kind)),
    {
      key: "no-trust",
      title: "No proof on the site",
      detail: "No reviews, guarantee, stats or gallery sections are visible.",
      action: "Add reviews or a guarantee block — strangers need proof before they act.",
      severity: "warning",
      weight: 4,
    },
  );

  siteCheck(allKinds.has("faq"), {
    key: "no-faq",
    title: "No FAQ",
    detail: "Common price, timing and coverage questions are unanswered.",
    action: "Add an FAQ section; Revora can draft answers from your services and area.",
    severity: "warning",
    weight: 3,
    upgrade: "add_faq_section",
  });

  siteCheck(filled(input.metaDescription) && filled(input.headline), {
    key: "site-meta",
    title: "Site headline or search description missing",
    detail: "Google needs a title and description for your home page.",
    action: "Set the headline and search description in the website builder.",
    severity: "warning",
    weight: 3,
    upgrade: "apply_meta",
  });

  return { issues, pageScores };
}

/* ------------------------------- live pages ------------------------------- */

export type LivePageResult = {
  url: string;
  path: string;
  status: number;
  issues: AuditIssue[];
  /** Facts observed in the served HTML, shown to the owner as evidence. */
  observed: {
    title: string | null;
    description: string | null;
    h1Count: number;
    wordCount: number;
    telLinks: number;
    smsLinks: number;
    forms: number;
    images: number;
    imagesWithoutAlt: number;
    canonical: boolean;
    ogTitle: boolean;
    jsonLd: boolean;
  };
};

const between = (html: string, re: RegExp) => re.exec(html)?.[1]?.trim() ?? null;

/** Reads the served HTML of one page and reports what a customer/crawler gets. */
export function auditLiveHtml(
  path: string,
  url: string,
  status: number,
  html: string,
): LivePageResult {
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const observed: LivePageResult["observed"] = {
    title: between(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    description:
      between(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
      between(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i),
    h1Count: (html.match(/<h1\b/gi) ?? []).length,
    wordCount: bodyText ? bodyText.split(" ").length : 0,
    telLinks: (html.match(/href=["']tel:/gi) ?? []).length,
    smsLinks: (html.match(/href=["']sms:/gi) ?? []).length,
    forms: (html.match(/<form\b/gi) ?? []).length,
    images: (html.match(/<img\b/gi) ?? []).length,
    imagesWithoutAlt: (html.match(/<img\b(?![^>]*\balt=)[^>]*>/gi) ?? []).length,
    canonical: /rel=["']canonical["']/i.test(html),
    ogTitle: /property=["']og:title["']/i.test(html),
    jsonLd: /application\/ld\+json/i.test(html),
  };

  const issues: AuditIssue[] = [];
  const add = (
    ok: boolean,
    finding: Omit<AuditIssue, "points" | "max" | "scope"> & { weight: number },
  ) => {
    const { weight, ...rest } = finding;
    if (!ok) issues.push({ ...rest, scope: path, points: 0, max: weight });
  };

  if (status >= 400) {
    issues.push({
      key: `live-status-${path}`,
      scope: path,
      title: "Page doesn't load",
      detail: `${url} returned HTTP ${status}.`,
      action: "Republish the site, or remove links pointing at this page.",
      severity: "critical",
      points: 0,
      max: 8,
      upgrade: "publish_site",
    });
    return { url, path, status, issues, observed };
  }

  add(!!observed.title && observed.title.length <= 60, {
    key: `live-title-${path}`,
    title: observed.title ? "Search title too long" : "No search title",
    detail: observed.title
      ? `${observed.title.length} characters — Google truncates near 60.`
      : "The served page has no title tag.",
    action: "Set a page title under 60 characters that names the service and town.",
    severity: "warning",
    weight: 3,
    upgrade: "page_seo",
  });

  add(
    !!observed.description &&
      observed.description.length >= 60 &&
      observed.description.length <= 160,
    {
      key: `live-desc-${path}`,
      title: observed.description ? "Search description off length" : "No search description",
      detail: observed.description
        ? `${observed.description.length} characters — aim for 60 to 160.`
        : "Google will invent its own snippet.",
      action: "Write a 60–160 character description with the service, area and main action.",
      severity: "warning",
      weight: 3,
      upgrade: "page_seo",
    },
  );

  add(observed.h1Count === 1, {
    key: `live-h1-${path}`,
    title: observed.h1Count === 0 ? "No main heading" : "Multiple main headings",
    detail: `${observed.h1Count} H1 heading${observed.h1Count === 1 ? "" : "s"} found in the served HTML.`,
    action: "Use exactly one H1 per page — the promise the visitor came for.",
    severity: "warning",
    weight: 3,
  });

  add(observed.wordCount >= 250, {
    key: `live-thin-${path}`,
    title: "Not enough content to rank",
    detail: `${observed.wordCount} words served.`,
    action: "Add service detail, area coverage and FAQs — aim for 250+ words of real information.",
    severity: "warning",
    weight: 3,
    upgrade: "rebuild_site",
  });

  add(observed.telLinks > 0 || observed.forms > 0, {
    key: `live-cta-${path}`,
    title: "No way to convert on this page",
    detail: "The served page has no tap-to-call link and no form.",
    action: "Add a call button or capture form to this page.",
    severity: "critical",
    weight: 6,
    upgrade: "add_cta_section",
  });

  add(observed.imagesWithoutAlt === 0, {
    key: `live-alt-${path}`,
    title: "Images missing alt text",
    detail: `${observed.imagesWithoutAlt} of ${observed.images} images have no alt text.`,
    action: "Describe each photo — this is required for accessibility and helps image search.",
    severity: "warning",
    weight: 2,
  });

  add(observed.canonical, {
    key: `live-canonical-${path}`,
    title: "No canonical link",
    detail: "Search engines can't tell which URL is authoritative.",
    action: "Publish again after setting the page's canonical URL.",
    severity: "opportunity",
    weight: 1,
  });

  add(observed.ogTitle, {
    key: `live-og-${path}`,
    title: "No social preview",
    detail: "Shared links will show a bare URL.",
    action: "Set the social title and description for this page.",
    severity: "opportunity",
    weight: 1,
    upgrade: "page_seo",
  });

  add(observed.jsonLd, {
    key: `live-schema-${path}`,
    title: "No local business schema",
    detail: "Structured data helps Google show your hours, area and rating.",
    action: "Republish after Revora adds local business schema from your profile.",
    severity: "opportunity",
    weight: 2,
    upgrade: "rebuild_site",
  });

  return { url, path, status, issues, observed };
}

/** Turns any set of issues into a 0–100 score. */
export function auditScore(issues: AuditIssue[], baseline: number) {
  const lost = issues.reduce((sum, issue) => sum + (issue.max - issue.points), 0);
  const total = baseline + lost;
  return total ? Math.max(0, Math.round(((total - lost) / total) * 100)) : 100;
}

export function severityRank(severity: AuditSeverity) {
  return severity === "critical" ? 0 : severity === "warning" ? 1 : 2;
}

export function sortIssues(issues: AuditIssue[]) {
  return [...issues].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity) || b.max - a.max,
  );
}
