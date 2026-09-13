import { loadTenantPage, tenantPageHead, TenantOrMarketing } from "@/lib/tenant-page";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ShieldCheck } from "lucide-react";
import { FreeAccessBanner } from "@/components/marketing/FreeAccess";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { Pill } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { SalesCTA } from "@/components/marketing/SalesCTA";
import {
  AfterYouStart,
  TrialBadge,
  ValueSplit,
  WhyRevora,
} from "@/components/marketing/OfferSections";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import { getPublicOfferRates } from "@/lib/offer.functions";
import { GROWTH_SYSTEM_SCHEMA, breadcrumbSchema, canonicalLink, ogUrl } from "@/lib/seo";
import { useExperiment } from "@/lib/experiments.hooks";
import { trackConversion } from "@/lib/conversion";

export const Route = createFileRoute("/pricing")({
  // On a client's own web address this path is THEIR page, not Revora's.
  loader: () => loadTenantPage("pricing"),
  head: ({ loaderData }) =>
    tenantPageHead(loaderData ?? null) ?? {
      meta: [
        { title: "Pricing — Revora Growth System | $750 setup + $100/mo" },
        {
          name: "description",
          content:
            "$750 one-time setup + $100/month, first month free. Website, lead capture, CRM, booking, quotes, follow-up, reviews, local SEO, analytics and support.",
        },
        { property: "og:title", content: "Pricing — Revora Growth System" },
        {
          property: "og:description",
          content:
            "$750 one-time setup + first month free + $100/month afterward. One complete growth system.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ogUrl("/pricing"),
      ],
      links: [canonicalLink("/pricing")],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(GROWTH_SYSTEM_SCHEMA) },
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbSchema([
              { name: "Revora", path: "/" },
              { name: "Pricing", path: "/pricing" },
            ]),
          ),
        },
      ],
    },
  component: PricingRoute,
});

/** Revora's page on Revora's address; the client's page on a client address. */
function PricingRoute() {
  const tenant = Route.useLoaderData();
  return (
    <TenantOrMarketing tenant={tenant}>
      <Pricing />
    </TenantOrMarketing>
  );
}

const FAQ = [
  {
    q: "What does the $750 setup cover?",
    a: "The initial build, customization, configuration and launch of your system: website, domain setup, lead capture, CRM, booking, quote flow, follow-up automation, local SEO foundation and analytics. It is charged today.",
  },
  {
    q: "What does the $100/month cover?",
    a: "Ongoing platform access, automation, hosting and system management, maintenance, website updates, reporting, optimization and technical support. Your first 30 days are free, then $100/month unless canceled.",
  },
  {
    q: "Can I use my own domain?",
    a: "Yes. Domain connection and setup is included — start with your Revora platform preview, then connect your own domain whenever you're ready.",
  },
  {
    q: "Can I cancel?",
    a: "Any time, from billing settings. You keep access until the end of the period you've paid for, and your data is preserved.",
  },
];

function Pricing() {
  // A/B test: which pricing arrangement converts better.
  const layout = useExperiment("pricing_layout");
  const split = layout === "split";
  // Shown prices come from the same live offer record checkout validates
  // against, so this page can never advertise a price Stripe won't charge.
  const ratesFn = useServerFn(getPublicOfferRates);
  const rates = useQuery({
    queryKey: ["public-offer-rates"],
    queryFn: () => ratesFn({}),
    staleTime: 5 * 60 * 1000,
  });
  const setupPrice = rates.data?.setupPrice ?? GROWTH_SYSTEM.setupPrice;
  const monthlyPrice = rates.data?.monthlyPrice ?? GROWTH_SYSTEM.monthlyPrice;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="hero-aura mx-auto max-w-5xl px-4 py-16">
        <p className="eyebrow">Pricing</p>
        <h1 className="mt-2 font-display text-[clamp(2rem,4vw,2.8rem)] leading-tight font-semibold">
          {GROWTH_SYSTEM.headline}
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          {GROWTH_SYSTEM.positioning}
        </p>
        <div className="mt-5">
          <TrialBadge />
        </div>

        <section className="panel card-lift mt-10 overflow-hidden p-0">
          <div className={`grid gap-0 ${split ? "md:grid-cols-[1.1fr_1fr]" : ""}`}>
            <div
              className={`min-w-0 border-b border-border p-6 sm:p-7 ${
                split ? "md:border-r md:border-b-0" : ""
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-[20px] font-semibold">{GROWTH_SYSTEM.name}</h2>
                <Pill tone="signal">Complete system</Pill>
              </div>

              <div className="mt-7 flex flex-wrap items-end gap-x-8 gap-y-5">
                <div>
                  <p className="tnum gold-text font-display text-[40px] leading-none font-semibold">
                    {usdExact(setupPrice)}
                  </p>
                  <p className="mt-1.5 text-[13px] font-medium">Setup</p>
                  <p className="text-[13px] text-muted-foreground">{GROWTH_SYSTEM.setupLabel}</p>
                </div>
                <div>
                  <p className="tnum font-display text-[40px] leading-none font-semibold">
                    <span className="gold-text">{usdExact(monthlyPrice)}</span>
                    <span className="text-[14px] font-normal text-muted-foreground">/month</span>
                  </p>
                  <p className="mt-1.5 text-[13px] font-medium">Ongoing</p>
                  <p className="max-w-xs text-[13px] text-muted-foreground">
                    {GROWTH_SYSTEM.monthlyLabel}
                  </p>
                </div>
              </div>

              <Button
                asChild
                variant="signal"
                size="lg"
                className="mt-8 h-auto w-full py-3 text-center leading-snug whitespace-normal"
              >
                <Link
                  to="/get-started"
                  onClick={() =>
                    trackConversion("cta_click", { metadata: { location: "pricing_primary" } })
                  }
                >
                  {GROWTH_SYSTEM.ctaPrimary}
                </Link>
              </Button>
              <div className="mt-3">
                <FreeAccessBanner />
              </div>
              <p className="mt-2.5 text-[13px] text-muted-foreground">
                {GROWTH_SYSTEM.ctaSecondary}
              </p>
              <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                {GROWTH_SYSTEM.explainer}
              </p>
            </div>

            <div className="min-w-0 bg-card/40 p-6 sm:p-7">
              <p className="eyebrow">Everything included</p>
              <ul className="mt-4 space-y-2.5">
                {GROWTH_SYSTEM.includes.map((feature) => (
                  <li key={feature} className="flex gap-2 text-[13px] text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <ValueSplit />
        <WhyRevora />
        <AfterYouStart />

        <section className="mt-16" id="faq">
          <h2 className="font-display text-[19px] font-semibold">Questions owners actually ask</h2>
          <dl className="mt-5 grid gap-3 md:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q} className="panel card-lift p-5">
                <dt className="font-display text-[14px] font-semibold">{item.q}</dt>
                <dd className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="panel card-lift mt-16 p-6">
          <p className="eyebrow">Already a client?</p>
          <h2 className="mt-1 font-display text-[18px] font-semibold">Join your client portal</h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            Your website, leads, bookings, quotes and reporting in one login. Create your account
            and join your workspace yourself with the portal code you were given.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/portal">Open the client portal</Link>
          </Button>
        </section>

        <section className="mt-16">
          <SalesCTA />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
