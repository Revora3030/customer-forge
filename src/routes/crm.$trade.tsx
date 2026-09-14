import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { AnswerFirst, RelatedLinks } from "@/components/marketing/SeoLinks";
import { Button } from "@/components/ui/button";
import { CRM_SOLUTIONS, findCrmSolution, type CrmSolution } from "@/lib/crm-solutions";
import { GROWTH_SYSTEM } from "@/lib/offer";
import { breadcrumbSchema, canonicalLink, ogUrl, SITE_URL } from "@/lib/seo";

export const Route = createFileRoute("/crm/$trade")({
  beforeLoad: ({ params }) => {
    const solution = findCrmSolution(params.trade);
    if (!solution) throw notFound();
    return { solution };
  },
  head: ({ match }) => {
    const solution = (match.context as { solution?: CrmSolution }).solution;
    if (!solution) {
      return {
        meta: [{ title: "Page not found — Revora" }, { name: "robots", content: "noindex" }],
      };
    }
    const path = `/crm/${solution.slug}`;
    return {
      meta: [
        { title: solution.metaTitle },
        { name: "description", content: solution.description },
        { property: "og:title", content: solution.metaTitle },
        { property: "og:description", content: solution.description },
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
              { name: "CRM by trade", path: "/crm" },
              { name: solution.heading, path },
            ]),
          ),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: `Revora Growth System — ${solution.heading}`,
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description: solution.description,
            url: `${SITE_URL}${path}`,
            offers: {
              "@type": "Offer",
              priceCurrency: "USD",
              price: String(GROWTH_SYSTEM.setupPrice),
              description: `One-time setup, then $${GROWTH_SYSTEM.monthlyPrice}/month after the first month free.`,
            },
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: solution.faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        },
      ],
    };
  },
  component: CrmSolutionPage,
});

function CrmSolutionPage() {
  const { solution } = Route.useRouteContext() as { solution: CrmSolution };
  const others = CRM_SOLUTIONS.filter((s) => s.slug !== solution.slug).slice(0, 4);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <Link to="/crm" className="hover:text-primary">
            CRM by trade
          </Link>
          <span aria-hidden> / </span>
          <span className="text-foreground">{solution.label}</span>
        </nav>

        <h1 className="mt-4 font-display text-[clamp(1.6rem,4vw,2.3rem)] leading-tight font-semibold">
          {solution.heading}
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">{solution.intro}</p>

        <AnswerFirst
          question={`What is a CRM for ${solution.trade}?`}
          answer={`A CRM for ${solution.trade} is one place that holds every enquiry — calls, forms, quotes and bookings — and moves each one through the stages of your real job: contacted, quoted, scheduled, completed and paid. Revora adds the parts a generic CRM leaves to you: instant quoting on your own factors, online booking on your availability, automatic follow-up until the customer replies, and a review request after the job is done.`}
        />

        <section className="mt-10">
          <h2 className="font-display text-[19px] font-semibold">
            What actually goes wrong for {solution.trade}
          </h2>
          <div className="mt-4 space-y-3">
            {solution.problems.map((point) => (
              <div key={point.title} className="rounded-2xl border border-border/60 bg-card/40 p-5">
                <h3 className="text-[15px] font-semibold">{point.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                  {point.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-11">
          <h2 className="font-display text-[19px] font-semibold">
            How the Revora system handles it
          </h2>
          <ol className="mt-4 space-y-4">
            {solution.workflow.map((step, i) => (
              <li key={step.title} className="rounded-2xl border border-border/60 bg-card/40 p-5">
                <h3 className="text-[15px] font-semibold">
                  <span className="mr-2 text-primary">{i + 1}.</span>
                  {step.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-11 rounded-2xl border border-border/60 bg-card/40 p-5">
          <h2 className="font-display text-[17px] font-semibold">When something else is better</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            {solution.whenNotUs}
          </p>
        </section>

        <section className="mt-11 rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <h2 className="font-display text-[17px] font-semibold">What it costs</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            {GROWTH_SYSTEM.explainer} Cancel anytime, and your website, customer list and job
            history stay yours and exportable.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/get-started">{GROWTH_SYSTEM.ctaShort}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/pricing">See full pricing</Link>
            </Button>
          </div>
        </section>

        <section className="mt-11">
          <h2 className="font-display text-[19px] font-semibold">Questions people ask</h2>
          <div className="mt-4 space-y-3">
            {solution.faqs.map((faq) => (
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

        <section className="mt-11">
          <h2 className="font-display text-[17px] font-semibold">Other trades</h2>
          <div className="mt-3 flex flex-wrap gap-3 text-[13px]">
            {others.map((other) => (
              <Link
                key={other.slug}
                to="/crm/$trade"
                params={{ trade: other.slug }}
                className="rounded-full border border-border/60 px-3 py-1.5 text-muted-foreground hover:border-primary/50 hover:text-primary"
              >
                {other.heading}
              </Link>
            ))}
            <Link
              to="/crm"
              className="rounded-full border border-border/60 px-3 py-1.5 text-muted-foreground hover:border-primary/50 hover:text-primary"
            >
              All trades
            </Link>
          </div>
        </section>
        <RelatedLinks path={`/crm/${solution.slug}`} />
      </main>
      <SiteFooter />
    </div>
  );
}
