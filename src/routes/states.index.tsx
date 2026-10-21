import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { MapPin } from "lucide-react";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { BusinessDetails } from "@/components/marketing/BusinessDetails";
import { RelatedLinks } from "@/components/marketing/SeoLinks";
import { statesAlphabetical } from "@/lib/us-states";
import { INDUSTRIES, industrySlug } from "@/lib/domain";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import { breadcrumbSchema } from "@/lib/seo";
import { MARKETING_SEARCH, marketingSearchHead } from "@/lib/marketing-seo";
import { trackConversion } from "@/lib/conversion";

export const Route = createFileRoute("/states/")({
  head: () => {
    const states = statesAlphabetical();
    return {
      ...marketingSearchHead(MARKETING_SEARCH.states),
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbSchema([
              { name: "Revora", path: "/" },
              { name: "States we serve", path: "/states" },
            ]),
          ),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "US states Revora serves",
            itemListElement: states.map((state, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: state.name,
              url: `https://revoragrowthsystems.com/states/${state.slug}`,
            })),
          }),
        },
      ],
    };
  },
  component: StatesIndex,
});

function StatesIndex() {
  const states = statesAlphabetical();

  useEffect(() => {
    trackConversion("landing_view", { metadata: { landing: "states_index" } });
  }, []);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 pt-14 pb-10 sm:px-6 sm:pt-20">
          <p className="text-[13px] font-semibold tracking-wide text-primary uppercase">
            Every city · every industry · worldwide
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-[28px] sm:text-[40px] leading-tight font-semibold">
            Business websites and CRM in <span className="gold-hl">all 50 states</span>
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Revora Growth Systems works remotely with businesses across the United States and
            beyond. Connect your website, quote requests, booking, CRM and follow-up in one
            system. Browse your state for listed metros and industry workflows; coverage does
            not imply a local Revora office in each city.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild variant="signal" size="lg">
              <Link to="/get-started">Start free for {GROWTH_SYSTEM.fullAccessWindow}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
          <p className="mt-4 text-[12.5px] text-muted-foreground">
            {usd(GROWTH_SYSTEM.setupPrice)} setup · first month free · then{" "}
            {usd(GROWTH_SYSTEM.monthlyPrice)}/month · cancel anytime
          </p>
        </section>

        <section className="border-y border-border bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <SectionHeading eyebrow="From search to enquiry" title="Match your system to how your business sells" />
            <div className="mt-6 grid gap-6 md:grid-cols-3">
              <article className="border-t border-border pt-4">
                <h3 className="font-semibold">Show your real services and coverage</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">A useful business website answers what you offer, where you work and what the customer should do next. Provide your actual service area, original photos and approved business details; a city name alone is not a local SEO strategy.</p>
                <Link to="/guides/$slug" params={{ slug: "show-up-in-google-map-pack" }} className="mt-3 inline-block text-sm text-primary underline underline-offset-4">Read the local search checklist</Link>
              </article>
              <article className="border-t border-border pt-4">
                <h3 className="font-semibold">Choose a quote or booking workflow</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Contracting work may need a quote request before a visit; appointment-based businesses may start with a booking. Explore the industry pages and CRM workflows to choose a path that fits your services, rather than sending every visitor through the same form.</p>
                <Link to="/crm" className="mt-3 inline-block text-sm text-primary underline underline-offset-4">Explore service business CRM workflows</Link>
              </article>
              <article className="border-t border-border pt-4">
                <h3 className="font-semibold">Review the offer before committing</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Try full access for {GROWTH_SYSTEM.fullAccessWindow}. When you choose to launch, setup is {usd(GROWTH_SYSTEM.setupPrice)} once. The first monthly platform charge is due 30 days after setup, then {usd(GROWTH_SYSTEM.monthlyPrice)} each month unless canceled. SEO is ongoing work, not a guarantee of rankings or customers.</p>
                <Link to="/pricing" className="mt-3 inline-block text-sm text-primary underline underline-offset-4">See setup, subscription and included services</Link>
              </article>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <SectionHeading eyebrow="Service areas" title="Choose your state" />
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {states.map((state) => (
              <li key={state.slug}>
                <Link
                  to="/states/$state"
                  params={{ state: state.slug }}
                  className="flex min-h-[44px] items-start gap-3 rounded-xl border border-border/60 bg-card/40 p-4 transition-colors hover:border-primary/50"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>
                    <span className="block text-[14px] font-medium">{state.name}</span>
                    <span className="mt-1 block text-[13px] text-muted-foreground">
                      {state.metros.slice(0, 3).join(" · ")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <SectionHeading eyebrow="Who it's built for" title="Businesses Revora serves" />
          <ul className="mt-6 flex flex-wrap gap-2">
            {INDUSTRIES.map((industry) => (
              <li key={industry.name}>
                <Link
                  to="/industries/$slug"
                  params={{ slug: industrySlug(industry.name) }}
                  className="flex min-h-[44px] items-center rounded-full border border-border/60 px-4 text-[13px] transition-colors hover:border-primary/50"
                >
                  {industry.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <RelatedLinks path="/states" heading="Plan your next step" />
        <BusinessDetails />
      </main>
      <SiteFooter />
    </div>
  );
}
