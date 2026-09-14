import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { CalendarCheck, Calculator, LineChart, Search, Star, Users } from "lucide-react";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { BusinessDetails } from "@/components/marketing/BusinessDetails";
import { BUSINESS } from "@/lib/business-identity";
import { findState, type UsState } from "@/lib/us-states";
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

export const Route = createFileRoute("/states/$state")({
  beforeLoad: ({ params }) => {
    const state = findState(params.state);
    if (!state) throw notFound();
    return { state };
  },
  head: ({ match }) => {
    const state = (match.context as { state?: UsState }).state;
    // Unknown state = 404. Never advertise it with a real title or canonical URL.
    if (!state) {
      return {
        meta: [{ title: "Page not found — Revora" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${state.name} small business websites & lead generation — Revora`;
    const description = `Revora builds ${state.name} service businesses a complete customer acquisition system — website, instant quotes, online booking, CRM and follow-up. Serving ${state.metros.slice(0, 3).join(", ")} and the whole state. ${usdExact(GROWTH_SYSTEM.setupPrice)} setup, first month free, then ${usdExact(GROWTH_SYSTEM.monthlyPrice)}/month.`;
    const path = `/states/${state.slug}`;
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
              { name: "States we serve", path: "/states" },
              { name: state.name, path },
            ]),
          ),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service",
            name: `Customer acquisition system for ${state.name} businesses`,
            serviceType: "Website design and lead generation",
            provider: {
              "@type": "ProfessionalService",
              name: BUSINESS.legalName,
              telephone: BUSINESS.tel,
              email: BUSINESS.email,
              url: "https://revoragrowthsystems.com",
            },
            areaServed: [
              { "@type": "State", name: state.name },
              ...state.metros.map((city) => ({ "@type": "City", name: `${city}, ${state.code}` })),
            ],
            offers: {
              "@type": "Offer",
              price: GROWTH_SYSTEM.setupPrice,
              priceCurrency: "USD",
              description: `${usdExact(GROWTH_SYSTEM.setupPrice)} setup, first month free, then ${usdExact(GROWTH_SYSTEM.monthlyPrice)}/month`,
            },
          }),
        },
      ],
    };
  },
  component: StatePage,
});

function StatePage() {
  const { state } = Route.useRouteContext() as { state: UsState };

  useEffect(() => {
    trackConversion("landing_view", { metadata: { state: state.slug } });
  }, [state.slug]);

  const trades = INDUSTRIES.filter((industry) =>
    (state.trades as readonly string[]).includes(industrySlug(industry.name)),
  );

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 pt-14 pb-10 sm:px-6 sm:pt-20">
          <p className="text-[13px] font-semibold tracking-wide text-primary uppercase">
            Serving {state.name} ({state.code})
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-[clamp(1.7rem,4vw,2.6rem)] leading-tight font-semibold">
            The growth system for <span className="gold-hl">{state.name}</span> business owners
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Customers across {state.name} are searching for your service right now. Revora builds
            the website, captures the enquiry, quotes it, books it and follows up — so the job comes
            to you instead of the next name on the list. Covering {state.metros.join(", ")} and
            every town in between.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button
              asChild
              variant="signal"
              size="lg"
              onClick={() =>
                trackConversion("cta_click", {
                  metadata: { placement: "state_hero", state: state.slug },
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
            eyebrow={`${state.name} businesses`}
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

        <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
          <SectionHeading eyebrow="Areas covered" title={`${state.name} metros and beyond`} />
          <ul className="mt-6 flex flex-wrap gap-2">
            {state.metros.map((city) => (
              <li
                key={city}
                className="rounded-full border border-border/60 bg-card/40 px-4 py-2 text-[13px]"
              >
                {city}, {state.code}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] text-muted-foreground">
            Not listed? Revora works with businesses anywhere in {state.name} — the system is built
            around your real service area, not ours.
          </p>
        </section>

        {trades.length > 0 ? (
          <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
            <SectionHeading
              eyebrow="Strong demand here"
              title={`Trades we build for in ${state.name}`}
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
            <p className="mt-4 text-[13px] text-muted-foreground">
              Every trade Revora builds for is on the{" "}
              <Link to="/states" className="text-primary underline-offset-4 hover:underline">
                full list
              </Link>
              .
            </p>
          </section>
        ) : null}

        <section className="border-y border-border/60 bg-card/30">
          <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6">
            <h2 className="font-display text-[clamp(1.4rem,3vw,2rem)] leading-tight font-semibold">
              Ready to stop losing {state.name} customers?
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
