import { useEffect } from "react";
import { trackConversion } from "@/lib/conversion";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { CalendarCheck, Calculator, LineChart, Search, Star, Users } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { AnswerFirst, RelatedLinks } from "@/components/marketing/SeoLinks";
import { SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { INDUSTRIES, industrySlug } from "@/lib/domain";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import { breadcrumbSchema, canonicalLink, ogUrl } from "@/lib/seo";

const BENEFITS = [
  {
    icon: Search,
    title: "Get found on Google",
    body: "Service and city pages, structured data and fast load times tuned for local search.",
  },
  {
    icon: Calculator,
    title: "Instant quotes",
    body: "Visitors answer a few questions and get a real price range — you get a qualified lead.",
  },
  {
    icon: CalendarCheck,
    title: "Online booking",
    body: "Customers book while you're on the job. Confirm or reschedule in two taps.",
  },
  {
    icon: Users,
    title: "Built-in CRM",
    body: "Every lead in one pipeline from first contact to paid customer. Nothing gets lost.",
  },
  {
    icon: Star,
    title: "Review engine",
    body: "Automated review requests after every job build the proof that wins the next customer.",
  },
  {
    icon: LineChart,
    title: "See what's working",
    body: "Know exactly which pages, ads and channels produce paying customers.",
  },
] as const;

export const Route = createFileRoute("/industries/$slug")({
  beforeLoad: ({ params }) => {
    const industry = INDUSTRIES.find((i) => industrySlug(i.name) === params.slug);
    if (!industry) throw notFound();
    return { industry };
  },
  head: ({ match }) => {
    const industry = (match.context as { industry?: (typeof INDUSTRIES)[number] }).industry;
    // An unknown industry is a 404: never advertise it with a real title,
    // canonical URL or business schema, or search engines will index it.
    if (!industry) {
      return {
        meta: [{ title: "Page not found — Revora" }, { name: "robots", content: "noindex" }],
      };
    }
    const name = industry.name;
    const title = `Websites & lead generation for ${name} — Revora`;
    const description = `Revora builds ${name} businesses a website that captures leads, sends instant quotes, books jobs online and automates follow-up. ${usdExact(GROWTH_SYSTEM.setupPrice)} setup, then ${usdExact(GROWTH_SYSTEM.monthlyPrice)}/month.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ogUrl(`/industries/${match.params.slug}`),
      ],
      links: [canonicalLink(`/industries/${match.params.slug}`)],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbSchema([
              { name: "Revora", path: "/" },
              { name: "Industries", path: "/industries" },
              { name, path: `/industries/${match.params.slug}` },
            ]),
          ),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service",
            name: `Revora Growth System for ${name}`,
            provider: { "@type": "Organization", name: "Revora Growth Systems" },
            serviceType: "Website design and lead generation",
            areaServed: "United States",
            audience: { "@type": "BusinessAudience", name },
            offers: {
              "@type": "Offer",
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
  component: IndustryPage,
});

function IndustryPage() {
  useEffect(() => {
    trackConversion("landing_view");
  }, []);
  const { industry } = Route.useRouteContext() as { industry: (typeof INDUSTRIES)[number] };
  const others = INDUSTRIES.filter((i) => i.name !== industry.name).slice(0, 6);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="hero-aura mx-auto max-w-6xl px-4 py-16">
        <p className="eyebrow">For {industry.name}</p>
        <h1 className="mt-2 max-w-3xl font-display text-[clamp(2rem,4.5vw,3rem)] leading-tight font-semibold">
          A website that turns {industry.name.toLowerCase()} searches into booked jobs
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          {industry.emphasis} Revora gives your {industry.name.toLowerCase()} business one system to
          capture every lead, quote instantly, book customers online and follow up automatically —
          so no opportunity slips while you're working.
        </p>
        <AnswerFirst
          question={`What does a ${industry.name.toLowerCase()} growth system include?`}
          answer={`For a ${industry.name.toLowerCase()} business, Revora builds and runs one connected system: a fast local website, instant quotes based on the details you ask for, online booking on your real availability, a CRM holding every lead in one pipeline, automatic first replies and follow-up, review requests after completed jobs, local search content and analytics showing which pages and channels produce paying customers.`}
        />
        <div className="mt-7 flex flex-wrap gap-3">
          <Button asChild variant="signal" size="lg">
            <Link to="/get-started">Get my {industry.name.toLowerCase()} website</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/demo">See the live demo</Link>
          </Button>
        </div>

        <section className="mt-16">
          <SectionHeading
            eyebrow="What you get"
            title={`Everything a ${industry.name.toLowerCase()} business needs to grow`}
          />
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((b) => (
              <div key={b.title} className="panel card-lift p-5">
                <b.icon className="size-5 text-primary" aria-hidden />
                <h2 className="mt-3 font-display text-[15px] font-semibold">{b.title}</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{b.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel mt-14 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-[17px] font-semibold">
              {usdExact(GROWTH_SYSTEM.setupPrice)} setup, then{" "}
              {usdExact(GROWTH_SYSTEM.monthlyPrice)}/month
            </h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Website, CRM, quotes, booking, automations, reviews and analytics — one system, no
              piecemeal tools.
            </p>
          </div>
          <Button asChild variant="signal">
            <Link to="/get-started">Get started</Link>
          </Button>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-[17px] font-semibold">Other trades we build for</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {others.map((i) => (
              <li key={i.name}>
                <Link
                  to="/industries/$slug"
                  params={{ slug: industrySlug(i.name) }}
                  className="panel inline-block px-3.5 py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {i.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <RelatedLinks path={`/industries/${industrySlug(industry.name)}`} />
      </main>
      <SiteFooter />
    </div>
  );
}
