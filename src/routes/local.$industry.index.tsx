import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { Button } from "@/components/ui/button";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import { breadcrumbSchema, canonicalLink, ogUrl } from "@/lib/seo";
import { findLocalIndustry, localPath, type LocalIndustry } from "@/lib/local-pages";
import { US_STATES } from "@/lib/us-states";

export const Route = createFileRoute("/local/$industry/")({
  beforeLoad: ({ params }) => {
    const industry = findLocalIndustry(params.industry);
    if (!industry) throw notFound();
    return { industry };
  },
  head: ({ match }) => {
    const industry = (match.context as { industry?: LocalIndustry }).industry;
    if (!industry) {
      return {
        meta: [{ title: "Page not found — Revora" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${industry.name} websites, quotes & lead generation — every US state | Revora`;
    const description = `Revora builds ${industry.name.toLowerCase()} businesses a complete customer acquisition system — website, instant quotes, booking, CRM, follow-up and reviews. Choose your state. ${usdExact(GROWTH_SYSTEM.setupPrice)} setup, first month free, then ${usdExact(GROWTH_SYSTEM.monthlyPrice)}/month.`;
    const path = localPath(industry.slug);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
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
              { name: "Local growth systems", path: "/local" },
              { name: industry.name, path },
            ]),
          ),
        },
      ],
    };
  },
  component: LocalIndustryHub,
});

function LocalIndustryHub() {
  const { industry } = Route.useRouteContext() as { industry: LocalIndustry };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <Link to="/local" className="hover:text-primary">
            Local growth systems
          </Link>
          <span aria-hidden> / </span>
          <span className="text-foreground">{industry.name}</span>
        </nav>
        <h1 className="mt-4 font-display text-[clamp(1.7rem,4vw,2.5rem)] leading-tight font-semibold">
          <span className="gold-hl">{industry.name}</span> growth systems, state by state
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Revora gives {industry.name.toLowerCase()} businesses the full system: a fast local
          website, instant quotes based on {industry.quoteInputs.slice(0, 3).join(", ")}, online
          booking, a CRM that holds every lead and follow-up that runs while you work. Pick your
          state to see how it applies where you operate.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/get-started">Start your system</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/pricing">
              {usdExact(GROWTH_SYSTEM.setupPrice)} setup · {usdExact(GROWTH_SYSTEM.monthlyPrice)}/mo
            </Link>
          </Button>
        </div>

        <h2 className="mt-12 font-display text-[19px] font-semibold">All 50 states plus DC</h2>
        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          {US_STATES.map((state) => (
            <li key={state.slug}>
              <Link
                to="/local/$industry/$state"
                params={{ industry: industry.slug, state: state.slug }}
                className="text-[14px] text-muted-foreground hover:text-primary"
              >
                {industry.name} in {state.name}
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
