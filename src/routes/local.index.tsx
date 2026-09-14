import { createFileRoute, Link } from "@tanstack/react-router";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { Button } from "@/components/ui/button";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import { breadcrumbSchema, canonicalLink, ogUrl } from "@/lib/seo";
import { LOCAL_INDUSTRIES } from "@/lib/local-pages";
import { US_STATES } from "@/lib/us-states";

const TITLE = "Local growth systems by trade and state — Revora";
const DESCRIPTION = `Find the Revora growth system for your trade and your state: website, instant quotes, online booking, CRM, follow-up, reviews and local SEO. ${usdExact(GROWTH_SYSTEM.setupPrice)} setup, first month free, then ${usdExact(GROWTH_SYSTEM.monthlyPrice)}/month. Serving every US state.`;

export const Route = createFileRoute("/local/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ogUrl("/local"),
    ],
    links: [canonicalLink("/local")],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(
          breadcrumbSchema([
            { name: "Revora", path: "/" },
            { name: "Local growth systems", path: "/local" },
          ]),
        ),
      },
    ],
  }),
  component: LocalHub,
});

function LocalHub() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
        <h1 className="font-display text-[clamp(1.7rem,4vw,2.5rem)] leading-tight font-semibold">
          Find your <span className="gold-hl">growth system</span> by trade and state
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Revora builds local service businesses one complete customer acquisition system: a fast
          website, instant quotes, online booking, a CRM that holds every lead, automatic follow-up,
          a review engine and local SEO. Start with your trade, then your state.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/get-started">Start free for 3 days</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/tools">Free calculators</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/guides">Free guides</Link>
          </Button>
        </div>

        <h2 className="mt-12 font-display text-[19px] font-semibold">Trades</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LOCAL_INDUSTRIES.map((industry) => (
            <Link
              key={industry.slug}
              to="/local/$industry"
              params={{ industry: industry.slug }}
              className="rounded-xl border border-border/60 bg-card/40 p-4 transition hover:border-primary/50"
            >
              <span className="font-display text-[16px] font-semibold">{industry.name}</span>
              <span className="mt-1 block text-[13px] text-muted-foreground">
                {industry.jobs.slice(0, 3).join(" · ")}
              </span>
            </Link>
          ))}
        </div>

        <h2 className="mt-12 font-display text-[19px] font-semibold">States we serve</h2>
        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          {US_STATES.map((state) => (
            <li key={state.slug}>
              <Link
                to="/states/$state"
                params={{ state: state.slug }}
                className="text-[14px] text-muted-foreground hover:text-primary"
              >
                {state.name}
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
