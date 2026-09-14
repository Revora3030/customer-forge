import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { CalendarCheck, Calculator, LineChart, Search, Star, Users } from "lucide-react";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { BusinessDetails } from "@/components/marketing/BusinessDetails";
import { BUSINESS, findLocation, type NcLocation } from "@/lib/business-identity";
import { INDUSTRIES, industrySlug } from "@/lib/domain";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import { breadcrumbSchema, canonicalLink, ogUrl } from "@/lib/seo";
import { trackConversion } from "@/lib/conversion";

const PILLARS = [
  {
    icon: Search,
    title: "Found by local searches",
    body: "City and service pages, LocalBusiness data and fast mobile pages so you show up when someone nearby searches.",
  },
  {
    icon: Calculator,
    title: "Instant quotes",
    body: "Visitors answer a few questions and see a real price range. You get a qualified lead with the details already filled in.",
  },
  {
    icon: CalendarCheck,
    title: "Booking that runs itself",
    body: "Customers book against your real availability while you're on a job. Confirm or move it in two taps.",
  },
  {
    icon: Users,
    title: "Every lead in one place",
    body: "Calls, forms, quotes and bookings land in one pipeline with automatic first replies and follow-up.",
  },
  {
    icon: Star,
    title: "Reviews on autopilot",
    body: "Requests go out after each completed job, so your local proof keeps growing without you chasing it.",
  },
  {
    icon: LineChart,
    title: "Know what pays",
    body: "See which pages and channels actually produce paying customers in your area — not just clicks.",
  },
] as const;

export const Route = createFileRoute("/locations/$city")({
  beforeLoad: ({ params }) => {
    const location = findLocation(params.city);
    if (!location) throw notFound();
    return { location };
  },
  head: ({ match }) => {
    const location = (match.context as { location?: NcLocation }).location;
    // Unknown city = 404. Never advertise it with a real title or canonical URL.
    if (!location) {
      return {
        meta: [{ title: "Page not found — Revora" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${location.city}, NC website & lead generation for local businesses — Revora`;
    const description = `Revora builds ${location.city} service businesses a complete customer acquisition system: website, instant quotes, online booking, CRM, follow-up and reviews. ${usdExact(GROWTH_SYSTEM.setupPrice)} setup, then ${usdExact(GROWTH_SYSTEM.monthlyPrice)}/month.`;
    const path = `/locations/${location.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ogUrl(path),
      ],
      links: [canonicalLink(path)],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbSchema([
              { name: "Revora", path: "/" },
              { name: "Locations", path: "/locations" },
              { name: `${location.city}, NC`, path },
            ]),
          ),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service",
            name: `Revora Growth System for ${location.city}, NC businesses`,
            provider: { "@id": "https://revoragrowthsystems.com/#business" },
            serviceType: "Website design, lead generation and customer acquisition systems",
            audience: {
              "@type": "BusinessAudience",
              name: `${location.city} local business owners`,
            },
            areaServed: [
              {
                "@type": "City",
                name: location.city,
                containedInPlace: { "@type": "State", name: "North Carolina" },
              },
              ...location.nearby.map((name) => ({ "@type": "City", name })),
            ],
            offers: {
              "@type": "Offer",
              priceCurrency: "USD",
              priceSpecification: [
                {
                  "@type": "PriceSpecification",
                  price: GROWTH_SYSTEM.setupPrice,
                  priceCurrency: "USD",
                  description: "One-time setup",
                },
                {
                  "@type": "UnitPriceSpecification",
                  price: GROWTH_SYSTEM.monthlyPrice,
                  priceCurrency: "USD",
                  unitText: "MONTH",
                },
              ],
            },
          }),
        },
      ],
    };
  },
  component: LocationPage,
});

function LocationPage() {
  const { location } = Route.useRouteContext() as { location: NcLocation };

  useEffect(() => {
    trackConversion("landing_view", { metadata: { city: location.slug } });
  }, [location.slug]);

  const trades = INDUSTRIES.filter((industry) =>
    (location.trades as readonly string[]).includes(industrySlug(industry.name)),
  );

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 pt-14 pb-10 sm:px-6 sm:pt-20">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-primary">
            {location.county}, North Carolina
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-[clamp(1.7rem,4vw,2.6rem)] leading-tight font-semibold">
            The growth system for <span className="gold-hl">{location.city}</span> business owners
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            People in {location.city} are searching for your service right now. Revora builds the
            website, captures the enquiry, quotes it, books it and follows up — so the job goes to
            you instead of the next name on the list. Also covering {location.nearby.join(", ")}.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button
              asChild
              variant="signal"
              size="lg"
              onClick={() =>
                trackConversion("cta_click", {
                  metadata: { placement: "location_hero", city: location.slug },
                })
              }
            >
              <Link to="/get-started">Start free for {GROWTH_SYSTEM.fullAccessTrialDays} days</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/growth-assessment">Get a free growth assessment</Link>
            </Button>
          </div>
          <p className="mt-4 text-[12.5px] text-muted-foreground">
            {usdExact(GROWTH_SYSTEM.setupPrice)} setup · first month free · then{" "}
            {usdExact(GROWTH_SYSTEM.monthlyPrice)}/month · cancel anytime
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
          <SectionHeading
            eyebrow={`${location.city} businesses`}
            title="What the system does for you"
          />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((pillar) => (
              <div key={pillar.title} className="rounded-xl border border-border/60 bg-card/40 p-5">
                <pillar.icon className="size-5 text-primary" aria-hidden="true" />
                <h3 className="mt-3 font-display text-[15px] font-semibold">{pillar.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {pillar.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {trades.length > 0 ? (
          <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
            <SectionHeading
              eyebrow="Common in this area"
              title={`Trades we build for in ${location.city}`}
            />
            <ul className="mt-6 flex flex-wrap gap-2">
              {trades.map((industry) => (
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
        ) : null}

        <section className="border-y border-border/60 bg-card/30">
          <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6">
            <h2 className="font-display text-[clamp(1.4rem,3vw,2rem)] leading-tight font-semibold">
              Ready to stop losing {location.city} customers?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
              Describe your business in plain words. Revora builds the whole system, you approve it,
              and it goes live on your own domain.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild variant="signal" size="lg">
                <Link to="/get-started">Build my system</Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <a href={`tel:${BUSINESS.tel}`}>Call {BUSINESS.phoneDisplay}</a>
              </Button>
            </div>
          </div>
        </section>

        <BusinessDetails />
      </main>
      <SiteFooter />
    </div>
  );
}
