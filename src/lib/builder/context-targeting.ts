/**
 * Deterministic target resolution for Site Forge planning.
 *
 * Narrow requests should operate on the page the owner actually named. This
 * helper only scopes already-authorized tenant context; it never queries the
 * database, invents pages, or chooses a homepage fallback for an explicit
 * unmatched target.
 */

import type { AgentContext } from "@/lib/site-agent.server";
import type { BuilderIntent } from "./interpreter";

export type ContextTargetResult =
  | {
      matched: true;
      context: AgentContext;
      pageId: string | null;
      pageTitle: string | null;
      requested: string[];
      scoped: boolean;
    }
  | {
      matched: false;
      context: AgentContext;
      pageId: null;
      pageTitle: null;
      requested: string[];
      scoped: false;
    };

const normalise = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\s+/g, " ");

const slugify = (value: string): string =>
  normalise(value)
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-");

const pageMatches = (page: AgentContext["pages"][number], hint: string): boolean => {
  const wanted = normalise(hint);
  if (!wanted) return false;

  const candidates = [
    page.id,
    page.slug,
    page.title,
    page.kind,
    page.slug.replace(/^\/+/, ""),
  ].map(normalise);

  const wantedSlug = slugify(wanted);
  return candidates.some((candidate) => {
    if (!candidate) return false;
    return candidate === wanted || candidate === wantedSlug || slugify(candidate) === wantedSlug;
  });
};

/**
 * Resolve explicit page hints and scope narrow planning to the matched page.
 * Broad requests deliberately retain the complete context.
 */
export function scopeContextForIntent(
  context: AgentContext,
  intent: BuilderIntent,
): ContextTargetResult {
  const requested = intent.pageHints.map(normalise).filter(Boolean);

  if (intent.wholeSite || intent.everyPage || requested.length === 0) {
    return {
      matched: true,
      context,
      pageId: null,
      pageTitle: null,
      requested,
      scoped: false,
    };
  }

  const page = context.pages.find((candidate) =>
    requested.some((hint) => pageMatches(candidate, hint)),
  );

  if (!page) {
    return {
      matched: false,
      context,
      pageId: null,
      pageTitle: null,
      requested,
      scoped: false,
    };
  }

  return {
    matched: true,
    context: {
      ...context,
      pages: [page],
    },
    pageId: page.id,
    pageTitle: page.title,
    requested,
    scoped: true,
  };
}
