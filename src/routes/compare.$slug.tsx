import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { RelatedLinks } from "@/components/marketing/SeoLinks";
import { Button } from "@/components/ui/button";
import { findComparison, type Comparison } from "@/lib/compare";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import { breadcrumbSchema, canonicalLink, ogUrl } from "@/lib/seo";

export const Route = createFileRoute("/compare/$slug")({
  beforeLoad: ({ params }) => {
    const comparison = findComparison(params.slug);
    if (!comparison) throw notFound();
    return { comparison };
  },
  head: ({ match }) => {
    const comparison = (match.context as { comparison?: Comparison }).comparison;
    if (!comparison) {
      return {
        meta: [{ title: "Page not found — Revora" }, { name: "robots", content: "noindex" }],
      };
    }
    const path = `/compare/${comparison.slug}`;
    return {
      meta: [
        { title: comparison.title },
        { name: "description", content: comparison.description },
        { property: "og:title", content: comparison.title },
        { property: "og:description", content: comparison.description },
        { property: "og:type", content: "article" },
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
              { name: "Comparisons", path: "/compare" },
              { name: comparison.label, path },
            ]),
          ),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: comparison.faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        },
      ],
    };
  },
  component: ComparePage,
});

function ComparePage() {
  const { comparison } = Route.useRouteContext() as { comparison: Comparison };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <Link to="/compare" className="hover:text-primary">
            Comparisons
          </Link>
          <span aria-hidden> / </span>
          <span className="text-foreground">{comparison.label}</span>
        </nav>
        <h1 className="mt-4 font-display text-[clamp(1.7rem,4vw,2.4rem)] leading-tight font-semibold">
          {comparison.heading}
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{comparison.intro}</p>

        <div className="mt-8 overflow-x-auto rounded-2xl border border-border/60">
          <table className="w-full min-w-[560px] text-left text-[14px]">
            <caption className="sr-only">Revora compared with {comparison.otherName}</caption>
            <thead className="bg-card/60 text-[13px]">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Factor
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-primary">
                  Revora
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {comparison.otherName}
                </th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => (
                <tr key={row.factor} className="border-t border-border/50 align-top">
                  <th scope="row" className="px-4 py-3 font-medium">
                    {row.factor}
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">{row.revora}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.other}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-8 rounded-2xl border border-border/60 bg-card/40 p-5">
          <h2 className="font-display text-[17px] font-semibold">
            When {comparison.otherName.toLowerCase()} is the better choice
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            {comparison.whenOther}
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-[19px] font-semibold">Common questions</h2>
          <div className="mt-4 space-y-3">
            {comparison.faqs.map((faq) => (
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

        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/get-started">Start free for 3 days</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/pricing">
              {usdExact(GROWTH_SYSTEM.setupPrice)} setup · {usdExact(GROWTH_SYSTEM.monthlyPrice)}/mo
            </Link>
          </Button>
        </div>
        <RelatedLinks path={`/compare/${comparison.slug}`} />
      </main>
      <SiteFooter />
    </div>
  );
}
