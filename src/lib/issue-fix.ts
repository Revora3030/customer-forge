/**
 * Issue → action router (pure layer).
 *
 * Every finding Revora reports must lead somewhere exact. This module turns an
 * audit issue or conversion gap into a concrete fix target: the builder area
 * that owns it, what is wrong, why it matters, the recommended fix, and the id
 * of the upgrade proposal that can apply it automatically.
 *
 * Nothing here writes. It only decides *where* a fix happens and *whether*
 * Revora can do it without inventing business facts.
 */

import type { AuditIssue, AuditSeverity } from "@/lib/site-audit";
import type { ConversionGap } from "@/lib/conversion-engine";
import type { UpgradeProposal } from "@/lib/auto-upgrade";

/** Builder workspace sections (must match app.website.tsx section keys). */
export type BuilderArea =
  | "overview"
  | "assistant"
  | "pages"
  | "design"
  | "upgrades"
  | "answers"
  | "growth"
  | "launch"
  | "versions";

export type IssueCategory =
  | "conversion"
  | "seo"
  | "content"
  | "design"
  | "mobile"
  | "accessibility"
  | "forms"
  | "business"
  | "publishing"
  | "technical";

export type FixTarget = {
  issueKey: string;
  category: IssueCategory;
  severity: AuditSeverity;
  /** Page or "Site". */
  scope: string;
  title: string;
  whatIsWrong: string;
  whyItMatters: string;
  recommendedFix: string;
  /** Builder area that owns the fix. */
  area: BuilderArea;
  areaLabel: string;
  /** Matching proposal id when Revora can apply it itself. */
  proposalId: string | null;
  pageId?: string;
};

const AREA_LABEL: Record<BuilderArea, string> = {
  overview: "Overview",
  assistant: "Ask Revora",
  pages: "Pages & content",
  design: "Design & media",
  upgrades: "Upgrades",
  answers: "Business answers",
  growth: "Growth & audit",
  launch: "Launch",
  versions: "Versions",
};

const WHY: Record<string, string> = {
  conversion: "Visitors who cannot see an obvious next step leave without contacting you.",
  seo: "Google decides what to show from these fields. Left blank, it guesses — usually badly.",
  content: "Thin pages give neither a visitor nor a search engine a reason to trust the business.",
  design: "Layout and imagery are the first quality signal a stranger judges you on.",
  mobile:
    "Most local-service visitors arrive on a phone; anything broken there is broken for most people.",
  accessibility:
    "Missing descriptions lock out screen-reader users and remove you from image search.",
  forms: "A form that does not capture and route an enquiry loses the lead permanently.",
  business: "Your phone, email, hours and area are the facts customers look for before acting.",
  publishing: "An unpublished or failing page cannot be reached by customers or search engines.",
  technical: "Search engines need this to index and represent the page correctly.",
};

/** Classifies an audit issue and routes it to the builder area that fixes it. */
function classify(issue: AuditIssue): { category: IssueCategory; area: BuilderArea } {
  const key = issue.key;
  if (issue.upgrade === "publish_site" || key.startsWith("live-status"))
    return { category: "publishing", area: "launch" };
  if (
    issue.upgrade === "page_seo" ||
    issue.upgrade === "page_index" ||
    issue.upgrade === "apply_meta"
  )
    return { category: "seo", area: "pages" };
  if (
    key.startsWith("live-title") ||
    key.startsWith("live-desc") ||
    key.startsWith("live-og") ||
    key === "site-meta"
  )
    return { category: "seo", area: "pages" };
  if (key.startsWith("live-canonical") || key.startsWith("live-schema"))
    return { category: "technical", area: "launch" };
  if (key.startsWith("live-alt")) return { category: "accessibility", area: "design" };
  if (key.startsWith("live-cta") || key.startsWith("no-cta"))
    return { category: "conversion", area: "pages" };
  if (key === "no-capture" || issue.upgrade === "add_capture_section")
    return { category: "forms", area: "pages" };
  if (key === "no-trust")
    return { category: "conversion", area: "upgrades" };
  if (key === "no-faq" || issue.upgrade === "add_faq_section")
    return { category: "content", area: "upgrades" };
  if (key.startsWith("thin") || key.startsWith("live-thin") || key === "no-pages")
    return { category: "content", area: "pages" };
  if (key.startsWith("no-h1") || key.startsWith("live-h1"))
    return { category: "content", area: "pages" };
  return { category: "conversion", area: "pages" };
}

/** Finds the proposal that resolves an issue, when one exists. */
function matchProposal(issue: AuditIssue, proposals: UpgradeProposal[]) {
  if (!issue.upgrade) return null;
  const scoped = proposals.find(
    (proposal) =>
      proposal.kind === issue.upgrade && (!issue.pageId || proposal.pageId === issue.pageId),
  );
  const any =
    scoped ?? proposals.find((proposal) => proposal.kind === issue.upgrade && !proposal.pageId);
  return any && any.applyable ? any.id : null;
}

/** Builds the actionable fix target for every audit issue. */
export function fixTargets(issues: AuditIssue[], proposals: UpgradeProposal[]): FixTarget[] {
  return issues.map((issue) => {
    const { category, area } = classify(issue);
    return {
      issueKey: `${issue.key}-${issue.scope}`,
      category,
      severity: issue.severity,
      scope: issue.scope,
      title: issue.title,
      whatIsWrong: issue.detail,
      whyItMatters: WHY[category] ?? WHY["conversion"]!,
      recommendedFix: issue.action,
      area,
      areaLabel: AREA_LABEL[area],
      proposalId: matchProposal(issue, proposals),
      ...(issue.pageId ? { pageId: issue.pageId } : {}),
    };
  });
}

/** Conversion gaps use the same card shape so one list can present everything. */
export function gapTargets(gaps: ConversionGap[]): FixTarget[] {
  return gaps.map((gap) => {
    const wantsBusinessFact = /phone|email|call|text|sms|hours|area/i.test(
      `${gap.title} ${gap.detail}`,
    );
    const area: BuilderArea = wantsBusinessFact ? "answers" : "pages";
    return {
      issueKey: `gap-${gap.key}`,
      category: wantsBusinessFact ? "business" : "conversion",
      severity: gap.severity,
      scope: "Site",
      title: gap.title,
      whatIsWrong: gap.detail,
      whyItMatters: wantsBusinessFact ? WHY["business"]! : WHY["conversion"]!,
      recommendedFix: gap.action,
      area,
      areaLabel: AREA_LABEL[area],
      proposalId: null,
    };
  });
}

export function criticalFirst(targets: FixTarget[]) {
  const rank = (severity: AuditSeverity) =>
    severity === "critical" ? 0 : severity === "warning" ? 1 : 2;
  return [...targets].sort(
    (a, b) => rank(a.severity) - rank(b.severity) || a.title.localeCompare(b.title),
  );
}

/** Deep link into the builder area that owns a fix. */
export function builderLink(area: BuilderArea) {
  return { to: "/app/website", search: { section: area } } as const;
}
