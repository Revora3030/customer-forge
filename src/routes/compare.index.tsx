import { createFileRoute, Link } from "@tanstack/react-router";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { Button } from "@/components/ui/button";
import { COMPARISONS } from "@/lib/compare";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import { breadcrumbSchema, canonicalLink, ogUrl } from "@/lib/seo";

const TITLE = "Compare Revora with agencies, DIY builders, bought leads and hiring";
const DESCRIPTION = `Honest side-by-side comparisons of Revora's ${usdExact(GROWTH_SYSTEM.setupPrice)} setup and ${usdExact(GROWTH_SYSTEM.monthlyPrice)}/month growth system against marketing agencies, DIY website builders, lead marketplaces and hiring office help — including when the alternative is the better choice.`;

export const Route = createFileRoute("/compare/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ogUrl("/compare"),
    ],
    links: [canonicalLink("/compare")],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(
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
        <h1 className="font-display text-[clamp(1.7rem,4vw,2.5rem)] leading-tight font-semibold">
          What should you actually <span className="gold-hl">spend money on</span>?
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
          Four honest comparisons, including where the alternative wins. Revora is one system —{" "}
          {usdExact(GROWTH_SYSTEM.setupPrice)} setup, first month free, then{" "}
          {usdExact(GROWTH_SYSTEM.monthlyPrice)}/month, cancel anytime.
        </p>
        <div className="mt-8 space-y-3">
          {COMPARISONS.map((c) => (
            <Link
              key={c.slug}
              to="/compare/$slug"
              params={{ slug: c.slug }}
              className="block rounded-xl border border-border/60 bg-card/40 p-5 transition hover:border-primary/50"
            >
              <span className="font-display text-[17px] font-semibold">{c.label}</span>
              <span className="mt-1 block text-[14px] text-muted-foreground">{c.intro}</span>
            </Link>
          ))}
        </div>
        <div className="mt-10">
          <Button asChild size="lg">
            <Link to="/get-started">Start your system free for 1 day</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
