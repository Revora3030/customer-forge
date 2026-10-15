import { createFileRoute } from "@tanstack/react-router";
import { getPreviewSite } from "@/lib/public-site.functions";
import { getAcquisitionSitePreview } from "@/lib/jarvis-acquisition-studio.functions";
import { AcquisitionSitePreview } from "@/components/site/AcquisitionSitePreview";
import { PublicSiteView } from "@/routes/s.$slug";
import { PreviewMessage } from "@/components/PreviewMessage";
import { SiteBaseContext } from "@/components/site/site-address-context";

/**
 * Shareable, time-limited draft preview. The token is checked on the server;
 * an unknown, revoked or expired link renders a plain message and nothing else.
 */
export const Route = createFileRoute("/p/$token")({
  loader: async ({ params }) => {
    const acquisition = await getAcquisitionSitePreview({ data: { token: params.token } });
    if (acquisition.found) return { kind: "acquisition" as const, acquisition };
    return { kind: "regular" as const, preview: await getPreviewSite({ data: { token: params.token } }) };
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
  const loaded = Route.useLoaderData();
  const { token } = Route.useParams();

  if (loaded.kind === "acquisition") {
    if (!loaded.acquisition.ok || !loaded.acquisition.site) {
      const reason = loaded.acquisition.reason ?? "unknown";
      const copy = reason === "expired"
        ? { title: "This concept preview has expired", body: "Ask Revora for a refreshed concept preview." }
        : reason === "revoked"
          ? { title: "This concept preview is no longer available", body: "Ask Revora for a fresh preview link." }
          : { title: "This preview link is not available", body: "Check the link or ask Revora for a new one." };
      return <PreviewMessage {...copy} />;
    }
    return <AcquisitionSitePreview token={token} site={loaded.acquisition.site} />;
  }

  const result = loaded.preview;
  if (!result?.ok || !result.site) {
    const reason = result?.reason ?? "unknown";
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
    </SiteBaseContext.Provider>
  );
}
