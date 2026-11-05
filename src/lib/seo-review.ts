/**
 * Pure checklist for the owner dashboard SEO & AI search review card (G-A6).
 *
 * Every status is derived from workspace rows already on hand — nothing is
 * guessed, scored as a ranking promise, or written here. Alt-text generation
 * and sitemap/meta fill belong to SEO & Content (CG-16); this only reports
 * what is present and points the owner at the existing Fix screens.
 */
import { parseRobots } from "@/lib/robots";
import type { SiteSeo } from "@/lib/site-seo";

export type SeoReviewStatus = "ok" | "needs_work" | "check";

export type SeoReviewItem = {
  id: "title_desc" | "local_business" | "alt_text" | "sitemap" | "search_console" | "ai_search";
  label: string;
  detail: string;
  status: SeoReviewStatus;
  /** Where the owner edits this — existing routes only. */
  fixTo: "/app/website" | "/app/settings";
  fixSearch?: { section: string };
  fixLabel: string;
};

export type SeoReviewInput = {
  seo: SiteSeo | null | undefined;
  businessName: string | null | undefined;
  profile: {
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null | undefined;
  /** Approved / live image rows for this workspace (alt_text measured only). */
  images: Array<{ alt_text: string | null; status: string }> | null | undefined;
  /** True when website_settings.publish_state === "published". */
  published: boolean;
};

const filled = (value: string | null | undefined) => Boolean(value?.trim());

export function buildSeoReview(input: SeoReviewInput): SeoReviewItem[] {
  const headline = input.seo?.headline?.trim() ?? "";
  const description = input.seo?.meta_description?.trim() ?? "";
  const titleOk = headline.length >= 20 || (filled(input.businessName) && headline.length > 0);
  const descOk = description.length >= 70;
  const titleDesc: SeoReviewItem = {
    id: "title_desc",
    label: "Title & description",
    detail: !headline && !description
      ? "No page title or search description yet."
      : !descOk
        ? headline
          ? `Title is set (${headline.length} characters). Description is ${description.length || "empty"} — aim for about 70–155 characters.`
          : "Add a clear page title and a search description."
        : titleOk
          ? `Title ${headline.length} characters · description ${description.length} characters.`
          : `Title is short (${headline.length} characters). Description looks ready.`,
    status: titleOk && descOk ? "ok" : "needs_work",
    fixTo: "/app/website",
    fixSearch: { section: "seo" },
    fixLabel: "Fix title",
  };

  const profile = input.profile;
  const missing: string[] = [];
  if (!filled(profile?.phone)) missing.push("phone");
  if (!filled(profile?.address) && !filled(profile?.city)) missing.push("address or city");
  if (!filled(profile?.email)) missing.push("email");
  const local: SeoReviewItem = {
    id: "local_business",
    label: "Local business details",
    detail: missing.length
      ? `Missing ${missing.join(", ")} — these feed your LocalBusiness markup.`
      : "Phone, place, and email are on your business profile.",
    status: missing.length ? "needs_work" : "ok",
    fixTo: "/app/settings",
    fixLabel: "Fix profile",
  };

  const images = (input.images ?? []).filter((row) => row.status === "approved" || row.status === "live" || row.status === "accepted");
  // Fall back to every row when status vocabulary differs — still only count real rows.
  const pool = images.length ? images : (input.images ?? []);
  const withAlt = pool.filter((row) => filled(row.alt_text)).length;
  const alt: SeoReviewItem = {
    id: "alt_text",
    label: "Photo descriptions",
    detail: pool.length === 0
      ? "No site photos recorded yet. Auto alt text is handled when SEO & Content generates assets (CG-16)."
      : withAlt === pool.length
        ? `All ${pool.length} recorded photos have a description.`
        : `${withAlt} of ${pool.length} recorded photos have a description. CG-16 fills gaps on generate; you can edit photos under Design.`,
    status: pool.length === 0 ? "check" : withAlt === pool.length ? "ok" : "needs_work",
    fixTo: "/app/website",
    fixSearch: { section: "design" },
    fixLabel: "Fix photos",
  };

  const sitemap: SeoReviewItem = {
    id: "sitemap",
    label: "Sitemap",
    detail: input.published
      ? "Your site is live, so /sitemap.xml is served for search engines."
      : "Publish the site to make /sitemap.xml available. Per-page sitemap entries are filled by SEO & Content (CG-16).",
    status: input.published ? "ok" : "needs_work",
    fixTo: "/app/website",
    fixSearch: { section: "launch" },
    fixLabel: "Go live",
  };

  const gsc: SeoReviewItem = {
    id: "search_console",
    label: "Search Console",
    detail:
      "Open Search settings to read live results from a Google account you have verified. Revora never invents Search Console numbers.",
    status: "check",
    fixTo: "/app/website",
    fixSearch: { section: "seo" },
    fixLabel: "Open Search",
  };

  return [titleDesc, local, alt, sitemap, gsc];
}

/** AI crawlers the AI-search line checks against the site's own robots.txt. */
export const AI_SEARCH_CRAWLERS = ["GPTBot", "ClaudeBot", "PerplexityBot"] as const;

/**
 * What was actually fetched from the published site. `null` = not fetched or
 * the fetch failed (shown as "Not verified", never guessed).
 */
export type AiSearchProbe = {
  /** Home URL of the published site, e.g. https://example.com/s/acme */
  siteUrl: string;
  robotsTxt: string | null;
  /** HTTP status of /llms.txt, or null when it could not be read. */
  llmsStatus: number | null;
} | null;

/** The AI-search line: measured from the live robots.txt and llms.txt only. */
export function buildAiSearchItem(probe: AiSearchProbe): SeoReviewItem {
  const base = { id: "ai_search" as const, label: "AI search access", fixTo: "/app/website" as const, fixSearch: { section: "seo" }, fixLabel: "Open SEO" };
  if (!probe || probe.robotsTxt === null || probe.llmsStatus === null) {
    return { ...base, status: "check", detail: "Not verified. We couldn't read your live robots.txt and llms.txt just now, or the site isn't published yet." };
  }
  const home = `${probe.siteUrl.replace(/\/+$/, "")}/`;
  const policy = parseRobots(new URL("robots.txt", home).toString(), probe.robotsTxt);
  const blocked = AI_SEARCH_CRAWLERS.filter((agent) => !policy.isAllowed(home, agent));
  const llmsOk = probe.llmsStatus === 200;
  if (!blocked.length && llmsOk) {
    return { ...base, status: "ok", detail: `Measured: robots.txt lets ${AI_SEARCH_CRAWLERS.join(", ")} read your home page, and llms.txt (an AI-readable summary) is live.` };
  }
  const problems = [
    ...(blocked.length ? [`robots.txt blocks ${blocked.join(", ")}`] : []),
    ...(llmsOk ? [] : [`llms.txt returned ${probe.llmsStatus}`]),
  ];
  return { ...base, status: "needs_work", detail: `Measured: ${problems.join("; ")}.` };
}
