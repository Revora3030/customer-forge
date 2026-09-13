import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { GrowthAssessment } from "@/components/marketing/GrowthAssessment";
import { Pill } from "@/components/app/Bits";
import { canonicalLink, ogUrl } from "@/lib/seo";

export const Route = createFileRoute("/growth-assessment")({
  head: () => ({
    meta: [
      { title: "Free Growth Assessment | Revora" },
      {
        name: "description",
        content:
          "Take Revora's free 2-minute Growth Assessment and see the revenue your funnel is leaking — website, quotes, booking, follow-up and local SEO.",
      },
      { property: "og:title", content: "Free Growth Assessment — score your customer acquisition" },
      {
        property: "og:description",
        content:
          "Answer 10 quick questions and get your Revora Growth Score, your biggest gaps and an estimate of the revenue slipping past your business each month.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ogUrl("/growth-assessment"),
    ],
    links: [canonicalLink("/growth-assessment")],
  }),
  component: GrowthAssessmentPage,
});

function GrowthAssessmentPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <section className="hero-aura border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-12 lg:py-16">
            <Pill tone="signal">Free · 2 minutes · No card</Pill>
            <h1 className="mt-5 max-w-3xl font-display text-[clamp(1.9rem,4.4vw,3rem)] leading-[1.06] font-semibold tracking-tight">
              Find out how many customers your business is{" "}
              <span className="gold-text">losing every month</span>.
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              Answer a few questions about how leads reach you today. You'll get a Growth Score, the
              exact gaps costing you jobs, and an estimate of the revenue slipping through them —
              emailed to you instantly.
            </p>
          </div>
        </section>
        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-12 lg:py-14">
            <GrowthAssessment mode="assessment" />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
