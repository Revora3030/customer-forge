/**
 * REVORA BROWSER-STYLE QA INTELLIGENCE
 * ====================================
 *
 * Deterministic preflight model for browser-style QA. It converts the
 * existing site map into actionable checks without requiring a browser,
 * network access, database writes, or generated guesses.
 */

import type { AgentContext } from "@/lib/site-agent.server";
import { DEVICES, readBlockStyle } from "@/lib/site-style";
import { isReadable } from "@/lib/readable-color";

export type BrowserQaCheckKind =
  | "page"
  | "navigation"
  | "cta"
  | "form"
  | "mobile"
  | "seo"
  | "accessibility"
  | "richness"
  | "consistency"
  | "readability";

const TEMPLATE_FILLER = /\b(?:lorem ipsum|your business name|your company name|business name here|service name here|insert (?:text|copy|headline)|coming soon)\b|\[(?:business|company|service|city|state|headline|description)(?: name)?\]/i;

export type BrowserQaFinding = {
  kind: BrowserQaCheckKind;
  pageId: string;
  sectionId?: string;
  message: string;
  severity: "info" | "warning";
};

export type BrowserQaReport = {
  score: number;
  checksRun: number;
  findings: BrowserQaFinding[];
  pagesScanned: number;
  sectionsScanned: number;
  conversionPaths: number;
};

const CTA_TERMS = /\b(book|quote|estimate|contact|call|get started|schedule|appointment|buy|start)\b/i;
const FORM_TERMS = /\b(form|contact|lead|signup|sign up|subscribe|booking|appointment)\b/i;
const MOBILE_TERMS = /\b(mobile|responsive|phone|tablet|touch|small screen)\b/i;

type Page = AgentContext["pages"][number];
type Section = Page["sections"][number];

function pages(context: AgentContext): Page[] {
  return context.pages.filter((page) => page.is_visible && !page.noindex);
}

function sections(context: AgentContext): Section[] {
  return pages(context).flatMap((page) => page.sections.filter((section) => section.is_visible));
}

function pageHasInternalDestination(context: AgentContext, url: string): boolean {
  if (url.startsWith("/#") || url.startsWith("#")) return true;
  return context.pages.some((page) => page.is_visible && !page.noindex && (
    url === "/" || url === page.slug || url === `/${page.slug}`
  ));
}

function runRichnessChecks(context: AgentContext, findings: BrowserQaFinding[]): void {
  const visible = pages(context);
  for (const page of visible) {
    const pageSections = page.sections.filter((section) => section.is_visible && section.kind !== "sticky_cta");
    if (pageSections.length < 2) {
      findings.push({ kind: "richness", pageId: page.id, message: "Page has fewer than two meaningful sections.", severity: "warning" });
    }
    const hasOpening = page.slug === "home" || pageSections.some((section) => section.kind === "hero" || section.kind === "intro");
    if (!hasOpening) {
      findings.push({ kind: "richness", pageId: page.id, message: "Interior page has no deliberate opening section.", severity: "warning" });
    }
    const hasAction = pageSections.some((section) => section.components.some((component) => Boolean(component.link_url)));
    if (!hasAction && !pageSections.some((section) => /contact|quote|booking/.test(section.kind))) {
      findings.push({ kind: "cta", pageId: page.id, message: "Page has no clear next action.", severity: "warning" });
    }
    const mediaCount = pageSections.flatMap((section) => section.components).filter((component) => Boolean(component.media_url)).length;
    const artCapable = pageSections.some((section) => ["hero", "intro", "area", "cta", "offer", "guarantee"].includes(section.kind));
    if (mediaCount === 0 && !artCapable) {
      findings.push({ kind: "richness", pageId: page.id, message: "Page has neither assigned media nor a designed artwork composition.", severity: "warning" });
    }
  }

  const anatomy = new Map<string, string[]>();
  for (const page of visible) {
    const key = page.sections.filter((section) => section.is_visible).map((section) => section.kind).join(">");
    anatomy.set(key, [...(anatomy.get(key) ?? []), page.id]);
  }
  for (const ids of anatomy.values()) {
    if (ids.length < 3) continue;
    for (const pageId of ids.slice(2)) findings.push({ kind: "consistency", pageId, message: "Three or more pages repeat the same section anatomy.", severity: "warning" });
  }
}

function runPageChecks(context: AgentContext, findings: BrowserQaFinding[]): void {
  for (const page of pages(context)) {
    if (!page.title?.trim()) {
      findings.push({ kind: "page", pageId: page.id, message: "Visible page has no title.", severity: "warning" });
    }
    if (!page.seo_title?.trim()) {
      findings.push({ kind: "seo", pageId: page.id, message: "Visible page has no SEO title.", severity: "warning" });
    }
    if (!page.seo_description?.trim()) {
      findings.push({ kind: "seo", pageId: page.id, message: "Visible page has no SEO description.", severity: "warning" });
    }
    const pageCopy = [page.title, page.seo_title, page.seo_description].filter(Boolean).join(" ");
    if (TEMPLATE_FILLER.test(pageCopy)) {
      findings.push({ kind: "page", pageId: page.id, message: "Visible page contains unfinished template or placeholder wording.", severity: "warning" });
    }
    for (const section of page.sections.filter((item) => item.is_visible)) {
      const copy = [
        section.heading,
        section.subheading,
        section.body,
        ...section.components.flatMap((component) => [component.label, component.body, component.link_label]),
      ].filter(Boolean).join(" ");
      if (TEMPLATE_FILLER.test(copy)) {
        findings.push({
          kind: "page",
          pageId: page.id,
          sectionId: section.id,
          message: "Visible section contains unfinished template or placeholder wording.",
          severity: "warning",
        });
      }
    }
  }
}

function runNavigationChecks(context: AgentContext, findings: BrowserQaFinding[]): void {
  for (const page of pages(context)) {
    for (const section of page.sections.filter((item) => item.is_visible)) {
      for (const component of section.components) {
        if (!component.link_url || !component.link_url.startsWith("/")) continue;
        if (!pageHasInternalDestination(context, component.link_url)) {
          findings.push({
            kind: "navigation",
            pageId: page.id,
            sectionId: section.id,
            message: `Internal destination ${component.link_url} does not match a visible/indexable page.`,
            severity: "warning",
          });
        }
      }
    }
  }
}

function runConversionChecks(context: AgentContext, findings: BrowserQaFinding[]): number {
  let paths = 0;
  for (const page of pages(context)) {
    const pageSections = page.sections.filter((section) => section.is_visible);
    const hasCta = pageSections.some((section) =>
      section.components.some((component) =>
        CTA_TERMS.test(`${component.label ?? ""} ${component.link_label ?? ""}`) || Boolean(component.link_url),
      ),
    );
    const hasFormSignal = pageSections.some((section) =>
      FORM_TERMS.test(`${section.kind} ${section.heading ?? ""} ${section.body ?? ""}`),
    );
    if (hasCta) paths += 1;
    if (!hasCta && hasFormSignal) {
      findings.push({
        kind: "cta",
        pageId: page.id,
        message: "Page has a conversion/form signal but no detectable CTA destination.",
        severity: "warning",
      });
    }
  }
  return paths;
}

function runAccessibilityChecks(context: AgentContext, findings: BrowserQaFinding[]): void {
  for (const page of pages(context)) {
    for (const section of page.sections.filter((item) => item.is_visible)) {
      if (!section.heading?.trim()) {
        findings.push({
          kind: "accessibility",
          pageId: page.id,
          sectionId: section.id,
          message: "Visible section has no heading signal.",
          severity: "warning",
        });
      }
    }
  }
}

function runMobileChecks(context: AgentContext, instruction: string, findings: BrowserQaFinding[]): void {
  if (!MOBILE_TERMS.test(instruction)) return;
  for (const page of pages(context)) {
    for (const section of page.sections.filter((item) => item.is_visible)) {
      const textLength = [section.heading, section.subheading, section.body].reduce(
        (total, value) => total + (value?.length ?? 0),
        0,
      );
      if (section.components.length > 8 || textLength > 700) {
        findings.push({
          kind: "mobile",
          pageId: page.id,
          sectionId: section.id,
          message: "Section has density or copy signals that warrant mobile interaction testing.",
          severity: "warning",
        });
      }
    }
  }
}

export function runBrowserStyleQa(
  context: AgentContext,
  instruction = "",
): BrowserQaReport {
  const visiblePages = pages(context);
  const visibleSectionCount = sections(context).length;
  const findings: BrowserQaFinding[] = [];

  runPageChecks(context, findings);
  runNavigationChecks(context, findings);
  const conversionPaths = runConversionChecks(context, findings);
  runAccessibilityChecks(context, findings);
  runRichnessChecks(context, findings);
  runMobileChecks(context, instruction, findings);

  const checksRun = Math.max(1, visiblePages.length * 8);
  const penalty = Math.min(100, findings.filter((finding) => finding.severity === "warning").length * 8);
  const score = Math.max(0, 100 - penalty);

  return {
    score,
    checksRun,
    findings,
    pagesScanned: visiblePages.length,
    sectionsScanned: visibleSectionCount,
    conversionPaths,
  };
}

export function browserQaSummary(report: BrowserQaReport): string {
  return `Browser-style QA preflight: ${report.score}/100; ${report.checksRun} checks across ${report.pagesScanned} page(s) and ${report.sectionsScanned} section(s), ${report.findings.length} finding(s).`;
}
