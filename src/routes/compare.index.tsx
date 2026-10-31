import { createFileRoute, Link } from "@tanstack/react-router";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { Button } from "@/components/ui/button";
import { SeoMarkdown } from "@/components/marketing/SeoMarkdown";
import { COMPARE_INDEX } from "@/lib/compare";
import { GROWTH_SYSTEM } from "@/lib/offer";
import { safeJsonLd } from "@/lib/json-ld";
import { breadcrumbSchema, canonicalLink, ogUrl, metaDescription, OG_IMAGE_META } from "@/lib/seo";

const TITLE = COMPARE_INDEX.title;
const DESCRIPTION = COMPARE_INDEX.description;

export const Route = createFileRoute("/compare/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: metaDescription(DESCRIPTION) },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ogUrl("/compare"),
      ...OG_IMAGE_META,
    ],
    links: [canonicalLink("/compare")],
    scripts: [
      {
        type: "application/ld+json",
        children: safeJsonLd(
          breadcrumbSchema([
            { name: "Revora", path: "/" },
            { name: "Comparisons", path: "/compare" },
          ]),
        ),
      },
    ],
  }),
  component: CompareHub,
});

function CompareHub() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
        <h1 className="font-editorial text-balance text-[clamp(1.7rem,4vw,2.5rem)] leading-tight">
          {COMPARE_INDEX.h1}
        </h1>
        <SeoMarkdown source={COMPARE_INDEX.body} />
        <div className="mt-10">
          <Button asChild size="lg">
            <Link to="/get-started">Start your system free for {GROWTH_SYSTEM.fullAccessWindow}</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
