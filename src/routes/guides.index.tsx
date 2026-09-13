import { createFileRoute, Link } from "@tanstack/react-router";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { Button } from "@/components/ui/button";
import { GUIDES } from "@/lib/guides";
import { breadcrumbSchema, canonicalLink, ogUrl } from "@/lib/seo";

const TITLE = "Free local business growth guides — Revora";
const DESCRIPTION =
  "Practical guides for local businesses: getting reviews, showing up in the map pack, replying faster and publishing prices.";

export const Route = createFileRoute("/guides/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ogUrl("/guides"),
    ],
    links: [canonicalLink("/guides")],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(
          breadcrumbSchema([
            { name: "Revora", path: "/" },
            { name: "Guides", path: "/guides" },
          ]),
        ),
      },
    ],
  }),
  component: GuidesIndex,
});

function GuidesIndex() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
        <h1 className="font-display text-[clamp(1.7rem,4vw,2.5rem)] leading-tight font-semibold">
          Free <span className="gold-hl">growth guides</span> for local businesses
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
          Everything here is something you can do yourself this week, whether or not you ever work
          with Revora. No invented statistics, no ranking promises.
        </p>
        <div className="mt-8 space-y-3">
          {GUIDES.map((guide) => (
            <Link
              key={guide.slug}
              to="/guides/$slug"
              params={{ slug: guide.slug }}
              className="block rounded-xl border border-border/60 bg-card/40 p-5 transition hover:border-primary/50"
            >
              <span className="font-display text-[17px] font-semibold">{guide.title}</span>
              <span className="mt-1 block text-[14px] text-muted-foreground">
                {guide.description}
              </span>
              <span className="mt-2 block text-[13px] text-muted-foreground/80">
                {guide.readMinutes} min read
              </span>
            </Link>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/tools">Try the free calculators</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/local">Find your trade and state</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
