import { createFileRoute } from "@tanstack/react-router";
import { getPreviewSite } from "@/lib/public-site.functions";
import { PublicSiteView } from "@/routes/s.$slug";
import { PreviewMessage } from "@/components/PreviewMessage";
import { SiteBaseContext } from "@/components/site/site-address-context";
import { ProspectClaimBar } from "@/components/site/ProspectClaimBar";
import { PreviewBeacon } from "@/components/site/PreviewBeacon";
import { prospectLinkState } from "@/lib/prospect-claim.functions";
import { BUSINESS } from "@/lib/business-identity";

/**
 * Shareable, time-limited draft preview. The token is checked on the server;
 * an unknown, revoked or expired link renders a plain message and nothing else.
 */
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
    return { result, isProspect };
  },
  head: () => ({
    meta: [
      { title: "Website draft preview — Revora" },
      {
        name: "description",
        content: "A private, time-limited preview of a website draft built with Revora.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Website draft preview — Revora" },
      {
        property: "og:description",
        content: "A private preview link for reviewing a website draft.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreviewRoute,
  errorComponent: () => (
    <PreviewMessage title="This preview link isn't valid" body="Ask for a new link." />
  ),
});

function PreviewRoute() {
  const { result, isProspect } = Route.useLoaderData();
  const { token } = Route.useParams();

  if (!result?.ok || !result.site) {
    const reason = result?.reason ?? "unknown";
    // A prospect demo is viewed by the business itself, so "ask the business"
    // would address the wrong person.
    if (isProspect && (reason === "expired" || reason === "revoked")) {
      return (
        <PreviewMessage
          title="This demo link has expired"
          body={`This demo link has expired — email ${BUSINESS.email} for a fresh one.`}
        />
      );
    }
    const copy =
      reason === "expired"
        ? { title: "This preview link has expired", body: "Ask the business for a fresh link." }
        : reason === "revoked"
          ? {
              title: "This preview link was switched off",
              body: "Ask the business for a fresh link.",
            }
          : {
              title: "This preview link isn't valid",
              body: "Check the address, or ask for a new link.",
            };
    return <PreviewMessage {...copy} />;
  }

  return (
    <SiteBaseContext.Provider value={`/p/${encodeURIComponent(token)}`}>
      <PublicSiteView site={result.site} preview />
      <ProspectClaimBar token={token} />
      <PreviewBeacon token={token} page="home" />
    </SiteBaseContext.Provider>
  );
}
