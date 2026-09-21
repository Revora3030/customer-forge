/**
 * PROJECT UNDERSTANDING LAYER — the agent's memory of a workspace.
 *
 * Rebuilding the whole picture of a website on every message is slow and
 * expensive, and it is why an agent feels like it keeps starting from scratch.
 * This module keeps the assembled workspace picture for a short window, hands
 * the planner a compact summary instead of the whole tree where a summary is
 * enough, and is invalidated the moment anything is written.
 *
 * Server-only and per-instance: it is a cache, never a source of truth. Every
 * write path still reads the database directly and clears the entry.
 */

import { formatLocality, formatServiceArea } from "@/lib/locality";
import type { AgentContext } from "@/lib/site-agent.server";

type Entry = { context: AgentContext; at: number };

/** Short on purpose: a stale picture is worse than a slightly slower plan. */
const TTL_MS = 45_000;
const MAX_ENTRIES = 200;

const cache = new Map<string, Entry>();

/** Drops a workspace's picture. Call this after any write to its website. */
export function invalidateWorkspaceContext(organizationId: string) {
  cache.delete(organizationId);
}

/**
 * Returns the workspace picture, reusing a recent one when it is still fresh.
 * `load` is only called on a miss, so the caller owns all database access and
 * RLS is never bypassed by the cache.
 */
export async function getWorkspaceContext(
  organizationId: string,
  load: () => Promise<AgentContext>,
  options: { refresh?: boolean } = {},
): Promise<{ context: AgentContext; cached: boolean }> {
  const existing = cache.get(organizationId);
  if (!options.refresh && existing && Date.now() - existing.at < TTL_MS)
    return { context: existing.context, cached: true };

  const context = await load();
  if (cache.size >= MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(organizationId, { context, at: Date.now() });
  return { context, cached: false };
}

/**
 * A compact description of the workspace for the understanding stage, which
 * needs to know what exists but not every word on every page. Keeping this
 * small is what keeps a simple request cheap.
 */
export function workspaceSummary(context: AgentContext): string {
  const { business, pages } = context;
  const lines = [
    `Business: ${business.name || "unnamed"}${business.industry ? ` (${business.industry})` : ""}`,
    business.city || business.state || business.serviceArea
      ? `Serves: ${[formatLocality(business.city, business.state), formatServiceArea(business.serviceArea)].filter(Boolean).join(", ")}`
      : "Serves: not recorded",
    `Services on file: ${business.services.length ? business.services.map((service) => service.name).join(", ") : "none"}`,
    `Published reviews: ${business.publishedReviewCount}. Photos in the library: ${business.photoCount}.`,
    `Brand set: ${[business.primaryColor, business.accentColor, business.fontPreference].filter(Boolean).length ? "yes" : "no"}`,
    `Pages (${pages.length}):`,
    ...pages.map(
      (page) =>
        `- ${page.title} (/${page.slug})${page.is_visible ? "" : " [hidden]"} — sections: ${
          page.sections.length
            ? page.sections
                .map((section) => `${section.kind}${section.is_visible ? "" : " (hidden)"}`)
                .join(", ")
            : "none"
        }${page.seo_title ? "" : " — no search title"}`,
    ),
  ];
  return lines.join("\n").slice(0, 6000);
}
