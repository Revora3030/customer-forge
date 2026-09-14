import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { RelatedLinks } from "@/components/marketing/SeoLinks";
import { Button } from "@/components/ui/button";
import { findGuide, type Guide } from "@/lib/guides";
import { BUSINESS } from "@/lib/business-identity";
import { breadcrumbSchema, canonicalLink, ogUrl, SITE_URL } from "@/lib/seo";

export const Route = createFileRoute("/guides/$slug")({
  beforeLoad: ({ params }) => {
    const guide = findGuide(params.slug);
    if (!guide) throw notFound();
    return { guide };
  },
  head: ({ match }) => {
    const guide = (match.context as { guide?: Guide }).guide;
    if (!guide) {
      return {
        meta: [{ title: "Page not found — Revora" }, { name: "robots", content: "noindex" }],
      };
    }
    const path = `/guides/${guide.slug}`;
    return {
      meta: [
        { title: guide.metaTitle },
        { name: "description", content: guide.description },
        { property: "og:title", content: guide.metaTitle },
        { property: "og:description", content: guide.description },
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
              { name: "Guides", path: "/guides" },
              { name: guide.title, path },
            ]),
          ),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: guide.title,
            description: guide.description,
            author: { "@type": "Organization", name: BUSINESS.legalName, url: SITE_URL },
            publisher: { "@type": "Organization", name: BUSINESS.legalName, url: SITE_URL },
            mainEntityOfPage: `${SITE_URL}${path}`,
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: guide.faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        },
      ],
    };
  },
  component: GuidePage,
});

function GuidePage() {
  const { guide } = Route.useRouteContext() as { guide: Guide };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <Link to="/guides" className="hover:text-primary">
            Guides
          </Link>
          <span aria-hidden> / </span>
          <span className="text-foreground">{guide.title}</span>
        </nav>
        <h1 className="mt-4 font-display text-[clamp(1.6rem,4vw,2.3rem)] leading-tight font-semibold">
          {guide.title}
        </h1>
        <p className="mt-2 text-[13px] text-muted-foreground/80">{guide.readMinutes} min read</p>
        <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">{guide.intro}</p>

        <ol className="mt-9 space-y-6">
          {guide.steps.map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-border/60 bg-card/40 p-5">
              <h2 className="font-display text-[17px] font-semibold">
                <span className="mr-2 text-primary">{i + 1}.</span>
                {step.title}
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>

        <section className="mt-9 rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <h2 className="font-display text-[16px] font-semibold">The short version</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{guide.takeaway}</p>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-[19px] font-semibold">Questions people ask</h2>
          <div className="mt-4 space-y-3">
            {guide.faqs.map((faq) => (
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
          <Button asChild>
            <Link to="/get-started">Have Revora run this for you</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/guides">More guides</Link>
          </Button>
        </div>
        <RelatedLinks path={`/guides/${guide.slug}`} />
      </main>
      <SiteFooter />
    </div>
  );
}
