import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Sparkles,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { BrandEmblem } from "@/components/brand/Logo";
import { AuthHint } from "@/components/marketing/AuthButtons";
import { HeroStarter } from "@/components/marketing/HeroStarter";
import { ParticleField } from "@/components/marketing/ParticleField";
import { DashboardPreview } from "@/components/marketing/DashboardPreview";
import { FAQ } from "@/components/marketing/FAQ";
import { HOME_HEADLINE, HOME_TRIAL_CHARGE_NOTE, marketingHomeHead } from "@/components/marketing/home-head";
import { ProductTour } from "@/components/marketing/ProductTour";
import { OfferIncludes } from "@/components/marketing/OfferIncludes";
import { SavingsCalculator } from "@/components/marketing/SavingsCalculator";
import { SoftwareComparison } from "@/components/marketing/SoftwareComparison";
import { AiTeam } from "@/components/marketing/AiTeam";
import { Pill, SectionHeading } from "@/components/app/Bits";
import { RouteError } from "@/components/app/RouteStates";
import { Button } from "@/components/ui/button";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import { RelatedLinks } from "@/components/marketing/SeoLinks";
import { VisualComposition } from "@/components/site/VisualComposition";
import { HOMEPAGE_COMPOSITION } from "@/lib/homepage-concept";
import { SiteAddressProvider } from "@/components/site/site-links-context";
import { getHostSite } from "@/lib/host-site.functions";
import { PublicSiteView } from "@/routes/s.$slug";
import { tenantSiteHead } from "@/lib/site-head";

export const Route = createFileRoute("/")({
  /**
   * The home address is shared: on Revora's own domain it is the marketing
   * site, and on a client's own verified custom domain it is that client's
   * published website.
   */
  loader: async () => {
    try {
      const response = await getHostSite({ data: {} });
      if (response?.result) return response.result;
      // The address belongs to a client whose website isn't published yet.
      // Their visitors must never land on Revora's own sales page.
      if (response?.tenant) return { pending: true as const };
      return null;
    } catch {
      return null;
    }
  },
  head: ({ loaderData }) =>
    loaderData && "pending" in loaderData
      ? {
          meta: [
            { title: "Revora Growth Systems" },
            {
              name: "description",
              content:
                "Revora Growth Systems — AI websites and automated customer-growth systems. This address will be online shortly.",
            },
            { property: "og:title", content: "Revora Growth Systems" },
            {
              property: "og:description",
              content:
                "Revora Growth Systems — AI websites and automated customer-growth systems. This address will be online shortly.",
            },
            { name: "robots", content: "noindex" },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
          ],
        }
      : loaderData
        ? tenantSiteHead({
            site: loaderData.site,
            pageSlug: null,
            canonical: `https://${loaderData.host}/`,
            businessUrl: `https://${loaderData.host}/`,
          })
        : marketingHomeHead(),
  component: HomeRoute,
  errorComponent: RouteError,
});

/** Client website on a client host, Revora's sales site on Revora's host. */
function HomeRoute() {
  const hostSite = Route.useLoaderData();
  if (hostSite && "pending" in hostSite) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <h1 className="font-display text-[22px] font-semibold">Revora Growth Systems</h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            This address will be online shortly. Please check back soon.
          </p>
        </div>
      </div>
    );
  }
  if (hostSite?.site)
    return (
      <SiteAddressProvider ownAddress>
        <PublicSiteView site={hostSite.site} />
      </SiteAddressProvider>
    );
  return <Landing />;
}

function PriceLine({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[12.5px] text-muted-foreground ${className}`}>
      <span className="gold-hl">Try everything free for {GROWTH_SYSTEM.fullAccessWindow}, no card.</span>{" "}
      When you launch:{" "}
      <span className="font-medium text-foreground whitespace-nowrap">
        {usd(GROWTH_SYSTEM.setupPrice)} setup
      </span>
      , the first month free, then{" "}
      <span className="font-medium text-foreground whitespace-nowrap">
        {usd(GROWTH_SYSTEM.monthlyPrice)}/month
      </span>
      . Cancel anytime.
    </p>
  );
}

function Landing() {
  return (
    <div className="min-h-screen">
      <VisualComposition composition={HOMEPAGE_COMPOSITION} />
      <SiteHeader />

      <main>
        {/* HERO */}
        <section className="hero-aura relative overflow-hidden border-b border-border">
          <BrandEmblem className="top-6 right-[-1.5rem] sm:top-10 sm:right-6" />
          <ParticleField className="pointer-events-none absolute inset-0 h-full w-full opacity-70" />
          {/* grid-cols-1 pins the mobile column to minmax(0,1fr); without it the
              implicit auto column grows to the widest child's min-content width
              and the hero text is clipped off-screen on phones. */}
          <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-12 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-10 lg:py-24">
            <div className="hero-stagger min-w-0">
              <Pill tone="signal">
                <Sparkles className="size-3.5" aria-hidden="true" /> Revora Growth Systems™
              </Pill>
              <p className="mt-5 text-[10px] font-semibold tracking-[0.18em] text-champagne/80 sm:text-[11px] sm:tracking-[0.32em]">
                BUILD · ATTRACT · AUTOMATE · CONVERT · GROW
              </p>
              <h1 className="mt-3 font-editorial text-[38px] leading-[1.02] sm:text-[60px] text-balance">
                {HOME_HEADLINE}
              </h1>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                AI-designed business websites with{" "}
                <span className="text-foreground">lead capture, quotes, booking, CRM and follow-up</span>.
                Bring your online presence and customer enquiries together in one growth system.
              </p>

              {/* The two doors, right in the hero: create an account, or sign
                  back into an existing one. Signed-in visitors see their
                  dashboard here instead. One CTA stack only — the repeated
                  banner and price block live further down the page. */}
              <HeroStarter className="mt-6 max-w-xl" />
              <PriceLine className="mt-4" />
              <AuthHint className="mt-2" />

            </div>
            <div className="preview-stage dashboard-3d-stage hidden lg:block">
              <div className="preview-orbit" aria-hidden="true">
                <span className="preview-orbit-dot" />
              </div>
              <DashboardPreview />
              <div className="hero-live-badge" role="group" aria-label="Example dashboard">
                <span className="hero-live-dot" aria-hidden="true" />
                <span>EXAMPLE DASHBOARD</span>
                <span className="hero-live-divider" aria-hidden="true" />
                <span className="text-muted-foreground">sample numbers</span>
              </div>
            </div>
          </div>
        </section>

        {/* INTERACTIVE PRODUCT TOUR */}
        <section id="see-it" className="hero-aura scroll-mt-20 border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <ProductTour />
          </div>
        </section>

        {/* THE AI TEAM */}
        <section id="ai-team" className="scroll-mt-20 border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <SectionHeading eyebrow="Your AI team" title="Who designs, writes and checks your website" />
            <div className="mt-6">
              <AiTeam />
            </div>
          </div>
        </section>

        {/* VALUE + PRICING */}
        <section id="pricing" className="scroll-mt-20 border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <SectionHeading
              eyebrow="Pricing"
              title="One clear offer"
            />
            <div className="mt-6 grid gap-0 overflow-hidden p-0 md:grid-cols-[1.1fr_1fr]">
              <div className="min-w-0 border-b border-border p-6 sm:p-7 md:border-r md:border-b-0">
                <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <h3 className="font-display text-[18px] font-semibold">{GROWTH_SYSTEM.name}</h3>
                  <Pill tone="signal">
                    {GROWTH_SYSTEM.fullAccessWindow} free full access
                  </Pill>
                </div>
                <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-5">
                  <div>
                    <p className="tnum gold-text font-display text-[34px] leading-none font-semibold">
                      {usd(GROWTH_SYSTEM.setupPrice)}
                    </p>
                    <p className="mt-1.5 text-[13px] font-medium">One-time setup</p>
                    <p className="text-[13px] text-muted-foreground">{GROWTH_SYSTEM.setupLabel}</p>
                  </div>
                  <div>
                    <p className="tnum font-display text-[34px] leading-none font-semibold">
                      <span className="gold-text">{usd(GROWTH_SYSTEM.monthlyPrice)}</span>
                      <span className="text-[13px] font-normal text-muted-foreground">/month</span>
                    </p>
                    <p className="mt-1.5 text-[13px] font-medium text-primary">First month free</p>
                    <p className="max-w-xs text-[13px] text-muted-foreground">
                      {GROWTH_SYSTEM.monthlyLabel}
                    </p>
                  </div>
                </div>
                <Button
                  asChild
                  variant="signal"
                  size="lg"
                  className="mt-7 h-auto w-full py-3 text-center leading-snug whitespace-normal"
                >
                  <Link to="/get-started">{GROWTH_SYSTEM.ctaShort}</Link>
                </Button>
                <p className="mt-2.5 text-[13px] font-medium text-foreground">
                  {HOME_TRIAL_CHARGE_NOTE}
                </p>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  {GROWTH_SYSTEM.explainer}
                </p>
              </div>
              <OfferIncludes />
            </div>
          </div>
        </section>

        {/* SOFTWARE SAVINGS */}
        <section id="savings" className="scroll-mt-20 border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <SectionHeading eyebrow="Compare" title="What you pay for software today" />
            <div className="mt-6 grid gap-4">
              <SoftwareComparison />
              <SavingsCalculator />
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="scroll-mt-20 border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <SectionHeading eyebrow="Process" title="From your business to your own website" />
            <ol className="mt-6 grid gap-5 sm:grid-cols-3">
              {[['01', 'Start free', `Create an account and explore for ${GROWTH_SYSTEM.fullAccessWindow}, without a card.`], ['02', 'Build and review', 'Share your business details. Review your AI-designed pages and make changes.'], ['03', 'Launch when ready', `${usd(GROWTH_SYSTEM.setupPrice)} setup, first month free, then ${usd(GROWTH_SYSTEM.monthlyPrice)}/month.`]].map(([n, title, body]) => (
                <li key={n} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-t border-border pt-4">
                  <span className="text-sm text-primary">{n}</span>
                  <div className="min-w-0"><h3 className="font-semibold">{title}</h3><p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{body}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <SectionHeading eyebrow="FAQ" title="Straight answers before you start" />
            <FAQ />
          </div>
        </section>

        <RelatedLinks path="/" heading="Find the right growth system for your business" />
      </main>

      {/* Spacer so the fixed free-access bar never covers the footer */}
      <div className="h-16" aria-hidden="true" />

      <SiteFooter />
    </div>
  );
}
