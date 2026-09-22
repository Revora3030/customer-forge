/**
 * Client portal — "My website".
 *
 * Shows the client their real pages and sections exactly as published, plus
 * every address their site answers on. Read-only on purpose: the builder is
 * where content changes, this is where a client checks what customers see.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, Pencil } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { useWebsiteSettings } from "@/lib/queries";
import { useWebsiteContent } from "@/lib/website-content.hooks";
import { useWorkspace } from "@/lib/use-tenant";
import { clientSiteUrl, customDomainIsLive } from "@/lib/revora-address";
import { relative } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/my/site")({
  head: () => ({
    meta: [
      { title: "My website — pages, sections and addresses" },
      {
        name: "description",
        content:
          "Every page and section of your live Revora website, plus the web addresses customers can use to reach it.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MySite,
});

function MySite() {
  const { data: ws } = useWorkspace();
  const org = ws?.workspace?.organization;
  const orgId = ws?.workspace?.organizationId;
  const { data: settings } = useWebsiteSettings(orgId);
  const { data: pages, isPending } = useWebsiteContent(orgId);

  const live = settings?.publish_state === "published";
  // A client's own domain is only listed as their public address once DNS and
  // HTTPS have both been verified. The Revora share link on the platform domain
  // always works, so it is the fallback primary address.
  const customLive = customDomainIsLive(settings ?? {});
  const custom = settings?.custom_domain ? `https://${settings.custom_domain}` : null;
  const shareable = org?.slug ? (clientSiteUrl(org.slug) ?? `/s/${org.slug}`) : null;

  const addresses = [
    custom && customLive ? { label: "Your own domain", url: custom, primary: true } : null,
    shareable ? { label: "Revora share link", url: shareable, primary: !customLive } : null,
  ].filter(Boolean) as { label: string; url: string; primary: boolean }[];

  return (
    <div className="product-page">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            eyebrow="Website"
            title={live ? "Your website is live" : "Your website isn't live yet"}
            description={
              live
                ? settings?.last_published_at
                  ? `Last published ${relative(new Date(settings.last_published_at))}.`
                  : "Published and reachable."
                : "Finish the setup steps, then press publish in the builder."
            }
          />
          <Pill tone={live ? "signal" : "neutral"}>{live ? "Live" : "Draft"}</Pill>
        </div>

        <ul className="mt-4 space-y-2">
          {addresses.length === 0 ? (
            <li className="text-[13px] text-muted-foreground">
              No address yet — one is created for you when your site is set up.
            </li>
          ) : (
            addresses.map((address) => (
              <li
                key={address.url}
                className="flex flex-wrap items-center justify-between gap-2 product-tile"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">
                    {address.url.replace(/^https:\/\//, "")}
                  </p>
                  <p className="text-[11.5px] text-muted-foreground">{address.label}</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <a href={address.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 h-4 w-4" />
                    Open
                  </a>
                </Button>
              </li>
            ))
          )}
        </ul>
      </Panel>

      <Panel>
        <SectionHeading
          eyebrow="Pages"
          title="What's on your site"
          description="Exactly the pages and sections your customers see."
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/app/website">
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit in builder
              </Link>
            </Button>
          }
        />
        <div className="mt-4 space-y-3">
          {isPending ? (
            <p className="text-[13px] text-muted-foreground">Loading your pages…</p>
          ) : (pages ?? []).length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              No pages yet. Start in the builder and Revora will draft them for you.
            </p>
          ) : (
            (pages ?? []).map((page) => {
              const visible = page.sections.filter((section) => section.is_visible);
              return (
                <div key={page.id} className="product-tile">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px] font-medium">
                      {page.title}
                      <span className="ml-2 text-[11.5px] font-normal text-muted-foreground">
                        {page.slug === "home" ? "/" : `/${page.slug}`}
                      </span>
                    </p>
                    <span className="text-[11.5px] text-muted-foreground">
                      {visible.length} section{visible.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {visible.length > 0 ? (
                    <p className="mt-1.5 text-[12px] text-muted-foreground">
                      {visible.map((section) => section.kind).join(" · ")}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-[12px] text-muted-foreground">
                      Empty — this page is hidden from search until it has content.
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Panel>
    </div>
  );
}
