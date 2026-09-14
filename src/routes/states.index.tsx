import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { MapPin } from "lucide-react";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { BusinessDetails } from "@/components/marketing/BusinessDetails";
import { statesAlphabetical } from "@/lib/us-states";
import { INDUSTRIES, industrySlug } from "@/lib/domain";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import { breadcrumbSchema, canonicalLink, ogUrl } from "@/lib/seo";
import { trackConversion } from "@/lib/conversion";

const TITLE = "Small business website & lead generation in all 50 states — Revora";
const DESCRIPTION = `Revora builds service businesses in every US state a complete customer acquisition system: website, instant quotes, online booking, CRM and follow-up. ${usdExact(GROWTH_SYSTEM.setupPrice)} setup, first month free, then ${usdExact(GROWTH_SYSTEM.monthlyPrice)}/month.`;

export const Route = createFileRoute("/states/")({
  head: () => {
    const states = statesAlphabetical();
    return {
      meta: [
        { title: TITLE },
        { name: "description", content: DESCRIPTION },
        { property: "og:title", content: TITLE },
        { property: "og:description", content: DESCRIPTION },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ogUrl("/states"),
      ],
      links: [canonicalLink("/states")],
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
            Nationwide · all 50 states
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-[clamp(1.7rem,4vw,2.6rem)] leading-tight font-semibold">
            Serving local businesses in <span className="gold-hl">every US state</span>
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Revora is remote by design, so where you operate doesn't limit what you get. Describe
            your business, and Revora builds the website, quote calculator, booking, CRM and
            follow-up that turn local searches into paying customers. Pick your state to see the
            trades we build for there.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild variant="signal" size="lg">
              <Link to="/get-started">Start free for {GROWTH_SYSTEM.fullAccessTrialDays} days</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
          <p className="mt-4 text-[12.5px] text-muted-foreground">
            {usdExact(GROWTH_SYSTEM.setupPrice)} setup · first month free · then{" "}
            {usdExact(GROWTH_SYSTEM.monthlyPrice)}/month · cancel anytime
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
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

        <BusinessDetails />
      </main>
      <SiteFooter />
    </div>
  );
}
