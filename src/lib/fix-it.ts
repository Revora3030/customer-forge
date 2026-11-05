/**
 * "Fix it with AI" finding card logic (LOV-5).
 *
 * One shared shape, `{ title, plainReason, scope }`, for every finding the app
 * already computes from the owner's real site (the publish-time security check
 * today; monitor findings and the SEO card can adopt it). Nothing here invents
 * a finding: callers pass real ones in.
 *
 * A fix is only ever a request to the builder chat. The chat edits a draft the
 * owner can undo and never publishes, and the planner's declared scope is
 * enforced by `src/lib/builder/edit-scope.ts`.
 */

import type { EditScopeContext } from "@/lib/builder/edit-scope";

export type FixFinding = {
  title: string;
  plainReason: string;
  /** "site" or "page:<slug>". Anything else is treated as "site". */
  scope: string;
  /** True when only the owner can resolve it (a phone number, a price, a key). */
  needsOwner?: boolean;
};

export type FixScope = { kind: "site" } | { kind: "page"; slug: string };

export function parseFixScope(scope: string): FixScope {
  const match = /^page:([a-z0-9][a-z0-9-_/]*)$/i.exec(scope.trim());
  return match?.[1] ? { kind: "page", slug: match[1].toLowerCase() } : { kind: "site" };
}

/** The scoped request handed to the builder chat. */
export function buildFixRequest(finding: FixFinding): string {
  const scope = parseFixScope(finding.scope);
  const where =
    scope.kind === "page"
      ? `Only change the "${scope.slug}" page. Do not change any other page.`
      : "Keep the change as small as possible and only touch what this problem needs.";
  return [
    `Please fix this problem on my website: ${finding.title}.`,
    finding.plainReason,
    where,
    "Make it a draft I can undo. Do not publish.",
  ].join(" ");
}

/** The AI may only change things that are not the owner's to decide. */
export function isAiFixable(finding: FixFinding): boolean {
  return !finding.needsOwner;
}

/** "Fix all" batches only AI-fixable findings; the rest wait for the owner. */
export function splitFixAll<T extends FixFinding>(
  findings: readonly T[],
): { fixable: T[]; needsOwner: T[] } {
  return {
    fixable: findings.filter(isAiFixable),
    needsOwner: findings.filter((f) => !isAiFixable(f)),
  };
}

/** One request for "Fix all": one block per finding, each with its own scope line. */
export function buildFixAllRequest(findings: readonly FixFinding[]): string {
  return [
    `Please fix these ${findings.length} problems on my website, one at a time, keeping each change inside its own page.`,
    ...findings.map((f, i) => `${i + 1}. ${buildFixRequest(f)}`),
  ].join("\n");
}

/**
 * Turns a finding's scope into the boundary `applyEditScope` enforces, using
 * the live site's pages. Returns null for a whole-site finding (nothing to
 * enforce) or a page that doesn't exist (nothing provable).
 */
export function fixScopeToEditScope(
  scope: string,
  pages: (EditScopeContext["pages"][number] & { slug: string })[],
): { pageIds: string[] } | null {
  const parsed = parseFixScope(scope);
  if (parsed.kind !== "page") return null;
  const slug = parsed.slug === "home" ? "" : parsed.slug;
  const page = pages.find((p) => p.slug.replace(/^\/+/, "").toLowerCase() === slug);
  return page ? { pageIds: [page.id] } : null;
}
