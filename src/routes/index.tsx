import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck,
  Calculator,
  ClipboardCheck,
  Globe,
  LineChart,
  MessageSquare,
  Search,
  Sparkles,
  TrendingDown,
  Users,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { AuthActions, AuthHint } from "@/components/marketing/AuthButtons";
import { DashboardPreview } from "@/components/marketing/DashboardPreview";
import { TRUST_INDUSTRIES, WithoutWith } from "@/components/marketing/Journey";
import { TrustSection } from "@/components/marketing/TrustSection";
import { FounderNote } from "@/components/marketing/SalesCTA";
import { ROICalculator } from "@/components/marketing/ROICalculator";
import { AfterYouStart } from "@/components/marketing/OfferSections";
import { FAQ, FAQ_ITEMS } from "@/components/marketing/FAQ";
import { LongTermValue } from "@/components/marketing/ConversionKit";
import { AiClarity, AutomationFlow, SleepEngine } from "@/components/marketing/AiClarity";
import { ProductTour } from "@/components/marketing/ProductTour";
import { ValueStack } from "@/components/marketing/ValueStack";
import {
  FreeAccessBanner,
  FreeAccessButton,
  FreeAccessSection,
} from "@/components/marketing/FreeAccess";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { INDUSTRIES, industrySlug } from "@/lib/domain";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import { GROWTH_SYSTEM_SCHEMA, LOCAL_BUSINESS_SCHEMA, canonicalLink, ogUrl } from "@/lib/seo";
import { BusinessDetails } from "@/components/marketing/BusinessDetails";
import { VisualComposition } from "@/components/site/VisualComposition";
import { HOMEPAGE_COMPOSITION } from "@/lib/homepage-concept";
import { SiteAddressProvider } from "@/components/site/site-links";
import { getHostSite } from "@/lib/host-site.functions";
import { isPossibleTenantHost } from "@/lib/revora-address";
import { PublicSiteView } from "@/routes/s.$slug";

export const Route = createFileRoute("/")({
  /**
   * The home address is shared: on Revora's own domain it is the marketing
   * site, and on a client's own verified custom domain it is that client's
   * published website.
   */
  loader: async () => {
    if (typeof window !== "undefined" && !isPossibleTenantHost(window.location.hostname)) {
      return null;
    }
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
            { title: "Website coming soon" },
            {
              name: "description",
              content: "This website is being set up and will be online shortly.",
            },
            { name: "robots", content: "noindex" },
          ],
        }
      : loaderData
        ? {
            meta: [
              { title: `${loaderData.site.org.name}`.slice(0, 60) },
              {
                name: "description",
                content: (
                  loaderData.site.profile?.tagline ||
                  `${loaderData.site.org.name} — services, prices and online booking.`
                ).slice(0, 158),
              },
              { property: "og:title", content: loaderData.site.org.name },
              {
                property: "og:description",
                content: (
                  loaderData.site.profile?.tagline ||
                  `${loaderData.site.org.name} — services, prices and online booking.`
                ).slice(0, 158),
              },
              { property: "og:type", content: "website" },
              { property: "og:url", content: `https://${loaderData.host}/` },
              { name: "twitter:card", content: "summary_large_image" },
            ],
            links: [{ rel: "canonical", href: `https://${loaderData.host}/` }],
          }
        : ({
            meta: [
              { title: "Revora — AI Growth Software That Books Local Jobs 24/7" },
              {
                name: "description",
                content:
                  "AI growth software for local service businesses: website, instant quotes, online booking, CRM, follow-up, reviews, local SEO and analytics — in one system.",
              },
              {
                property: "og:title",
                content: "Revora — AI growth software for local service businesses",
              },
              {
                property: "og:description",
                content:
                  "Website, instant quotes, booking, CRM, follow-up, reviews, local SEO and analytics in one AI-run system. Built, launched and managed for you. Try it free for 3 days.",
              },
              { property: "og:type", content: "website" },
              { name: "twitter:card", content: "summary_large_image" },
              ogUrl("/"),
            ],
            links: [canonicalLink("/")],
            scripts: [
              { type: "application/ld+json", children: JSON.stringify(LOCAL_BUSINESS_SCHEMA) },
              { type: "application/ld+json", children: JSON.stringify(GROWTH_SYSTEM_SCHEMA) },
              {
                type: "application/ld+json",
                children: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: FAQ_ITEMS.map((item) => ({
                    "@type": "Question",
                    name: item.q,
                    acceptedAnswer: { "@type": "Answer", text: item.a },
                  })),
                }),
              },
            ],
          } as const),
  component: HomeRoute,
});

/** Client website on a client host, Revora's sales site on Revora's host. */
function HomeRoute() {
  const hostSite = Route.useLoaderData();
  if (hostSite && "pending" in hostSite) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <h1 className="font-display text-[22px] font-semibold">Website coming soon</h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            This website is being set up and will be online shortly.
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

const PROBLEMS = [
  {
    title: "Missed calls",
    body: "Customers ring while you're on a job — 8 in 10 never call back, they call the next name on the list.",
    cost: "Every missed call is a job someone else invoices.",
    fix: "Revora answers instantly on your site, emails the lead back and books them in — while your hands are full.",
  },
  {
    title: "Slow follow-up",
    body: "Interest dies within the hour. By the evening the same person has already said yes to someone faster.",
    cost: "Leads you already paid for go cold in silence.",
    fix: "Automatic first reply in seconds, then a follow-up sequence that nudges the quiet ones until they answer.",
  },
  {
    title: "Lost quotes",
    body: "Estimates get sent from your phone at 9pm, then forgotten by both sides.",
    cost: "Your biggest tickets vanish with no record of why.",
    fix: "Instant on-site quote calculator plus a pipeline that never lets a quote sit unchased.",
  },
  {
    title: "Booking friction",
    body: "People must call during your working hours just to pick a time — so they don't.",
    cost: "You lose the customers who only shop after 8pm.",
    fix: "Real-time booking on your actual availability, with confirmations and reminders sent for you.",
  },
  {
    title: "No visibility",
    body: "You can't tell which ads, searches or referrals actually turned into paid work.",
    cost: "You keep spending on the channel that doesn't pay.",
    fix: "Every lead tracked from first click to invoice, so you double down on what makes money.",
  },
];

/** Every capability stated as the outcome it produces for the owner. */
const OUTCOMES = [
  {
    icon: Globe,
    outcome: "Get chosen instead of scrolled past",
    how: "A fast, industry-specific site with call, quote and book actions on every screen.",
  },
  {
    icon: Calculator,
    outcome: "Win the price-shopper before your competitor calls back",
    how: "An instant quote calculator that returns a real range and captures the lead's answers.",
  },
  {
    icon: CalendarCheck,
    outcome: "Fill your calendar without answering the phone",
    how: "Online booking on your real availability, with confirmations and reminders sent for you.",
  },
  {
    icon: Users,
    outcome: "Stop losing jobs you already paid to attract",
    how: "One pipeline from new to booked, with the follow-ups you owe surfaced first.",
  },
  {
    icon: ClipboardCheck,
    outcome: "Reply in seconds, even mid-job",
    how: "Instant lead alerts plus automatic first replies and nudge sequences.",
  },
  {
    icon: Search,
    outcome: "Show up for more 'service + city' searches every month",
    how: "Service and city pages, schema, sitemap and a health score that says what's next.",
  },
  {
    icon: MessageSquare,
    outcome: "Build the review count that wins the click",
    how: "Automatic review requests after completed jobs, with proof published to your site.",
  },
  {
    icon: LineChart,
    outcome: "Know exactly what the system returned this month",
    how: "Traffic, leads, quotes, bookings and conversion rate by source — no course required.",
  },
];

const HERO_PROOF = [
  ["24/7", "Quoting and booking, even at 2am"],
  ["1 system", "Instead of five subscriptions"],
  ["Done for you", "Built, launched and managed"],
];

function PrimaryCta({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center ${className}`}>
      <FreeAccessButton />
      <Button asChild variant="outline" size="lg">
        <Link to="/growth-assessment">
          See what your business is leaving on the table{" "}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>
      <Button asChild variant="ghost" size="lg">
        <a href="#see-it">{GROWTH_SYSTEM.ctaDemo}</a>
      </Button>
    </div>
  );
}

function PriceLine({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[12.5px] text-muted-foreground ${className}`}>
      <span className="gold-hl">{GROWTH_SYSTEM.fullAccessTrialDays} days free full access</span> ·{" "}
      <span className="font-medium text-foreground">
        {usd(GROWTH_SYSTEM.setupPrice)} one-time setup
      </span>{" "}
      · <span className="gold-hl">first month free</span> · then{" "}
      <span className="font-medium text-foreground">{usd(GROWTH_SYSTEM.monthlyPrice)}/month</span> ·
      Cancel anytime
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
        <section className="hero-aura border-b border-border">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 lg:grid-cols-[1.02fr_0.98fr] lg:items-start lg:gap-10 lg:py-20">
            <div className="hero-stagger min-w-0 lg:pt-4">
              <Pill tone="signal">
                <Sparkles className="size-3.5" aria-hidden="true" /> REVORA™ — AI growth system for
                local businesses
              </Pill>
              <h1 className="mt-5 font-display text-[clamp(2.1rem,5vw,3.5rem)] leading-[1.04] font-semibold tracking-tight">
                Your business books jobs{" "}
                <span className="gold-text">while you're on the job, and while you sleep</span>.
              </h1>
              <p className="mt-3 text-[13px] font-medium tracking-wide text-primary/90">
                The AI growth system that turns your website into your hardest-working employee.
              </p>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                Every call you miss, every quote that goes unchased, every lead that goes quiet is
                money your competitor invoices. Revora's AI runs your entire customer pipeline —{" "}
                <span className="text-foreground">
                  website, quotes, booking, follow-up, reviews and local SEO
                </span>{" "}
                — so the work finds you, books itself, and shows up in your calendar while you work.
              </p>

              {/* The two doors, right in the hero: create an account, or sign
                  back into an existing one. Signed-in visitors see their
                  dashboard here instead. */}
              <AuthActions className="mt-8" />
              <AuthHint className="mt-3" />

              <PrimaryCta className="mt-6" />
              <PriceLine className="mt-4" />
              <FreeAccessBanner className="mt-6 max-w-xl" />

              <dl className="mt-9 grid grid-cols-1 gap-x-6 gap-y-5 border-t border-border pt-6 sm:max-w-lg sm:grid-cols-3">
                {HERO_PROOF.map(([value, label]) => (
                  <div key={label}>
                    <dt className="tnum gold-hl font-display text-[19px] leading-tight font-semibold">
                      {value}
                    </dt>
                    <dd className="mt-1 text-[13px] leading-snug text-muted-foreground">{label}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="preview-stage">
              <DashboardPreview />
            </div>
          </div>
        </section>

        {/* PROBLEM */}
        <section className="border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <p className="eyebrow">The quiet leaks</p>
            <h2 className="mt-2 max-w-3xl font-display text-[clamp(1.5rem,3vw,2.1rem)] leading-tight font-semibold">
              You're not short on interest. You're{" "}
              <span className="gold-text">losing it between the click and the booking</span>.
            </h2>
            <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
              Your customers are ready to book. The only question is who answers first. Here are the
              five leaks that quietly cost local businesses the most work every month — and exactly
              what Revora does about each one, starting on day one of your free access.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {PROBLEMS.map((p) => (
                <Panel key={p.title} className="card-lift flex flex-col p-5">
                  <h3 className="font-display text-[13px] font-bold tracking-[0.12em] uppercase">
                    {p.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{p.body}</p>
                  <p className="mt-3 text-[13px] leading-relaxed font-medium text-destructive">
                    {p.cost}
                  </p>
                  <div className="mt-4 border-t border-primary/25 pt-3">
                    <p className="eyebrow text-primary/90">What Revora does</p>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground">{p.fix}</p>
                  </div>
                </Panel>
              ))}
            </div>
            <div className="mt-8">
              <PrimaryCta />
              <PriceLine className="mt-4" />
            </div>

            <div className="mt-10">
              <WithoutWith />
            </div>
          </div>
        </section>

        {/* INTERACTIVE PRODUCT TOUR */}
        <section id="see-it" className="hero-aura scroll-mt-20 border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <ProductTour />
          </div>
        </section>

        {/* WHAT THE AI ACTUALLY DOES */}
        <section id="ai" className="scroll-mt-20 border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <SectionHeading
              eyebrow="Revora AI"
              title="Exactly what the AI does for you — in plain English"
            />
            <div className="mt-8">
              <AiClarity />
            </div>
          </div>
        </section>

        {/* AUTOMATION VISUAL */}
        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <SectionHeading
              eyebrow="The automation engine"
              title="Every lead gets the same perfect follow-up, automatically"
            />
            <div className="mt-8">
              <AutomationFlow />
            </div>
          </div>
        </section>

        {/* FREE ASSESSMENT FUNNEL */}
        <section className="border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <Panel className="gold-glow grid gap-6 border-primary/35 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div>
                <Pill tone="signal">
                  <TrendingDown className="size-3.5" aria-hidden="true" /> Free growth assessment
                </Pill>
                <h2 className="mt-4 font-display text-[clamp(1.35rem,2.8vw,2rem)] leading-tight font-semibold">
                  See how many customers you're losing — <span className="gold-text">free</span>, in
                  2 minutes.
                </h2>
                <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">
                  Answer a few questions about how leads reach you today. Get your Revora Growth
                  Score, the specific gaps costing you jobs, and an estimate of the revenue slipping
                  past you each month — emailed instantly. No card, no call required.
                </p>
              </div>
              <div className="flex flex-col gap-2.5">
                <Button
                  asChild
                  variant="signal"
                  size="lg"
                  className="h-auto py-3 leading-snug whitespace-normal"
                >
                  <Link to="/growth-assessment">
                    GET MY FREE GROWTH SCORE <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/website-audit">Or get a free website audit</Link>
                </Button>
              </div>
            </Panel>
          </div>
        </section>

        {/* OUTCOMES */}
        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <SectionHeading
              eyebrow="What it does for your business"
              title="Not a feature list — the outcomes you actually want"
            />
            <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {OUTCOMES.map(({ icon: Icon, outcome, how }) => (
                <Panel key={outcome} className="card-lift p-5">
                  <Icon className="size-5 text-primary" aria-hidden="true" />
                  <h3 className="mt-3.5 font-display text-[14.5px] leading-snug font-semibold">
                    {outcome}
                  </h3>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{how}</p>
                </Panel>
              ))}
            </div>
          </div>
        </section>

        {/* GROWS WHILE YOU SLEEP */}
        <section className="border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <SleepEngine />
          </div>
        </section>

        {/* VALUE + PRICING */}
        <section id="pricing" className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <SectionHeading
              eyebrow="Pricing"
              title={`Why ${usd(GROWTH_SYSTEM.setupPrice)} is the easiest decision on this page`}
            />
            <div className="mt-8">
              <ValueStack />
            </div>
            <div className="panel mt-10 grid gap-0 overflow-hidden p-0 md:grid-cols-[1.1fr_1fr]">
              <div className="min-w-0 border-b border-border p-6 sm:p-7 md:border-r md:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-[18px] font-semibold">{GROWTH_SYSTEM.name}</h3>
                  <Pill tone="signal">
                    {GROWTH_SYSTEM.fullAccessTrialDays} days free full access
                  </Pill>
                </div>
                <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-5">
                  <div>
                    <p className="tnum gold-text font-display text-[34px] leading-none font-semibold">
                      {usd(GROWTH_SYSTEM.setupPrice)}
                    </p>
                    <p className="mt-1.5 text-[13px] font-medium">Setup — paid today</p>
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
                <p className="mt-2.5 text-[13px] text-muted-foreground">
                  {GROWTH_SYSTEM.explainer}
                </p>
              </div>
              <div className="min-w-0 bg-background/40 p-6 sm:p-7">
                <p className="eyebrow">Everything included</p>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-1">
                  {GROWTH_SYSTEM.includes.map((feature) => (
                    <li key={feature} className="flex gap-2 text-[13px] text-muted-foreground">
                      <span aria-hidden="true" className="text-primary">
                        ✓
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/pricing"
                  className="mt-5 inline-flex min-h-11 items-center text-[13px] text-primary hover:underline"
                >
                  Full pricing details
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="scroll-mt-20 border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 pt-4 pb-16">
            <AfterYouStart />
          </div>
        </section>

        {/* OPPORTUNITY / LOST REVENUE */}
        <section id="roi" className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <SectionHeading
              eyebrow="Revenue calculator"
              title="What the leaks cost you — and what closing them is worth"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link to="/growth-assessment">
                    Full assessment <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              }
            />
            <div className="mt-8">
              <ROICalculator />
            </div>
          </div>
        </section>

        {/* INDUSTRIES / NICHE PAGES */}
        <section className="border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <SectionHeading
              eyebrow="Built for your trade"
              title="Pick your industry and see the exact system"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link to="/industries">
                    All industries <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              }
            />
            <ul className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {INDUSTRIES.map((industry) => (
                <li key={industry.name}>
                  <Link
                    to="/industries/$slug"
                    params={{ slug: industrySlug(industry.name) }}
                    className="card-lift flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3 text-[13px] transition-colors hover:border-primary/40"
                  >
                    <span className="min-w-0 truncate">{industry.name}</span>
                    <ArrowRight className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
              <span className="text-foreground">Also built for:</span>{" "}
              {TRUST_INDUSTRIES.join(" · ")}.
            </p>
          </div>
        </section>

        {/* TRUST + WHY CLIENTS STAY */}
        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <TrustSection />
            <div className="mt-12">
              <SectionHeading
                eyebrow="The compounding advantage"
                title="It keeps compounding every month you run it"
              />
              <div className="mt-8">
                <LongTermValue />
              </div>
            </div>
          </div>
        </section>

        {/* FREE ACCESS */}
        <section id="free-access" className="scroll-mt-20 border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <FreeAccessSection />
          </div>
        </section>

        {/* FOUNDER */}
        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <FounderNote />
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <SectionHeading eyebrow="FAQ" title="Straight answers before you start" />
            <FAQ />
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="hero-aura">
          <div className="mx-auto max-w-6xl px-4 py-20 text-center">
            <h2 className="mx-auto max-w-2xl font-display text-[clamp(1.6rem,3.5vw,2.4rem)] leading-tight font-semibold">
              The only website you'll ever have to think about again.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              Stop losing customers between the first click and the final booking. Website, leads,
              quotes, bookings, follow-up, reviews and analytics — one system, running around the
              clock.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4">
              <PrimaryCta className="justify-center" />
              <PriceLine />
              <p className="text-[12.5px] text-muted-foreground">
                Not ready to pay yet?{" "}
                <span className="gold-hl">
                  Start with {GROWTH_SYSTEM.fullAccessTrialDays} free days of full access
                </span>{" "}
                and decide after you've used it.
              </p>
            </div>
          </div>
        </section>

        <BusinessDetails />
      </main>

      <SiteFooter />
    </div>
  );
}
