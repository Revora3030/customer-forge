import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { Button } from "@/components/ui/button";
import { CRM_SOLUTIONS } from "@/lib/crm-solutions";
import { GROWTH_SYSTEM } from "@/lib/offer";
import { breadcrumbSchema, canonicalLink, ogUrl } from "@/lib/seo";

const TITLE = `CRM Software for Contractors & Trades | Revora`;
const DESCRIPTION = `CRM software for contractors and trades: capture leads, send quotes, book jobs, follow up automatically and collect reviews.`;

export const Route = createFileRoute("/crm/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ogUrl("/crm"),
    ],
    links: [canonicalLink("/crm")],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(
          breadcrumbSchema([
            { name: "Revora", path: "/" },
            { name: "CRM by trade", path: "/crm" },
          ]),
        ),
      },
    ],
  }),
  component: CrmHubPage,
});

function CrmHubPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
        <h1 className="font-display text-[clamp(1.7rem,4.4vw,2.5rem)] leading-tight font-semibold">
          CRM software for contractors and trades
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
          A CRM only pays for itself when it matches how your trade actually works. An electrician
          juggles same-day service calls against panel estimates decided next week. A roofer waits
          on insurance. A landscaper lives or dies on spring renewals. Below is how the Revora
          system handles each one — including, on every page, where a different tool would serve you
          better.
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
          Every version includes the same complete system: your website, lead capture, instant
          quotes, online booking, a customer pipeline, automatic follow-up, review collection, local
          SEO and reporting. {GROWTH_SYSTEM.explainer}
        </p>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {CRM_SOLUTIONS.map((solution) => (
            <Link
              key={solution.slug}
              to="/crm/$trade"
              params={{ trade: solution.slug }}
              className="group rounded-2xl border border-border/60 bg-card/40 p-5 transition-colors hover:border-primary/50"
            >
              <h2 className="font-display text-[17px] font-semibold">{solution.heading}</h2>
              <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-muted-foreground">
                {solution.intro}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-primary">
                Read more
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>

        <section className="mt-12 rounded-2xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="font-display text-[18px] font-semibold">
            One honest limit, stated up front
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            This is not construction project management software. It does not run submittals, RFIs,
            change orders or progress billing. It handles getting and converting work — the website,
            the leads, the quotes, the follow-up and the reviews — and plenty of businesses run it
            alongside a project management tool.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/get-started">{GROWTH_SYSTEM.ctaShort}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
        </section>

        <nav className="mt-10 flex flex-wrap gap-4 text-[13px] text-muted-foreground">
          <Link to="/crm-for-contractors" className="hover:text-primary">
            CRM for contractors overview
          </Link>
          <Link to="/compare" className="hover:text-primary">
            Compare the alternatives
          </Link>
          <Link to="/guides" className="hover:text-primary">
            Guides
          </Link>
        </nav>
      </main>
      <SiteFooter />
    </div>
  );
}
