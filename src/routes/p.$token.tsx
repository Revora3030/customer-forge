import { createFileRoute } from "@tanstack/react-router";
import { getPreviewSite } from "@/lib/public-site.functions";
import { PublicSiteView } from "@/routes/s.$slug";

/**
 * Shareable, time-limited draft preview. The token is checked on the server;
 * an unknown, revoked or expired link renders a plain message and nothing else.
 */
export const Route = createFileRoute("/p/$token")({
  loader: async ({ params }) => getPreviewSite({ data: { token: params.token } }),
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

function PreviewMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div>
        <h1 className="font-display text-[22px] font-semibold">{title}</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function PreviewRoute() {
  const result = Route.useLoaderData();

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

  return <PublicSiteView site={result.site} preview />;
}
