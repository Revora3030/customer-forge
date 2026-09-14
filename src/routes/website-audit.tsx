import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { GrowthAssessment } from "@/components/marketing/GrowthAssessment";
import { Panel, Pill } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { canonicalLink, ogUrl } from "@/lib/seo";

export const Route = createFileRoute("/website-audit")({
  head: () => ({
    meta: [
      { title: "Free Website Audit for Local Businesses | Revora" },
      {
        name: "description",
        content:
          "Get a free Revora website audit: conversion, mobile, speed, local SEO and lead capture — see what turns visitors into customers.",
      },
      { property: "og:title", content: "Free website audit for local businesses" },
      {
        property: "og:description",
        content:
          "See what your current website is costing you — conversion, mobile, speed, local SEO, lead capture, quotes and booking, reviewed in minutes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ogUrl("/website-audit"),
    ],
    links: [canonicalLink("/website-audit")],
  }),
  component: WebsiteAuditPage,
});

const CHECKED = [
  { title: "Conversion", body: "Are call, quote and book actions obvious on every screen?" },
  { title: "Mobile", body: "Does it work one-handed, where most local searches happen?" },
  { title: "Speed & trust", body: "Load time, licensing, reviews and proof above the fold." },
  { title: "Local SEO", body: "Service and city pages, schema, sitemap, map presence." },
  { title: "Lead capture", body: "Forms that qualify, instant quotes, chat and callbacks." },
  { title: "Follow-through", body: "What happens after the lead — reply speed, booking, reviews." },
];

function WebsiteAuditPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="hero-aura border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-12 lg:py-16">
            <Pill tone="signal">Free website audit</Pill>
            <h1 className="mt-5 max-w-3xl font-display text-[clamp(1.9rem,4.4vw,3rem)] leading-[1.06] font-semibold tracking-tight">
              Your website looks fine. Is it{" "}
              <span className="gold-text">actually booking work</span>?
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              Tell us what your site does today and we'll audit it against the things that decide
              whether a visitor becomes a paying customer — then show you exactly what to fix first.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CHECKED.map((item) => (
                <Panel key={item.title} className="card-lift p-4">
                  <h2 className="font-display text-[13px] font-bold tracking-[0.12em] uppercase">
                    {item.title}
                  </h2>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </Panel>
              ))}
            </div>
          </div>
        </section>
        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-12 lg:py-14">
            <GrowthAssessment mode="audit" />
          </div>
        </section>
        <section className="hero-aura">
          <div className="mx-auto max-w-4xl px-4 py-14 text-center">
            <h2 className="font-display text-[clamp(1.5rem,3vw,2.1rem)] leading-tight font-semibold">
              Skip the fixing — let Revora rebuild it properly.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[14.5px] leading-relaxed text-muted-foreground">
              Revora builds the site, connects the lead capture, quotes, booking, follow-up, reviews
              and analytics, then keeps improving it every month.
            </p>
            <Button
              asChild
              variant="signal"
              size="lg"
              className="mt-7 h-auto py-3 leading-snug whitespace-normal"
            >
              <Link to="/get-started">
                Start 3 free days of full access{" "}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
