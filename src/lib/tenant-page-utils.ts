import { notFound } from "@tanstack/react-router";
import { getHostSite, type HostSiteResult } from "@/lib/host-site.functions";
import { canonicalSiteUrl, isPossibleTenantHost } from "@/lib/revora-address";

export async function loadTenantPage(pageSlug: string): Promise<HostSiteResult> {
  if (typeof window !== "undefined" && !isPossibleTenantHost(window.location.hostname)) {
    return null;
  }
  let response: Awaited<ReturnType<typeof getHostSite>> | null = null;
  try {
    response = await getHostSite({ data: { pageSlug } });
  } catch {
    return null;
  }
  if (!response?.tenant) return null;
  if (!response.result?.site?.content) throw notFound();
  return response.result;
}

export function tenantPageHead(result: HostSiteResult) {
  if (!result?.site?.content) return null;
  const page = result.site.content.page;
  const name = result.site.org.name;
  const title = (page.seo_title || `${page.title} — ${name}`).slice(0, 60);
  const description = (
    page.seo_description ||
    result.site.profile?.tagline ||
    `${page.title} from ${name}.`
  ).slice(0, 158);
  const url =
    canonicalSiteUrl(result.site.settings, result.slug, page.slug, page.seo_canonical) ??
    `https://${result.host}/${page.slug}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: page.og_title || title },
      { property: "og:description", content: page.og_description || description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary_large_image" },
      ...(page.noindex ? [{ name: "robots", content: "noindex" }] : []),
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
