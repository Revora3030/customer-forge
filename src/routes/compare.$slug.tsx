import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { RelatedLinks } from "@/components/marketing/SeoLinks";
import { Button } from "@/components/ui/button";
import { findComparison, type Comparison } from "@/lib/compare";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import { SeoMarkdown } from "@/components/marketing/SeoMarkdown";
import { safeJsonLd } from "@/lib/json-ld";
import { breadcrumbSchema, canonicalLink, ogUrl, metaDescription, OG_IMAGE_META } from "@/lib/seo";

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
        { name: "description", content: metaDescription(comparison.description) },
        { property: "og:title", content: comparison.title },
        { property: "og:description", content: comparison.description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
        ogUrl(path),
        ...OG_IMAGE_META,
      ],
      links: [canonicalLink(path)],
      scripts: [
        {
          type: "application/ld+json",
          children: safeJsonLd(
            breadcrumbSchema([
              { name: "Revora", path: "/" },
              { name: "Comparisons", path: "/compare" },
              { name: comparison.label, path },
            ]),
          ),
        },
        ...(comparison.faqs.length > 0
          ? [
              {
                type: "application/ld+json",
                children: safeJsonLd({
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: comparison.faqs.map((f) => ({
                    "@type": "Question",
                    name: f.q,
                    acceptedAnswer: { "@type": "Answer", text: f.a },
                  })),
                }),
              },
            ]
          : []),
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
          <Link to="/compare" className="inline-flex min-h-11 items-center hover:text-primary">
            Comparisons
          </Link>
          <span aria-hidden> / </span>
          <span className="text-foreground">{comparison.label}</span>
        </nav>
        <h1 className="mt-4 font-editorial text-balance text-[clamp(1.7rem,4vw,2.4rem)] leading-tight">
          {comparison.heading}
        </h1>
        <SeoMarkdown source={comparison.body} />

        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/get-started">Start free for {GROWTH_SYSTEM.fullAccessWindow}</Link>
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
