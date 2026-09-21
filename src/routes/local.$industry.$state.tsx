import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Check } from "lucide-react";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { RelatedLinks } from "@/components/marketing/SeoLinks";
import { Button } from "@/components/ui/button";
import { BUSINESS } from "@/lib/business-identity";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import { breadcrumbSchema, canonicalLink, ogUrl, SITE_URL } from "@/lib/seo";
import { localPageContent, localPath, type LocalPageContent } from "@/lib/local-pages";
import { trackConversion } from "@/lib/conversion";

export const Route = createFileRoute("/local/$industry/$state")({
  beforeLoad: ({ params }) => {
    const content = localPageContent(params.industry, params.state);
    if (!content) throw notFound();
    return { content };
  },
  head: ({ match }) => {
    const content = (match.context as { content?: LocalPageContent }).content;
    if (!content) {
      return {
        meta: [{ title: "Page not found — Revora" }, { name: "robots", content: "noindex" }],
      };
    }
    // This page is one of 743 trade x state variants generated from a single
    // template, so search engines are told the trade hub is the canonical
    // version. The page stays live and useful for visitors and paid traffic.
    const hub = localPath(content.industry.slug);
    return {
      meta: [
        { title: content.title },
        { name: "description", content: content.description },
        { property: "og:title", content: content.title },
        { property: "og:description", content: content.description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ogUrl(hub),
      ],
      links: [canonicalLink(hub)],

      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbSchema([
              { name: "Revora", path: "/" },
              { name: "Local growth systems", path: "/local" },
              { name: content.industry.name, path: localPath(content.industry.slug) },
              { name: content.state.name, path: content.path },
            ]),
          ),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service",
            name: `${content.industry.name} customer acquisition system in ${content.state.name}`,
            serviceType: "Website design, lead generation and CRM for local service businesses",
            provider: {
              "@type": "ProfessionalService",
              name: BUSINESS.legalName,
              telephone: BUSINESS.tel,
              email: BUSINESS.email,
              url: SITE_URL,
            },
            areaServed: [
              { "@type": "State", name: content.state.name },
              ...content.state.metros.map((city) => ({
                "@type": "City",
                name: `${city}, ${content.state.code}`,
              })),
            ],
            offers: {
              "@type": "Offer",
              price: GROWTH_SYSTEM.setupPrice,
              priceCurrency: "USD",
              description: `${usdExact(GROWTH_SYSTEM.setupPrice)} setup, first month free, then ${usdExact(GROWTH_SYSTEM.monthlyPrice)}/month`,
              url: `${SITE_URL}/get-started`,
            },
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: content.faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        },
      ],
    };
  },
  component: LocalIndustryStatePage,
});

function LocalIndustryStatePage() {
  const { content } = Route.useRouteContext() as { content: LocalPageContent };
  const { industry, state } = content;

  useEffect(() => {
    trackConversion("landing_view", {
      metadata: { page: "local", industry: industry.slug, state: state.slug },
    });
  }, [industry.slug, state.slug]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-5xl px-4 pt-14 pb-10 sm:px-6 sm:pt-20">
          <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
            <Link to="/local" className="hover:text-primary">
              Local growth systems
            </Link>
            <span aria-hidden> / </span>
            <Link
              to="/local/$industry"
              params={{ industry: industry.slug }}
              className="hover:text-primary"
            >
              {industry.name}
            </Link>
            <span aria-hidden> / </span>
            <span className="text-foreground">{state.name}</span>
          </nav>
          <h1 className="mt-4 font-display text-[clamp(1.7rem,4vw,2.6rem)] leading-tight font-semibold">
            {industry.name} growth system for <span className="gold-hl">{state.name}</span>
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {content.intro}
          </p>
          <p className="mt-3 max-w-2xl text-[13px] text-muted-foreground/80">{content.metroLine}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/get-started">
                Start your system <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">
            {usdExact(GROWTH_SYSTEM.setupPrice)} one-time setup · first month free · then{" "}
            {usdExact(GROWTH_SYSTEM.monthlyPrice)}/month · cancel anytime
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-14 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {content.sections.map((section) => (
              <article
                key={section.title}
                className="rounded-2xl border border-border/60 bg-card/40 p-5"
              >
                <h2 className="font-display text-[17px] font-semibold">{section.title}</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                  {section.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-14 sm:px-6">
          <h2 className="font-display text-[19px] font-semibold">
            {industry.name} jobs we help you quote and book in {state.name}
          </h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {industry.jobs.map((job) => (
              <li key={job} className="flex items-start gap-2 text-[14px] text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="capitalize">{job}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-14 sm:px-6">
          <h2 className="font-display text-[19px] font-semibold">
            Metro areas we serve in {state.name}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {state.metros.map((metro) => (
              <span
                key={metro}
                className="rounded-full border border-border/60 px-3 py-1 text-[13px] text-muted-foreground"
              >
                {metro}, {state.code}
              </span>
            ))}
          </div>
          <p className="mt-4 text-[13px] text-muted-foreground">
            Also serving every town and county in between — Revora works remotely, so your location
            never limits the build.
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
          <h2 className="font-display text-[19px] font-semibold">
            Questions {state.name} owners ask
          </h2>
          <div className="mt-4 space-y-3">
            {content.faqs.map((faq) => (
              <details
                key={faq.q}
                className="rounded-xl border border-border/60 bg-card/40 p-4 [&_summary]:cursor-pointer"
              >
                <summary className="text-[14px] font-medium">{faq.q}</summary>
                <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
            <h2 className="font-display text-[20px] font-semibold">
              Ready to stop losing {state.name} jobs to whoever answers first?
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-[14px] text-muted-foreground">
              Get 1 day of full access, then {usdExact(GROWTH_SYSTEM.setupPrice)} to launch and
              your first month of the {usdExact(GROWTH_SYSTEM.monthlyPrice)}/month platform fee
              free.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/get-started">Start free</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/local/$industry" params={{ industry: industry.slug }}>
                  Other states for {industry.name}
                </Link>
              </Button>
            </div>
          </div>
        </section>
        <RelatedLinks path={content.path} />
      </main>
      <SiteFooter />
    </div>
  );
}
