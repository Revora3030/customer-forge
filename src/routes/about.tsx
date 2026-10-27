import { TenantOrMarketing } from "@/lib/tenant-page";
import { loadTenantPage, tenantPageHead } from "@/lib/tenant-page-utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { SalesCTA } from "@/components/marketing/SalesCTA";
import { Panel } from "@/components/app/Bits";
import { REVORA } from "@/lib/brand";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import { MARKETING_SEARCH, marketingSearchHead } from "@/lib/marketing-seo";
import { RelatedLinks } from "@/components/marketing/SeoLinks";
import { Button } from "@/components/ui/button";
import { breadcrumbSchema } from "@/lib/seo";
import { safeJsonLd } from "@/lib/json-ld";

export const Route = createFileRoute("/about")({
  // On a client's own web address this path is THEIR page, not Revora's.
  loader: () => loadTenantPage("about"),
  head: ({ loaderData }) =>
    tenantPageHead(loaderData ?? null) ?? {
      ...marketingSearchHead(MARKETING_SEARCH.about),
      scripts: [{ type: "application/ld+json", children: safeJsonLd(breadcrumbSchema([{ name: "Revora Growth Systems", path: "/" }, { name: "About", path: "/about" }])) }],
    },
  component: AboutRoute,
});

/** Revora's page on Revora's address; the client's page on a client address. */
function AboutRoute() {
  const tenant = Route.useLoaderData();
  return (
    <TenantOrMarketing tenant={tenant}>
      <About />
    </TenantOrMarketing>
  );
}

const PILLARS = [
  {
    title: "Get discovered",
    body: "AI-designed business pages, service-area content and search metadata built around the services and business details you provide.",
  },
  {
    title: "Capture every opportunity",
    body: "Lead capture, quote requests, booking and CRM workflows bring customer enquiries into a shared workspace.",
  },
  {
    title: "Follow up automatically",
    body: "Configure lead follow-up and review-request workflows for your business. Connected services and customer permissions determine which actions are available.",
  },
  {
    title: "Know what's working",
    body: "Traffic, leads, bookings and conversion rate by source — reported in plain language, not vanity charts.",
  },
];

function About() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="hero-aura border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
            <p className="eyebrow">About Revora</p>
            <h1 className="mt-2 max-w-3xl font-editorial text-balance text-[32px] sm:text-[44px] leading-tight">
              About <span className="gold-text">Revora Growth Systems</span>
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              Revora brings AI-designed business websites, lead capture, quotes, booking,
              CRM and follow-up into one growth platform. Businesses across industries can
              connect their online presence with the work that happens after an enquiry,
              without treating a new website as the entire sales process.
            </p>
            <dl className="mt-10 grid gap-6 border-t border-border pt-6 sm:grid-cols-3">
              {[
                [usd(GROWTH_SYSTEM.setupPrice), "One-time setup when you choose to launch"],
                [`${usd(GROWTH_SYSTEM.monthlyPrice)}/month`, "First month free; first monthly charge 30 days after setup"],
                [GROWTH_SYSTEM.fullAccessWindow, "Free full access before you commit"],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="font-display text-[17px] leading-tight font-semibold">{value}</dt>
                  <dd className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    {label}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild variant="signal"><Link to="/get-started">Try Revora free</Link></Button>
              <Button asChild variant="outline"><Link to="/pricing">See pricing and inclusions</Link></Button>
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <p className="eyebrow">What Revora does</p>
            <h2 className="mt-2 max-w-2xl font-display text-[clamp(1.5rem,3vw,2.1rem)] leading-tight font-semibold">
              Four jobs, one operating system.
            </h2>
            <div className="mt-8 grid gap-3 md:grid-cols-2">
              {PILLARS.map((p) => (
                <Panel key={p.title} className="card-lift p-5">
                  <h3 className="font-display text-[15px] font-semibold">{p.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{p.body}</p>
                </Panel>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <p className="eyebrow text-center">Founder</p>
            <Panel className="mx-auto mt-5 max-w-2xl p-6 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/15 font-display text-[17px] font-semibold text-primary">
                A
              </span>
              <p className="mt-4 font-display text-[17px] font-semibold">{REVORA.founder.name}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{REVORA.founder.role}</p>
              <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
                Revora was created with a simple goal: give businesses a better system for turning
                online attention into real customers — without stitching five subscriptions
                together.
              </p>
            </Panel>
          </div>
        </section>

        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-12">
            <h2 className="font-display text-[24px] font-semibold">Your business facts. Your approval. Your next step.</h2>
            <div className="mt-5 grid gap-6 md:grid-cols-2">
              <p className="text-sm leading-relaxed text-muted-foreground">Start with the services, audience, service areas and brand details that are true for your business. Review the AI-designed pages and request changes before publishing. Quotes depend on the prices you supply, and booking depends on the availability you configure. There is no fixed launch-time promise.</p>
              <p className="text-sm leading-relaxed text-muted-foreground">Search visibility takes more than creating pages. Useful content, accurate business information and a clear enquiry path matter alongside ongoing measurement. Revora does not guarantee a Google position, traffic volume or number of paying customers. Explore the product and compare the offer against the workflow you actually need.</p>
            </div>
            <Link to="/demo" className="mt-5 inline-block py-1 text-sm text-primary underline underline-offset-4">Explore the example product dashboard</Link>
          </div>
        </section>
        <RelatedLinks path="/about" heading="Explore Revora before you decide" />
        <section className="hero-aura bg-card">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SalesCTA />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
