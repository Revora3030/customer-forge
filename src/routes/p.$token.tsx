import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPreviewSite } from "@/lib/public-site.functions";
import { PublicSiteView } from "@/components/site/PublicSiteView";
import { PreviewMessage } from "@/components/PreviewMessage";
import { SiteBaseContext } from "@/components/site/site-address-context";
import { ProspectClaimBar } from "@/components/site/ProspectClaimBar";
import { PreviewBeacon } from "@/components/site/PreviewBeacon";
import { DemoPreviewLabel } from "@/components/site/DemoPreviewLabel";
import { prospectLinkState } from "@/lib/prospect-claim.functions";
import { previewHeadTitle } from "@/lib/builder/draft-route";
import { privatePreviewHeaders } from "@/lib/page-cache";
import { isBuilderPreviewLabel } from "@/lib/builder/builder-preview-link";
import { BuilderPreviewMode } from "@/components/site/BuilderPreviewMode";
import { PreviewPasswordGate } from "@/components/PreviewPasswordGate";
import { demoPreviewExpiredCopy } from "@/lib/demo-preview-label";

/**
 * Shareable, time-limited draft preview. The token is checked on the server;
 * an unknown, revoked or expired link answers HTTP 404 with a plain message
 * and nothing else (it used to answer 200, a soft 404).
 */
export type DeadPreviewLink = { reason: string; isProspect: boolean };

/** @deprecated Prefer demoPreviewExpiredCopy; kept as the route's public helper for tests. */
export function deadPreviewCopy({ reason }: DeadPreviewLink): { title: string; body: string; href: string; cta: string } {
  // Item 18: expired and invalid tokens share one plain page + /get-started.
  // isProspect no longer changes the title (that used to address the wrong person).
  return demoPreviewExpiredCopy(reason);
}

export const Route = createFileRoute("/p/$token")({
  loader: async ({ params }) => {
    const result = await getPreviewSite({ data: { token: params.token } });
    // Only a dead link needs to know whether it was a prospect demo; the check
    // returns a single boolean and never fails the page.
    const isProspect =
      !result?.ok || !result.site
        ? await prospectLinkState({ data: { token: params.token } })
            .then((state) => state.isProspect)
            .catch(() => false)
        : false;
    if (!result?.ok || !result.site) {
      throw notFound({ data: { reason: result?.reason ?? "unknown", isProspect } satisfies DeadPreviewLink });
    }
    return { result, isProspect };
  },
  // Never stored by a browser or edge, never indexed, never sent on as a referrer.
  headers: () => privatePreviewHeaders(),
  head: async ({ loaderData }) => {
    const { heroPreloadLinks } = await import("@/lib/site-head");
    return {
      // The opening picture starts downloading with the first HTML bytes.
      links: loaderData?.result?.ok ? heroPreloadLinks(loaderData.result.site?.content?.sections) : [],
      meta: [
        { title: previewHeadTitle(loaderData?.result) },
        {
          name: "description",
          content: "A private, time-limited preview of a website draft built with Revora.",
        },
        { name: "robots", content: "noindex, nofollow" },
        { property: "og:title", content: previewHeadTitle(loaderData?.result) },
        {
          property: "og:description",
          content: "A private preview link for reviewing a website draft.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: PreviewRoute,
  notFoundComponent: PreviewNotFound,
  errorComponent: () => (
    <PreviewMessage {...demoPreviewExpiredCopy("unknown")} />
  ),
});

function PreviewRoute() {
  const { result } = Route.useLoaderData();
  const { token } = Route.useParams();
  if (!result.site) return null;

  // The builder's own link: the draft as the owner edits it, with no
  // prospect bar, no demo disclaimer, and no view beacon (it is not a shared link).
  if (isBuilderPreviewLabel(result.label)) {
    return (
      <BuilderPreviewMode organizationId={result.site.org.id}>
        <SiteBaseContext.Provider value={`/p/${encodeURIComponent(token)}`}>
          <PublicSiteView site={result.site} preview />
        </SiteBaseContext.Provider>
      </BuilderPreviewMode>
    );
  }

  return (
    <SiteBaseContext.Provider value={`/p/${encodeURIComponent(token)}`}>
      <DemoPreviewLabel />
      <PublicSiteView site={result.site} preview />
      <ProspectClaimBar token={token} />
      <PreviewBeacon token={token} page="home" />
    </SiteBaseContext.Provider>
  );
}

function PreviewNotFound({ data }: { data?: unknown }) {
  const { token } = Route.useParams();
  const dead = (data as DeadPreviewLink | undefined) ?? { reason: "unknown", isProspect: false };
  // LOV-6: a locked link asks for its password before anything is shown.
  if (dead.reason === "password") return <PreviewPasswordGate token={token} />;
  return <PreviewMessage {...deadPreviewCopy(dead)} />;
}
